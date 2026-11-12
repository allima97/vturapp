import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import incremental


def database(path, rows):
    with sqlite3.connect(path) as db:
        db.execute(
            """CREATE TABLE place (
                id INTEGER PRIMARY KEY, name TEXT, country_code TEXT, admin1 TEXT,
                admin2 TEXT, admin3 TEXT, admin4 TEXT, feature_class TEXT, feature_code TEXT
            )"""
        )
        db.executemany("INSERT INTO place VALUES (?,?,?,?,?,?,?,?,?)", rows)


class IncrementalTests(unittest.TestCase):
    def test_records_removed_and_changed_references_without_reassignment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = root / "old.sqlite"
            current = root / "new.sqlite"
            database(
                previous,
                [
                    (1, "Roma", "IT", "07", "", "", "", "P", "PPL"),
                    (2, "Milao", "IT", "09", "", "", "", "P", "PPL"),
                ],
            )
            database(current, [(1, "Roma Nova", "IT", "07", "", "", "", "P", "PPL")])
            with sqlite3.connect(previous) as old_db, sqlite3.connect(current) as new_db:
                removed, changed = incremental.differences(
                    incremental.places(old_db), incremental.places(new_db)
                )
            self.assertEqual(removed, [2])
            self.assertEqual(changed[0][0], 1)
            self.assertIn("name:", changed[0][1])
            destinations = [
                ("11111111-1111-4111-8111-111111111111", "Praia Azul", 2),
                ("22222222-2222-4222-8222-222222222222", "Centro", 1),
                ("33333333-3333-4333-8333-333333333333", "Intacto", 9),
            ]
            statements = incremental.review_statements(
                destinations, removed, changed, "2026-11-09T00:00:00Z"
            )
            self.assertEqual(statements, incremental.review_statements(
                destinations, removed, changed, "2026-11-09T00:00:00Z"
            ))
            sql = incremental.render_sql(statements)
            self.assertNotIn("UPDATE destinos_personalizados", sql)
            self.assertNotIn("DELETE FROM destinos_personalizados", sql)
            self.assertEqual(sql.count("INSERT OR IGNORE"), 2)
            self.assertIn("nome preservado: Praia Azul", sql)
            app = root / "app.sqlite"
            with sqlite3.connect(app) as db:
                db.executescript(
                    """
                    CREATE TABLE destinos_personalizados (
                      id TEXT PRIMARY KEY, nome TEXT, referencia_geonames_id INTEGER
                    );
                    INSERT INTO destinos_personalizados VALUES
                      ('11111111-1111-4111-8111-111111111111', 'Praia Azul', 2);
                    CREATE TABLE destinos_revisao_geonames (
                      id TEXT PRIMARY KEY,
                      destino_personalizado_id TEXT,
                      referencia_geonames_id INTEGER,
                      tipo TEXT,
                      resumo TEXT,
                      detectado_em TEXT,
                      status TEXT,
                      UNIQUE (destino_personalizado_id, referencia_geonames_id, tipo, resumo)
                    );
                    """
                )
                db.executescript(sql)
                db.executescript(sql)
                stored = db.execute(
                    "SELECT nome, referencia_geonames_id FROM destinos_personalizados"
                ).fetchone()
                reviews = db.execute("SELECT count(*) FROM destinos_revisao_geonames").fetchone()[0]
            self.assertEqual(stored, ("Praia Azul", 2))
            self.assertEqual(reviews, 2)

    def test_cli_refuses_to_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = root / "old.sqlite"
            current = root / "new.sqlite"
            database(previous, [(1, "Roma", "IT", "", "", "", "", "P", "PPL")])
            database(current, [(1, "Roma", "IT", "", "", "", "", "P", "PPL")])
            destinations = root / "destinos.json"
            destinations.write_text(json.dumps([]), encoding="utf-8")
            output = root / "revisao.sql"
            output.write_text("existing", encoding="utf-8")
            code = __import__("subprocess").run(
                [
                    "python3",
                    str(Path(incremental.__file__)),
                    "--previous",
                    str(previous),
                    "--current",
                    str(current),
                    "--destinations",
                    str(destinations),
                    "--output",
                    str(output),
                    "--detected-at",
                    "2026-11-09T00:00:00Z",
                ],
                check=False,
            ).returncode
            self.assertEqual(code, 1)
            self.assertEqual(output.read_text(encoding="utf-8"), "existing")


if __name__ == "__main__":
    unittest.main()
