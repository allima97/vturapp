import importlib.util
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).with_name("prepare.py"))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def zip_file(path, member, content):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(member, content)


def place(ident, name, ascii_name, category, code, country, admin1):
    return "\t".join(
        [str(ident), name, ascii_name, "", "41.9", "12.5", category, code, country,
         "", admin1, "", "", "", "1000", "", "", "", "2026-01-01"]
    ) + "\n"


class PrepareTest(unittest.TestCase):
    def test_imports_ids_languages_and_homonyms(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            places, names, result = root / "places.zip", root / "names.zip", root / "geo.sqlite"
            zip_file(
                places, "allCountries.txt",
                place(1, "Rome", "Rome", "P", "PPLA", "IT", "07")
                + place(2, "Rome", "Rome", "P", "PPL", "US", "GA")
                + place(3, "Lazio", "Lazio", "A", "ADM1", "IT", "07")
                + place(4, "Mountain", "Mountain", "T", "MT", "IT", "07"),
            )
            zip_file(
                names, "alternateNamesV2.txt",
                "10\t1\tpt\tRoma\t1\t\t\t\t\t\n"
                "11\t1\tes\tRoma\t\t\t\t\t\t\n"
                "12\t1\tlink\thttps://example.com\t\t\t\t\t\t\n"
                "13\t4\tpt\tMontanha\t\t\t\t\t\t\n"
                "14\t1\tfa\t\t\t\t\t\t\t\n"
                "15\t1\tpt\tNome Antigo\t\t\t\t1\t\t\n"
                "16\t1\tpt\tApelido\t\t\t1\t\t\t\n",
            )
            self.assertEqual(prepare.prepare(places, names, result), (3, 4, 1))
            with sqlite3.connect(result) as db:
                self.assertEqual(
                    db.execute("SELECT id, country_code FROM place WHERE name='Rome' ORDER BY id").fetchall(),
                    [(1, "IT"), (2, "US")],
                )
                self.assertEqual(
                    db.execute("SELECT id, language, name FROM alternate_name ORDER BY id").fetchall(),
                    [(10, "pt", "Roma"), (11, "es", "Roma"),
                     (15, "pt", "Nome Antigo"), (16, "pt", "Apelido")],
                )
                self.assertEqual(
                    db.execute("SELECT place_id FROM search_name WHERE normalized='roma'").fetchall(),
                    [(1,)],
                )
                self.assertEqual(
                    db.execute("SELECT priority FROM search_name WHERE normalized='roma'").fetchone(),
                    (1,),
                )
                self.assertEqual(
                    db.execute("SELECT count(*) FROM search_name WHERE normalized IN ('apelido', 'nome antigo')").fetchone()[0],
                    0,
                )
                self.assertEqual(
                    db.execute("SELECT place_id FROM short_search WHERE prefix='rom' ORDER BY rank").fetchall(),
                    [(1,), (2,)],
                )
                self.assertIn("PRIMARY KEY", str(db.execute(
                    "EXPLAIN QUERY PLAN SELECT place_id FROM search_name "
                    "WHERE normalized >= ? AND normalized < ?", ("roma", "romb")
                ).fetchall()))
                self.assertIn("place_administrative_lookup", str(db.execute(
                    "EXPLAIN QUERY PLAN SELECT id FROM place WHERE feature_code='ADM1' "
                    "AND country_code=? AND admin1=?", ("IT", "07")
                ).fetchall()))

    def test_short_prefix_is_bounded_without_removing_small_places(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript(prepare.SCHEMA)
            for ident in range(1, 81):
                db.execute(
                    "INSERT INTO place VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (ident, f"Par{ident:03}", "", "BR", "", "", "", "", "P", "PPL",
                     0, 0, ident, "2026-01-01"),
                )
                db.execute("INSERT INTO search_name VALUES (?,?,?)", (ident, f"par{ident:03}", 0))
            prepare.build_short_search(db, hot_prefix_min_names=10)
            self.assertEqual(db.execute(
                "SELECT count(*) FROM short_search WHERE prefix='par'"
            ).fetchone()[0], prepare.SHORT_RESULTS)
            self.assertEqual(db.execute(
                "SELECT place_id FROM short_search WHERE prefix='par' ORDER BY rank LIMIT 1"
            ).fetchone()[0], 80)
            self.assertIsNotNone(db.execute(
                "SELECT place_id FROM search_name WHERE normalized='par001'"
            ).fetchone())
            self.assertEqual(db.execute(
                "SELECT count(*) FROM short_search WHERE prefix='par0'"
            ).fetchone()[0], prepare.SHORT_RESULTS)

    def test_rejects_bad_data_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            places, names, result = root / "places.zip", root / "names.zip", root / "geo.sqlite"
            zip_file(places, "allCountries.txt", "invalid\n")
            zip_file(names, "alternateNamesV2.txt", "")
            with self.assertRaises(ValueError):
                prepare.prepare(places, names, result)
            self.assertFalse(result.exists())
            result.write_text("existing")
            with self.assertRaises(FileExistsError):
                prepare.prepare(places, names, result)
            self.assertEqual(result.read_text(), "existing")

    def test_normalizes_accents_and_spaces(self):
        self.assertEqual(prepare.normalize("  São  PAULO "), "sao paulo")
        self.assertEqual(prepare.normalize("दिल्ली"), "दलल")


if __name__ == "__main__":
    unittest.main()
