#!/usr/bin/env bash
# Idempotent remote steps for the isolated GeoNames environment.
# Run this on a machine logged into Wrangler. It refuses staging and production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_NAME="geo"
APP_DB="vturapp-db-geo-isolado"
GEO_DB="vturapp-geonames-isolado"
SENTINEL_APP="00000000-0000-4000-8000-0000000000a1"
SENTINEL_GEO="00000000-0000-4000-8000-0000000000a2"
PRODUCTION_IDS="36d3da2e-b186-48f8-bb3e-4f9a14b20235 96c13e55-60e3-4e3b-9ecc-b22da019c010"
LEDGER="${GEO_LEDGER:-$ROOT/.geonames-isolated-ledger}"
SQL_DIR="${GEO_SQL_DIR:-$ROOT/geonames-sql}"

step="${1:-help}"

refuse() {
  echo "Recusado: $1" >&2
  exit 1
}

toml_id() {
  local name="$1"
  awk -v name="$name" '
    $0 ~ /^\[\[?env\.geo/ { in_env=1; next }
    $0 ~ /^\[/ && $0 !~ /^\[\[?env\.geo/ { in_env=0 }
    in_env && $0 ~ "database_name = \"" name "\"" { found=1; next }
    in_env && found && $0 ~ /database_id/ {
      gsub(/.*database_id = "|".*/, "", $0)
      print
      exit
    }
  ' wrangler.toml
}

guard() {
  case "$ENV_NAME" in
    production|staging|prod) refuse "o ambiente $ENV_NAME é proibido" ;;
  esac
  local app_id geo_id
  app_id="$(toml_id "$APP_DB")"
  geo_id="$(toml_id "$GEO_DB")"
  [[ -n "$app_id" && -n "$geo_id" ]] || refuse "não encontrei os bancos do env.geo em wrangler.toml"
  for id in $PRODUCTION_IDS; do
    [[ "$app_id" != "$id" && "$geo_id" != "$id" ]] || refuse "o toml aponta para um banco de staging ou produção"
  done
  if [[ "${REQUIRE_REAL_IDS:-0}" == 1 ]]; then
    [[ "$app_id" != "$SENTINEL_APP" && "$geo_id" != "$SENTINEL_GEO" ]] ||
      refuse "substitua os ids sentinela pelos ids criados com wrangler d1 create"
  fi
}

create_one() {
  local name="$1"
  if wrangler d1 list --json | python3 -c 'import json,sys; name=sys.argv[1]; data=json.load(sys.stdin); raise SystemExit(0 if any(db.get("name")==name or db.get("database_name")==name for db in data) else 1)' "$name"; then
    echo "D1 $name já existe."
  else
    wrangler d1 create "$name"
    echo "Copie o database_id de $name para wrangler.toml em [env.geo]."
  fi
}

cmd_create() {
  guard
  create_one "$APP_DB"
  create_one "$GEO_DB"
}

cmd_migrate() {
  REQUIRE_REAL_IDS=1 guard
  wrangler d1 migrations apply "$APP_DB" --remote --env "$ENV_NAME"
  echo "Migrações do banco isolado aplicadas, inclusive 0019–0024. Produção e staging não foram usados."
}

cmd_cost() {
  local source="${1:-${GEO_SOURCE:-$ROOT/geonames.sqlite}}"
  python3 scripts/geonames/cost.py --source "$source"
}

cmd_load() {
  REQUIRE_REAL_IDS=1 guard
  [[ -d "$SQL_DIR" ]] || refuse "diretório SQL ausente: $SQL_DIR"
  [[ -f "$SQL_DIR/manifest.json" ]] || refuse "manifest.json ausente em $SQL_DIR"
  mkdir -p "$(dirname "$LEDGER")"
  touch "$LEDGER"
  python3 - <<'PY' "$SQL_DIR/manifest.json"
import hashlib, json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
root = pathlib.Path(sys.argv[1]).parent
for item in manifest["files"]:
    data = (root / item["name"]).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != item["sha256"] or len(data) != item["bytes"]:
        raise SystemExit(f"checksum divergente: {item['name']}")
print(f"Manifest conferido: {len(manifest['files'])} arquivos.")
PY
  local file
  for file in $(python3 -c 'import json,sys; print("\n".join(item["name"] for item in json.load(open(sys.argv[1]))["files"]))' "$SQL_DIR/manifest.json"); do
    if grep -Fxq "$file" "$LEDGER"; then
      echo "Já importado: $file"
      continue
    fi
    echo "Importando $file"
    wrangler d1 execute "$GEO_DB" --remote --env "$ENV_NAME" --file "$SQL_DIR/$file"
    echo "$file" >> "$LEDGER"
  done
}

cmd_verify() {
  REQUIRE_REAL_IDS=1 guard
  wrangler d1 execute "$GEO_DB" --remote --env "$ENV_NAME" --command \
    "SELECT 'place' AS tabela, count(*) AS linhas FROM place
     UNION ALL SELECT 'alternate_name', count(*) FROM alternate_name
     UNION ALL SELECT 'search_name', count(*) FROM search_name
     UNION ALL SELECT 'short_search', count(*) FROM short_search;"
  wrangler d1 execute "$GEO_DB" --remote --env "$ENV_NAME" --command \
    "SELECT feature_class, count(*) AS linhas FROM place GROUP BY feature_class ORDER BY feature_class;"
  wrangler d1 execute "$GEO_DB" --remote --env "$ENV_NAME" --command \
    "SELECT count(*) AS lugares_sem_pais FROM place WHERE country_code = '';"
}

cmd_benchmark() {
  REQUIRE_REAL_IDS=1 guard
  for query in \
    "SELECT p.id FROM short_search s JOIN place p ON p.id = s.place_id WHERE s.prefix = 'rom' ORDER BY s.rank LIMIT 8;" \
    "SELECT p.id FROM search_name n JOIN place p ON p.id = n.place_id WHERE n.normalized >= 'roma' AND n.normalized < 'roma' || char(1114111) AND p.feature_class = 'P' GROUP BY p.id ORDER BY p.population DESC LIMIT 8;" \
    "SELECT id, name, country_code FROM place WHERE id = 3169070;"
  do
    wrangler d1 execute "$GEO_DB" --remote --env "$ENV_NAME" --command "$query" --json
  done
}

cmd_rollback() {
  guard
  [[ "${CONFIRM_GEO_ROLLBACK:-}" == "yes" ]] ||
    refuse "defina CONFIRM_GEO_ROLLBACK=yes para apagar somente os D1 isolados"
  wrangler d1 delete "$GEO_DB" --skip-confirmation || true
  wrangler d1 delete "$APP_DB" --skip-confirmation || true
  echo "Bancos isolados removidos. Staging e produção não foram alterados."
}

case "$step" in
  create) cmd_create ;;
  migrate) cmd_migrate ;;
  cost) cmd_cost "${2:-}" ;;
  load) cmd_load ;;
  verify) cmd_verify ;;
  benchmark) cmd_benchmark ;;
  rollback) cmd_rollback ;;
  *)
    cat <<EOF
Uso: scripts/geonames/isolated.sh <create|migrate|cost|load|verify|benchmark|rollback>

Ordem: create, editar os ids no wrangler.toml, migrate, cost, exportar o SQL,
load, verify, benchmark. rollback apaga apenas vturapp-db-geo-isolado e
vturapp-geonames-isolado.
EOF
    ;;
esac
