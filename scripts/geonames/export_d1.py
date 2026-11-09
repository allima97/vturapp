#!/usr/bin/env python3
"""Export a prepared GeoNames SQLite database to bounded D1 import files."""

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path


TABLES = ("place", "alternate_name", "search_name", "short_search")
DEFAULT_CHUNK_BYTES = 32 * 1024 * 1024
MAX_STATEMENT_BYTES = 100_000
MAX_CHUNK_BYTES = 5 * 1024 * 1024 * 1024


def statements(db):
    for table in TABLES:
        schema = db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        yield schema[0] + ";"
    for table in TABLES:
        columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
        literals = " || ',' || ".join(
            f"""CASE WHEN typeof("{column}")='text' AND instr("{column}", char(0))>0
                THEN NULL ELSE quote("{column}") END"""
            for column in columns
        )
        query = f"""SELECT 'INSERT INTO "{table}" VALUES(' || {literals} || ');'
                    FROM "{table}" """
        for (statement,) in db.execute(query):
            if statement is None:
                raise ValueError(f"{table} contains text with a NUL character")
            yield statement
    for (schema,) in db.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
    ):
        yield schema + ";"


def export(source, output, chunk_bytes=DEFAULT_CHUNK_BYTES):
    source = Path(source).resolve(strict=True)
    if not source.is_file():
        raise ValueError("Source must be a SQLite file")
    if not 1 <= chunk_bytes <= MAX_CHUNK_BYTES:
        raise ValueError("Chunk size must be positive and no larger than 5 GiB")
    output = Path(output)
    output.mkdir()

    manifest = {"source": source.name, "files": [], "counts": {}}
    stream = None
    size = 0
    digest = None

    def finish():
        nonlocal stream
        if stream is not None:
            stream.close()
            manifest["files"].append(
                {"name": name, "bytes": size, "sha256": digest.hexdigest()}
            )
            stream = None

    try:
        with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as db:
            tables = {
                row[0] for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            if tables != set(TABLES):
                raise ValueError("Source is not a prepared GeoNames database")
            for table in sorted(TABLES):
                manifest["counts"][table] = db.execute(
                    'SELECT count(*) FROM "' + table + '"'
                ).fetchone()[0]
            if not manifest["counts"]["place"]:
                raise ValueError("Source contains no places")

            for statement in statements(db):
                encoded = (statement + "\n").encode("utf-8")
                if len(encoded) > min(chunk_bytes, MAX_STATEMENT_BYTES):
                    raise ValueError("A SQL statement exceeds the chunk or D1 statement limit")
                if stream is None or size + len(encoded) > chunk_bytes:
                    finish()
                    name = f"geonames-{len(manifest['files']) + 1:05d}.sql"
                    stream = (output / name).open("xb")
                    digest = hashlib.sha256()
                    size = 0
                stream.write(encoded)
                digest.update(encoded)
                size += len(encoded)
        finish()
        (output / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    except Exception:
        if stream is not None:
            stream.close()
        raise
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Prepared GeoNames SQLite file")
    parser.add_argument("--output", required=True, help="New output directory")
    parser.add_argument(
        "--chunk-mib", type=int, default=32, help="Maximum SQL file size in MiB (default 32)"
    )
    args = parser.parse_args()
    try:
        manifest = export(args.source, args.output, args.chunk_mib * 1024 * 1024)
    except (OSError, ValueError, sqlite3.Error) as exc:
        print(f"D1 export failed: {exc}", file=sys.stderr)
        return 1
    print(f"Exported {len(manifest['files'])} ordered SQL files to {args.output}")
    print("No files were uploaded; review the manifest and import costs before proceeding.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
