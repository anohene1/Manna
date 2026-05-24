#!/usr/bin/env python3
"""
Import songs from an EasyWorship 6 backup into Manna's manna.db.

Source: ~/Documents/EasyWorship/<profile>/v6.1/Databases/Data/{Songs,SongWords}.db
Target: ~/Library/Application Support/com.manna.app/manna.db (songs table)

The Songs.db / SongWords.db pair is plain SQLite. Lyrics live in SongWords.word.words
as RTF. EasyWorship-native songs use \\sdslidemarker paragraphs as slide breaks;
songs imported into EW from other tools use plain RTF with blank-line stanza breaks.
Both formats are handled.

Each EW song becomes one row in Manna's `songs` table:
  id           = "ew-<rowid>"
  source       = "easyworship"
  number       = NULL
  title/author = from song row
  data (JSON)  = { stanzas: [...], chorus: null, autoChorus: false, lineMode: "stanza-full", ... }

Usage:
  source .venv/bin/activate
  python3 data/import-easyworship.py [--profile Default] [--dry-run] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

from striprtf.striprtf import rtf_to_text

EW_ROOT = Path.home() / "Documents" / "EasyWorship"
MANNA_DB = Path.home() / "Library" / "Application Support" / "com.manna.app" / "manna.db"

PARA_RE = re.compile(r"\{\\pard[^{}]*(?:\{[^{}]*\}[^{}]*)*\\par\s*\}", re.DOTALL)


def parse_with_slidemarker(rtf: str) -> list[list[str]]:
    """Native EasyWorship RTF: paragraphs separated by \\sdslidemarker breaks."""
    blocks = PARA_RE.findall(rtf)
    slides: list[list[str]] = [[]]
    for blk in blocks:
        is_break = "\\sdslidemarker" in blk
        text = rtf_to_text("{\\rtf1\\ansi " + blk + "}", errors="ignore").strip()
        if is_break:
            if slides[-1]:
                slides.append([])
            continue
        if text:
            slides[-1].append(text)
    if slides and not slides[-1]:
        slides.pop()
    return slides


def parse_plain_rtf(rtf: str) -> list[list[str]]:
    """Fallback: no \\sdslidemarker — split stanzas on blank lines."""
    text = rtf_to_text(rtf, errors="ignore")
    slides: list[list[str]] = [[]]
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if slides[-1]:
                slides.append([])
        else:
            slides[-1].append(line)
    if slides and not slides[-1]:
        slides.pop()
    return slides


def parse_lyrics(rtf: str | None) -> list[list[str]]:
    if not rtf:
        return []
    if "\\sdslidemarker" in rtf:
        return parse_with_slidemarker(rtf)
    return parse_plain_rtf(rtf)


def build_song_data(slides: list[list[str]]) -> dict:
    """Map slide list to Manna's Song.data JSON shape."""
    stanzas = [
        {"id": f"v{i}", "kind": "verse", "lines": lines}
        for i, lines in enumerate(slides, 1)
        if lines
    ]
    return {
        "autoChorus": False,
        "chorus": None,
        "lineMode": "stanza-full",
        "stanzas": stanzas,
        "tune": None,
        "meter": None,
        "scriptureRef": None,
        "category": None,
    }


def list_profiles() -> list[str]:
    if not EW_ROOT.exists():
        return []
    return sorted(
        p.name for p in EW_ROOT.iterdir()
        if p.is_dir() and (p / "v6.1" / "Databases" / "Data" / "Songs.db").exists()
    )


def open_ew(profile: str) -> sqlite3.Connection:
    data_dir = EW_ROOT / profile / "v6.1" / "Databases" / "Data"
    songs_path = data_dir / "Songs.db"
    words_path = data_dir / "SongWords.db"
    if not songs_path.exists() or not words_path.exists():
        raise SystemExit(f"Missing Songs.db or SongWords.db in {data_dir}")
    conn = sqlite3.connect(str(songs_path))
    conn.text_factory = str
    conn.execute(f"ATTACH DATABASE '{words_path}' AS w")
    return conn


def open_manna() -> sqlite3.Connection:
    if not MANNA_DB.exists():
        raise SystemExit(f"Manna DB not found at {MANNA_DB} — run the app once to create it")
    conn = sqlite3.connect(str(MANNA_DB))
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", default="Default",
                        help="EasyWorship profile dir (default: Default). Available: "
                             + ", ".join(list_profiles() or ["<none found>"]))
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit to N songs (0 = all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse + report only; do not write to Manna DB")
    parser.add_argument("--replace", action="store_true",
                        help="Wipe existing source='easyworship' rows before importing")
    args = parser.parse_args()

    print(f"EasyWorship profile: {args.profile}")
    print(f"Manna DB:            {MANNA_DB}")
    print(f"Mode:                {'DRY RUN' if args.dry_run else 'WRITE'}\n")

    ew = open_ew(args.profile)
    limit_clause = f"LIMIT {args.limit}" if args.limit > 0 else ""
    rows = ew.execute(
        "SELECT s.rowid, s.title, s.author, s.copyright, w.words "
        "FROM song s LEFT JOIN w.word w ON w.song_id = s.rowid "
        f"ORDER BY s.rowid {limit_clause}"
    ).fetchall()
    print(f"EW songs found: {len(rows)}\n")

    parsed: list[tuple[str, str, str | None, dict, int]] = []
    skipped: list[tuple[int, str, str]] = []

    for rowid, title, author, copyright, rtf in rows:
        title = (title or "").strip()
        author = (author or "").strip() or None
        slides = parse_lyrics(rtf)
        line_count = sum(len(s) for s in slides)
        if not slides or line_count == 0:
            skipped.append((rowid, title, "empty lyrics"))
            continue
        if not title:
            skipped.append((rowid, "<no title>", "missing title"))
            continue
        data = build_song_data(slides)
        manna_id = f"ew-{rowid}"
        parsed.append((manna_id, title, author, data, line_count))

    print(f"Parsed:  {len(parsed)}")
    print(f"Skipped: {len(skipped)}")
    if skipped[:5]:
        for rid, t, why in skipped[:5]:
            print(f"  - [{rid}] {t[:40]:40s}  ({why})")
        if len(skipped) > 5:
            print(f"  ... +{len(skipped) - 5} more skipped")

    if parsed[:3]:
        print("\nSample parses:")
        for mid, t, a, d, lc in parsed[:3]:
            stanzas = d["stanzas"]
            print(f"  {mid:8s}  {t[:40]:40s}  by {a or '<none>':20s}  stanzas={len(stanzas):2d} lines={lc}")

    if args.dry_run:
        print("\nDry run — no DB writes.")
        return 0

    manna = open_manna()
    cur = manna.cursor()

    if args.replace:
        n = cur.execute("DELETE FROM songs WHERE source='easyworship'").rowcount
        print(f"\nDeleted {n} existing easyworship songs")

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    inserted = 0
    updated = 0
    for mid, title, author, data, _ in parsed:
        data_json = json.dumps(data, ensure_ascii=False)
        existing = cur.execute("SELECT 1 FROM songs WHERE id = ?", (mid,)).fetchone()
        if existing:
            cur.execute(
                "UPDATE songs SET title=?, author=?, data=?, source='easyworship', "
                "updated_at=? WHERE id=?",
                (title, author, data_json, now, mid),
            )
            updated += 1
        else:
            cur.execute(
                "INSERT INTO songs (id, source, number, title, author, data, "
                "seed_version, created_at, updated_at) "
                "VALUES (?, 'easyworship', NULL, ?, ?, ?, 0, ?, ?)",
                (mid, title, author, data_json, now, now),
            )
            inserted += 1

    manna.commit()
    print(f"\nInserted: {inserted}")
    print(f"Updated:  {updated}")
    print(f"Total easyworship rows now: "
          + str(cur.execute("SELECT COUNT(*) FROM songs WHERE source='easyworship'").fetchone()[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
