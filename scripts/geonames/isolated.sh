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
EXPECTED_APP="4f480221-b5e7-4639-9e28-d995b9615f7f"
EXPECTED_GEO="bf40654b-8083-4fa1-8424-a923282d9888"
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
  [[ "$app_id" != "$SENTINEL_APP" && "$geo_id" != "$SENTINEL_GEO" ]] ||
    refuse "os ids sentinela não podem ser usados em comando remoto"
  if [[ "${REQUIRE_REAL_IDS:-0}" == 1 ]]; then
    [[ "$app_id" == "$EXPECTED_APP" && "$geo_id" == "$EXPECTED_GEO" ]] ||
      refuse "env.geo precisa dos bancos isolados criados em 9/11/2026"
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

d1_read() {
  local sql="$1"
  local attempt=1
  local delay=10
  local output status
  while true; do
    set +e
    output=$(wrangler d1 execute "$GEO_DB" --remote --env "$ENV_NAME" --command "$sql" 2>&1)
    status=$?
    set -e
    if [[ $status -eq 0 ]] && ! printf '%s\n' "$output" | grep -Eq 'overloaded|\[7429\]'; then
      printf '%s\n' "$output"
      return 0
    fi
    if [[ $status -ne 0 ]] && ! printf '%s\n' "$output" | grep -Eq 'overloaded|\[7429\]|timeout|temporar'; then
      printf '%s\n' "$output" >&2
      return "$status"
    fi
    if [[ $attempt -ge 5 ]]; then
      printf '%s\n' "$output" >&2
      refuse "consulta interrompida depois de ${attempt} tentativas"
    fi
    echo "D1 ocupado (tentativa ${attempt}); nova tentativa em ${delay}s." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

cmd_verify() {
  REQUIRE_REAL_IDS=1 guard
  local queries=(
    "SELECT 'place' AS tabela, count(*) AS linhas FROM place;"
    "SELECT 'alternate_name' AS tabela, count(*) AS linhas FROM alternate_name;"
    "SELECT 'search_name' AS tabela, count(*) AS linhas FROM search_name;"
    "SELECT 'short_search' AS tabela, count(*) AS linhas FROM short_search;"
    "SELECT feature_class, count(*) AS linhas FROM place GROUP BY feature_class ORDER BY feature_class;"
    "SELECT count(*) AS lugares_sem_pais FROM place WHERE country_code = '';"
  )
  local sql index=0
  for sql in "${queries[@]}"; do
    if [[ $index -gt 0 ]]; then
      echo "Pausa de 20s antes da próxima varredura." >&2
      sleep 20
    fi
    d1_read "$sql"
    index=$((index + 1))
  done
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
  REQUIRE_REAL_IDS=1 guard
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

Ordem já executada em 9/11/2026: create, migrate, cost, exportar o SQL, load,
verify, benchmark. Os ids isolados estão em wrangler.toml. rollback apaga
apenas vturapp-db-geo-isolado e vturapp-geonames-isolado.
EOF
    ;;
esac
