import hashlib
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

root = Path(__file__).parent
spec = importlib.util.spec_from_file_location("prepare", root / "prepare.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
spec = importlib.util.spec_from_file_location("export_d1", root / "export_d1.py")
export_d1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export_d1)


class ExportTest(unittest.TestCase):
    def test_roundtrip_preserves_rows_indexes_and_chunks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.sqlite"
            with sqlite3.connect(source) as db:
                db.executescript(prepare.SCHEMA)
                db.execute(
                    "INSERT INTO place VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (1, "São João d'Oeste", "Sao Joao d'Oeste", "BR", "SC", "", "", "",
                     "P", "PPL", -1.0, -2.0, 100, "2026-01-01"),
                )
                db.execute(
                    "INSERT INTO alternate_name VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (42, 1, "pt", "São\nJoão", "sao joao", 1, 0, 0, 0, "", ""),
                )
                db.execute("INSERT INTO search_name VALUES (?,?,?)", (1, "sao joao", 0))
                db.execute("INSERT INTO short_search VALUES (?,?,?)", ("sa", 0, 1))
            output = root / "chunks"
            manifest = export_d1.export(source, output, 700)
            self.assertGreater(len(manifest["files"]), 1)
            self.assertEqual(json.loads((output / "manifest.json").read_text()), manifest)
            with sqlite3.connect(":memory:") as restored:
                restored.execute("PRAGMA foreign_keys=ON")
                for item in manifest["files"]:
                    data = (output / item["name"]).read_bytes()
                    self.assertLessEqual(len(data), 700)
                    self.assertEqual(hashlib.sha256(data).hexdigest(), item["sha256"])
                    restored.executescript(data.decode("utf-8"))
                self.assertEqual(
                    restored.execute("SELECT name FROM place").fetchone()[0], "São João d'Oeste"
                )
                self.assertEqual(
                    restored.execute("SELECT id, name FROM alternate_name").fetchone(),
                    (42, "São\nJoão"),
                )
                self.assertEqual(restored.execute("SELECT count(*) FROM search_name").fetchone()[0], 1)
                self.assertEqual(restored.execute("SELECT place_id FROM short_search").fetchone()[0], 1)
                self.assertIsNotNone(restored.execute(
                    "SELECT name FROM sqlite_master WHERE name='alternate_place_language'"
                ).fetchone())
            with self.assertRaises(FileExistsError):
                export_d1.export(source, output)

    def test_rejects_unrelated_or_empty_database(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.sqlite"
            with sqlite3.connect(source) as db:
                db.execute("CREATE TABLE unrelated (id INTEGER)")
            with self.assertRaises(ValueError):
                export_d1.export(source, root / "output")
            self.assertFalse((root / "output" / "manifest.json").exists())

    def test_rejects_nul_in_text_instead_of_truncating(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.sqlite"
            with sqlite3.connect(source) as db:
                db.executescript(prepare.SCHEMA)
                db.execute(
                    "INSERT INTO place VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (1, "bad\0name", "", "BR", "", "", "", "", "P", "PPL",
                     0, 0, 0, "2026-01-01"),
                )
            with self.assertRaisesRegex(ValueError, "NUL"):
                export_d1.export(source, root / "output")
            self.assertFalse((root / "output" / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
