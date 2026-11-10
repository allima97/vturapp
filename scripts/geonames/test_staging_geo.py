import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOML = (ROOT / "wrangler.toml").read_text(encoding="utf-8")
SCRIPT = (ROOT / "scripts/geonames/isolated.sh").read_text(encoding="utf-8")
PACKAGE = (ROOT / "package.json").read_text(encoding="utf-8")
GEO_ID = "bf40654b-8083-4fa1-8424-a923282d9888"
STAGING_DB = "96c13e55-60e3-4e3b-9ecc-b22da019c010"
PRODUCTION_DB = "36d3da2e-b186-48f8-bb3e-4f9a14b20235"


def between(start: str, end: str) -> str:
    if start not in TOML or end not in TOML.split(start, 1)[1]:
        raise AssertionError(f"trecho {start!r} ausente")
    return TOML.split(start, 1)[1].split(end, 1)[0]


class StagingGeoTests(unittest.TestCase):
    def test_staging_reads_the_loaded_reference_database(self):
        staging = between("[env.staging]\n", "\n# ───")
        self.assertIn('database_name = "vturapp-db-staging"', staging)
        self.assertIn(f'database_id = "{STAGING_DB}"', staging)
        self.assertIn('binding = "GEO_DB"', staging)
        self.assertIn('database_name = "vturapp-geonames-isolado"', staging)
        self.assertIn(f'database_id = "{GEO_ID}"', staging)
        self.assertIn('PUBLIC_DEPLOY_ENV = "staging"', staging)
        self.assertIn('PUBLIC_GEONAMES_ATIVO = "1"', staging)

    def test_root_production_reads_the_loaded_reference_database(self):
        root = TOML.split("\n[env.staging]\n", 1)[0]
        self.assertIn('name = "vturapp"', root)
        self.assertIn('database_name = "vturapp-db"', root)
        self.assertIn(f'database_id = "{PRODUCTION_DB}"', root)
        self.assertIn('id = "60fa423718914712bec4f489d41c3dd6"', root)
        self.assertIn('bucket_name = "vturapp-files"', root)
        self.assertIn('crons = ["*/5 * * * *", "7 6 * * *"]', root)
        self.assertIn('binding = "GEO_DB"', root)
        self.assertIn('database_name = "vturapp-geonames-isolado"', root)
        self.assertIn(f'database_id = "{GEO_ID}"', root)
        geo = root.split('binding = "GEO_DB"', 1)[1].split("[", 1)[0]
        self.assertNotIn("migrations_dir", geo)
        self.assertIn('PUBLIC_DEPLOY_ENV = "production"', root)
        self.assertIn('PUBLIC_GEONAMES_ATIVO = "1"', root)
        self.assertIn(
            '"cf:deploy": "PUBLIC_DEPLOY_ENV=production PUBLIC_GEONAMES_ATIVO=1 npm run cf:build && npx wrangler deploy"',
            PACKAGE,
        )

    def test_loader_never_writes_through_staging_or_production(self):
        commands = "\n".join(line.split("#", 1)[0] for line in SCRIPT.splitlines())
        self.assertNotIn("--env staging", commands)
        self.assertNotIn("--env production", commands)
        self.assertNotIn("vturapp-db-staging", commands)
        self.assertNotIn("vturapp-db\"", commands)
        self.assertIn('ENV_NAME="geo"', commands)
        self.assertIn("production|staging|prod", commands)
        self.assertIn(GEO_ID, commands)


if __name__ == "__main__":
    unittest.main()
