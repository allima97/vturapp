#!/usr/bin/env python3
"""Prepare an isolated local GeoNames database; never connects to Cloudflare."""

import argparse
import heapq
import math
import os
import sqlite3
import sys
import unicodedata
import zipfile
from pathlib import Path


SCHEMA = """
CREATE TABLE place (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  ascii_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  admin1 TEXT NOT NULL,
  admin2 TEXT NOT NULL,
  admin3 TEXT NOT NULL,
  admin4 TEXT NOT NULL,
  feature_class TEXT NOT NULL,
  feature_code TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  population INTEGER NOT NULL,
  modified TEXT NOT NULL
);
CREATE TABLE alternate_name (
  id INTEGER PRIMARY KEY,
  place_id INTEGER NOT NULL REFERENCES place(id),
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized TEXT NOT NULL,
  preferred INTEGER NOT NULL,
  short INTEGER NOT NULL,
  colloquial INTEGER NOT NULL,
  historic INTEGER NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL
);
CREATE TABLE search_name (
  place_id INTEGER NOT NULL REFERENCES place(id),
  normalized TEXT NOT NULL,
  priority INTEGER NOT NULL,
  PRIMARY KEY (normalized, place_id)
) WITHOUT ROWID;
CREATE TABLE short_search (
  prefix TEXT NOT NULL,
  rank INTEGER NOT NULL,
  place_id INTEGER NOT NULL REFERENCES place(id),
  PRIMARY KEY (prefix, rank),
  UNIQUE (prefix, place_id)
) WITHOUT ROWID;
CREATE INDEX alternate_place_language
  ON alternate_name(place_id, language, preferred);
CREATE INDEX place_administrative_lookup
  ON place(feature_code, country_code, admin1, admin2);
"""

EXCLUDED_LANGUAGES = {"link", "wkdt", "post", "iata", "icao", "faac"}
BATCH_SIZE = 10000
SHORT_RESULTS = 64
HOT_PREFIX_MIN_NAMES = 10000
INSERT_SEARCH_NAME = """
INSERT INTO search_name (place_id, normalized, priority) VALUES (?, ?, ?)
ON CONFLICT(normalized, place_id) DO UPDATE SET priority = min(priority, excluded.priority)
"""


def normalize(value):
    value = unicodedata.normalize("NFKD", value.lower())
    return " ".join("".join(c for c in value if not unicodedata.category(c).startswith("M")).split())


def rows(path, member):
    with zipfile.ZipFile(path) as archive:
        with archive.open(member) as stream:
            for number, line in enumerate(stream, 1):
                try:
                    yield line.decode("utf-8").rstrip("\r\n").split("\t")
                except UnicodeDecodeError as exc:
                    raise ValueError(f"{member}:{number}: invalid UTF-8") from exc


def import_places(db, archive):
    places = []
    search_names = []
    count = 0
    for number, fields in enumerate(rows(archive, "allCountries.txt"), 1):
        if len(fields) != 19:
            raise ValueError(f"allCountries.txt:{number}: expected 19 fields")
        if fields[6] != "P" and not (
            fields[6] == "A" and (fields[7].startswith("ADM") or fields[7].startswith("PCL"))
        ):
            continue
        ident = int(fields[0])
        places.append(
            (ident, fields[1], fields[2], fields[8], *fields[10:14], fields[6], fields[7],
             float(fields[4]), float(fields[5]), int(fields[14] or 0), fields[18])
        )
        for value in (fields[1], fields[2]):
            key = normalize(value)
            if key:
                search_names.append((ident, key, 0))
        count += 1
        if len(places) == BATCH_SIZE:
            db.executemany("INSERT INTO place VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", places)
            db.executemany(INSERT_SEARCH_NAME, search_names)
            places.clear()
            search_names.clear()
    db.executemany("INSERT INTO place VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", places)
    db.executemany(INSERT_SEARCH_NAME, search_names)
    return count


def import_alternate_names(db, archive):
    known = {row[0] for row in db.execute("SELECT id FROM place")}
    names = []
    keys = []
    count = 0
    empty_count = 0
    for number, fields in enumerate(rows(archive, "alternateNamesV2.txt"), 1):
        if len(fields) != 10:
            raise ValueError(f"alternateNamesV2.txt:{number}: expected 10 fields")
        ident, place_id = int(fields[0]), int(fields[1])
        if place_id not in known or fields[2] in EXCLUDED_LANGUAGES:
            continue
        key = normalize(fields[3])
        if not key:
            empty_count += 1
            continue
        names.append(
            (ident, place_id, fields[2], fields[3], key,
             *(int(flag == "1") for flag in fields[4:8]), fields[8], fields[9])
        )
        if fields[6] != "1" and fields[7] != "1":
            keys.append((place_id, key, 1 if fields[4] == "1" else 2))
        count += 1
        if len(names) == BATCH_SIZE:
            db.executemany("INSERT INTO alternate_name VALUES (?,?,?,?,?,?,?,?,?,?,?)", names)
            db.executemany(INSERT_SEARCH_NAME, keys)
            names.clear()
            keys.clear()
    db.executemany("INSERT INTO alternate_name VALUES (?,?,?,?,?,?,?,?,?,?,?)", names)
    db.executemany(INSERT_SEARCH_NAME, keys)
    return count, empty_count


def build_short_search(db, hot_prefix_min_names=HOT_PREFIX_MIN_NAMES):
    states = {2: (None, {}, 0), 3: (None, {}, 0), 4: (None, {}, 0)}
    pending = []

    def finish(size, prefix, candidates, count):
        if prefix is None or (size == 4 and count < hot_prefix_min_names):
            return
        best = heapq.nlargest(SHORT_RESULTS, candidates.items(), key=lambda item: item[1])
        pending.extend((prefix, rank, ident) for rank, (ident, _) in enumerate(best))
        if len(pending) >= BATCH_SIZE:
            db.executemany("INSERT INTO short_search VALUES (?, ?, ?)", pending)
            pending.clear()

    rows = db.execute(
        """SELECT n.normalized, n.place_id, n.priority, p.population
           FROM search_name n JOIN place p ON p.id = n.place_id
           WHERE p.feature_class = 'P' ORDER BY n.normalized, n.place_id"""
    )
    for name, ident, priority, population in rows:
        score = (math.log10(max(population, 0) + 1) + (2 - priority) * 0.75,
                 -priority, population, -ident)
        for size in (2, 3, 4):
            if len(name) < size:
                continue
            prefix = name[:size]
            previous, candidates, count = states[size]
            if prefix != previous:
                finish(size, previous, candidates, count)
                candidates = {}
                count = 0
            if ident not in candidates or score > candidates[ident]:
                candidates[ident] = score
            states[size] = (prefix, candidates, count + 1)
    for size, (prefix, candidates, count) in states.items():
        finish(size, prefix, candidates, count)
    db.executemany("INSERT INTO short_search VALUES (?, ?, ?)", pending)


def prepare(places, names, output):
    output = Path(output)
    fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with sqlite3.connect(output) as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.executescript(SCHEMA)
            place_count = import_places(db, places)
            name_count, empty_count = import_alternate_names(db, names)
            if not place_count:
                raise ValueError("No populated places or administrative divisions found")
            build_short_search(db)
            db.execute("PRAGMA optimize")
        return place_count, name_count, empty_count
    except Exception:
        output.unlink()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--places", required=True, help="GeoNames allCountries.zip")
    parser.add_argument("--names", required=True, help="GeoNames alternateNamesV2.zip")
    parser.add_argument("--output", required=True, help="New SQLite file; must not already exist")
    args = parser.parse_args()
    try:
        places, names, empty_names = prepare(args.places, args.names, args.output)
    except (OSError, ValueError, sqlite3.Error, zipfile.BadZipFile, KeyError) as exc:
        print(f"GeoNames preparation failed: {exc}", file=sys.stderr)
        return 1
    print(f"Prepared {places} places and {names} alternate names in {args.output}")
    if empty_names:
        print(f"Warning: skipped {empty_names} empty alternate names", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
