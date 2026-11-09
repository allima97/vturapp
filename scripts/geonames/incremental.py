#!/usr/bin/env python3
"""Record GeoNames reference changes without reassigning custom destinations.

Compares two prepared SQLite databases and emits idempotent SQL for
destinos_revisao_geonames. It never updates destinos_personalizados.
"""

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path


FIELDS = (
    "name",
    "country_code",
    "admin1",
    "admin2",
    "admin3",
    "admin4",
    "feature_class",
    "feature_code",
)


def connect(path):
    if not Path(path).is_file():
        raise ValueError(f"Database not found: {path}")
    db = sqlite3.connect(f"{Path(path).resolve().as_uri()}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    return db


def places(db):
    columns = ", ".join(FIELDS)
    return {
        row[0]: tuple(row[1:])
        for row in db.execute(f"SELECT id, {columns} FROM place")
    }


def differences(previous, current):
    removed = []
    changed = []
    for ident, before in previous.items():
        after = current.get(ident)
        if after is None:
            removed.append(ident)
        elif before != after:
            summary = "; ".join(
                f"{field}: {before[index]!r} -> {after[index]!r}"
                for index, field in enumerate(FIELDS)
                if before[index] != after[index]
            )
            changed.append((ident, summary))
    removed.sort()
    changed.sort()
    return removed, changed


def review_statements(destinations, removed, changed, detected_at):
    removed_ids = set(removed)
    changed_by_id = dict(changed)
    statements = []
    for destination_id, name, reference_id in destinations:
        if reference_id in removed_ids:
            kind, summary = "removida", f"referência {reference_id} removida; nome preservado: {name}"
        elif reference_id in changed_by_id:
            kind, summary = "alterada", changed_by_id[reference_id]
        else:
            continue
        identity = hashlib.sha256(
            f"{destination_id}|{reference_id}|{kind}|{summary}".encode()
        ).hexdigest()
        statements.append(
            (
                "INSERT OR IGNORE INTO destinos_revisao_geonames "
                "(id, destino_personalizado_id, referencia_geonames_id, tipo, resumo, detectado_em, status) "
                "VALUES (?, ?, ?, ?, ?, ?, 'pendente');",
                (identity, destination_id, reference_id, kind, summary, detected_at),
            )
        )
    return statements


def sql_literal(value):
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def render_sql(statements):
    lines = [
        "-- Revisão manual. Não reatribui destinos_personalizados.",
        "BEGIN;",
    ]
    for sql, values in statements:
        rendered = sql
        for value in values:
            rendered = rendered.replace("?", sql_literal(value), 1)
        lines.append(rendered)
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def load_destinations(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    destinations = []
    for item in data:
        destinations.append(
            (str(item["id"]), str(item["nome"]), int(item["referencia_geonames_id"]))
        )
    return destinations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", required=True, help="Prepared SQLite before the update")
    parser.add_argument("--current", required=True, help="Prepared SQLite after the update")
    parser.add_argument("--destinations", required=True, help="JSON export of custom destinations")
    parser.add_argument("--output", required=True, help="SQL file to create; must not exist")
    parser.add_argument("--detected-at", required=True, help="UTC timestamp stored with the review")
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        print("Incremental SQL already exists; refusing to overwrite.", file=sys.stderr)
        return 1
    try:
        with connect(args.previous) as previous_db, connect(args.current) as current_db:
            removed, changed = differences(places(previous_db), places(current_db))
        statements = review_statements(
            load_destinations(args.destinations), removed, changed, args.detected_at
        )
        output.write_text(render_sql(statements), encoding="utf-8")
    except (OSError, ValueError, sqlite3.Error, KeyError, json.JSONDecodeError) as exc:
        print(f"Incremental review failed: {exc}", file=sys.stderr)
        return 1
    print(f"Recorded {len(statements)} review rows in {output}")
    print("No custom destination was reassigned.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
