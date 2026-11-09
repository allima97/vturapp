#!/usr/bin/env python3
"""Estimate one GeoNames D1 load from a prepared SQLite file.

Prices, checked on 9 November 2026:
- Workers Paid minimum: USD 5 / month
  https://developers.cloudflare.com/workers/platform/pricing/
- D1 Paid: 50 million rows written included, then USD 1 / million;
  25 billion rows read included, then USD 0.001 / million;
  5 GB included, then USD 0.75 / GB-month.
  https://developers.cloudflare.com/d1/platform/pricing/
Indexes add one written row per indexed row:
https://developers.cloudflare.com/d1/platform/pricing/
"""

import argparse
import json
import sqlite3
import sys


INCLUDED_WRITES = 50_000_000
INCLUDED_READS = 25_000_000_000
INCLUDED_STORAGE_GB = 5
WORKERS_PAID = 5.0
WRITE_PRICE = 1.0
READ_PRICE = 0.001
STORAGE_PRICE = 0.75
CEILING = 20.0
MARGIN = 1.2


def counts(db):
    tables = {}
    for table in ("place", "alternate_name", "search_name", "short_search"):
        tables[table] = db.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
    indexes = [
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
        )
    ]
    page_size = db.execute("PRAGMA page_size").fetchone()[0]
    page_count = db.execute("PRAGMA page_count").fetchone()[0]
    return tables, indexes, page_size * page_count


def writes(tables):
    # Inserts happen before the secondary CREATE INDEX statements.
    # WITHOUT ROWID unique indexes exist at insert time.
    return {
        "place": tables["place"] * 2,
        "alternate_name": tables["alternate_name"] * 2,
        "search_name": tables["search_name"],
        "short_search": tables["short_search"] * 2,
    }


def scenario(tables, storage_bytes, label, read_rows):
    written = sum(writes(tables).values())
    billed_writes = max(0, written - INCLUDED_WRITES)
    billed_reads = max(0, read_rows - INCLUDED_READS)
    storage_gb = storage_bytes / (1024 ** 3)
    billed_storage = max(0, storage_gb - INCLUDED_STORAGE_GB)
    d1 = (
        billed_writes / 1_000_000 * WRITE_PRICE
        + billed_reads / 1_000_000 * READ_PRICE
        + billed_storage * STORAGE_PRICE
    )
    margin_writes = int(written * MARGIN)
    margin_d1 = (
        max(0, margin_writes - INCLUDED_WRITES) / 1_000_000 * WRITE_PRICE
        + billed_reads / 1_000_000 * READ_PRICE
        + max(0, storage_gb * MARGIN - INCLUDED_STORAGE_GB) * STORAGE_PRICE
    )
    base = WORKERS_PAID + d1
    with_margin = WORKERS_PAID + margin_d1
    return {
        "cenario": label,
        "linhas": tables,
        "escritas": written,
        "escritas_com_margem": margin_writes,
        "escritas_por_tabela": writes(tables),
        "leituras_previstas": read_rows,
        "armazenamento_gb": round(storage_gb, 3),
        "d1_usd": round(d1, 2),
        "com_plano_usd": round(base, 2),
        "com_margem_usd": round(with_margin, 2),
        "cabe_no_teto": with_margin <= CEILING,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--reads", type=int, default=2_000_000)
    args = parser.parse_args()
    try:
        with sqlite3.connect(f"file:{args.source}?mode=ro", uri=True) as db:
            tables, indexes, storage = counts(db)
            reductions = []
            for minimum in (0, 1000, 10000):
                if minimum == 0:
                    subset = tables
                    label = "base completa"
                else:
                    places = db.execute(
                        "SELECT count(*) FROM place WHERE feature_class != 'P' OR population >= ?",
                        (minimum,),
                    ).fetchone()[0]
                    names = db.execute(
                        """SELECT count(*) FROM search_name
                           WHERE place_id IN (
                             SELECT id FROM place WHERE feature_class != 'P' OR population >= ?
                           )""",
                        (minimum,),
                    ).fetchone()[0]
                    subset = {
                        **tables,
                        "place": places,
                        "search_name": names,
                    }
                    label = f"população mínima {minimum}, mantendo divisões administrativas"
                reductions.append(scenario(subset, storage if minimum == 0 else int(storage * places / max(tables["place"], 1)), label, args.reads))
    except (OSError, sqlite3.Error) as exc:
        print(f"Cost estimate failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"indices_secundarios": indexes, "cenarios": reductions}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
