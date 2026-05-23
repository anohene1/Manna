#!/usr/bin/env python3
"""
Scrape Amplified Bible (AMP) from BibleGateway and write scrollmapper-format JSON.

The `meaningless` library used by download-biblegateway.py doesn't whitelist
AMP, so we scrape passage pages directly.

Output: data/sources/AMP.json
HTML cache: data/bg_temp/AMP/<book>_<chapter>.html (resumable)

Usage:
  source .venv/bin/activate
  python3 data/scrape-amp.py
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "sources" / "AMP.json"
CACHE = ROOT / "bg_temp" / "AMP"
CACHE.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://www.biblegateway.com/passage/?search={query}&version=AMP&interface=print"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
}

# (display_name, biblegateway_query, chapter_count)
BOOKS = [
    ("Genesis", "Genesis", 50), ("Exodus", "Exodus", 40), ("Leviticus", "Leviticus", 27),
    ("Numbers", "Numbers", 36), ("Deuteronomy", "Deuteronomy", 34), ("Joshua", "Joshua", 24),
    ("Judges", "Judges", 21), ("Ruth", "Ruth", 4), ("1 Samuel", "1 Samuel", 31),
    ("2 Samuel", "2 Samuel", 24), ("1 Kings", "1 Kings", 22), ("2 Kings", "2 Kings", 25),
    ("1 Chronicles", "1 Chronicles", 29), ("2 Chronicles", "2 Chronicles", 36),
    ("Ezra", "Ezra", 10), ("Nehemiah", "Nehemiah", 13), ("Esther", "Esther", 10),
    ("Job", "Job", 42), ("Psalms", "Psalms", 150), ("Proverbs", "Proverbs", 31),
    ("Ecclesiastes", "Ecclesiastes", 12), ("Song of Solomon", "Song of Solomon", 8),
    ("Isaiah", "Isaiah", 66), ("Jeremiah", "Jeremiah", 52), ("Lamentations", "Lamentations", 5),
    ("Ezekiel", "Ezekiel", 48), ("Daniel", "Daniel", 12), ("Hosea", "Hosea", 14),
    ("Joel", "Joel", 3), ("Amos", "Amos", 9), ("Obadiah", "Obadiah", 1), ("Jonah", "Jonah", 4),
    ("Micah", "Micah", 7), ("Nahum", "Nahum", 3), ("Habakkuk", "Habakkuk", 3),
    ("Zephaniah", "Zephaniah", 3), ("Haggai", "Haggai", 2), ("Zechariah", "Zechariah", 14),
    ("Malachi", "Malachi", 4), ("Matthew", "Matthew", 28), ("Mark", "Mark", 16),
    ("Luke", "Luke", 24), ("John", "John", 21), ("Acts", "Acts", 28), ("Romans", "Romans", 16),
    ("1 Corinthians", "1 Corinthians", 16), ("2 Corinthians", "2 Corinthians", 13),
    ("Galatians", "Galatians", 6), ("Ephesians", "Ephesians", 6),
    ("Philippians", "Philippians", 4), ("Colossians", "Colossians", 4),
    ("1 Thessalonians", "1 Thessalonians", 5), ("2 Thessalonians", "2 Thessalonians", 3),
    ("1 Timothy", "1 Timothy", 6), ("2 Timothy", "2 Timothy", 4),
    ("Titus", "Titus", 3), ("Philemon", "Philemon", 1), ("Hebrews", "Hebrews", 13),
    ("James", "James", 5), ("1 Peter", "1 Peter", 5), ("2 Peter", "2 Peter", 3),
    ("1 John", "1 John", 5), ("2 John", "2 John", 1), ("3 John", "3 John", 1),
    ("Jude", "Jude", 1), ("Revelation", "Revelation", 22),
]

VERSE_CLASS_RE = re.compile(r"^[A-Za-z0-9]+-\d+-\d+$")
LEADING_NUM_RE = re.compile(r"^\d+\s*")


def fetch_chapter(book_query: str, chap: int) -> str | None:
    """Fetch HTML for a chapter (cached). Returns None on permanent failure."""
    safe_book = book_query.replace(" ", "_")
    cache_file = CACHE / f"{safe_book}_{chap}.html"
    if cache_file.exists() and cache_file.stat().st_size > 2000:
        return cache_file.read_text(encoding="utf-8")

    url = BASE_URL.format(query=quote(f"{book_query} {chap}"))
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            if r.status_code == 200 and len(r.text) > 2000:
                cache_file.write_text(r.text, encoding="utf-8")
                return r.text
            print(f"      HTTP {r.status_code} (len={len(r.text)})")
        except requests.RequestException as e:
            print(f"      attempt {attempt + 1} failed: {e}")
        time.sleep(2 ** attempt + 1)
    return None


def parse_chapter(html: str) -> dict[int, str]:
    """Extract {verse_num: text} from passage HTML."""
    soup = BeautifulSoup(html, "html.parser")
    passage = soup.select_one(".passage-text") or soup.select_one(".passage-content")
    if not passage:
        return {}

    # Strip non-verse content (footnote/crossref markers, headings, etc.)
    strip_selectors = [
        "sup.footnote", "sup.crossreference", "sup.versenum",
        "span.chapternum", "div.footnotes", "div.crossrefs",
        "h1", "h2", "h3", "h4", "h5", "h6",
        ".chapter-label", ".passage-display",
        ".full-chap-link", ".dropdown-display",
    ]
    for sel in strip_selectors:
        for el in passage.select(sel):
            el.decompose()

    verses: dict[int, str] = {}
    for span in passage.find_all("span"):
        classes = span.get("class") or []
        verse_cls = next((c for c in classes if VERSE_CLASS_RE.match(c)), None)
        if not verse_cls:
            continue
        vnum = int(verse_cls.split("-")[-1])
        text = span.get_text(" ", strip=True)
        text = LEADING_NUM_RE.sub("", text).strip()
        text = re.sub(r"\s+", " ", text)
        if not text:
            continue
        if vnum in verses:
            verses[vnum] += " " + text
        else:
            verses[vnum] = text
    return verses


def main() -> int:
    print("Scraping Amplified Bible (AMP) from BibleGateway")
    print(f"Output: {OUT}")
    print(f"Cache:  {CACHE}\n")

    result = {"translation": "AMP", "books": []}
    total_verses = 0
    failures: list[str] = []

    for display, query, ch_count in BOOKS:
        print(f"{display} ({ch_count} ch)", flush=True)
        book_obj = {"name": display, "chapters": []}
        for ch in range(1, ch_count + 1):
            html = fetch_chapter(query, ch)
            if not html:
                msg = f"{display} {ch}: fetch failed"
                failures.append(msg)
                print(f"  ch {ch:3d}: FETCH FAIL")
                continue
            vmap = parse_chapter(html)
            if not vmap:
                msg = f"{display} {ch}: parse empty"
                failures.append(msg)
                print(f"  ch {ch:3d}: PARSE EMPTY")
                continue
            verses = [{"verse": v, "text": vmap[v]} for v in sorted(vmap)]
            book_obj["chapters"].append({"chapter": ch, "verses": verses})
            total_verses += len(verses)
            print(f"  ch {ch:3d}: {len(verses):3d} verses")
            time.sleep(0.8)  # rate-limit
        result["books"].append(book_obj)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nWrote {OUT.name}")
    print(f"Books: {len(result['books'])}  Verses: {total_verses}")
    if failures:
        print(f"\nFailures ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
