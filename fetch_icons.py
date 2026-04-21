#!/usr/bin/env python3
"""Download favicons for all 30 sources into icons/.

Strategy per source:
  1. Try /favicon.ico
  2. Try common alternatives (/favicon.png, /apple-touch-icon.png)
  3. Try Google's s2 favicon service as fallback — always works, but low quality
"""
import urllib.request, urllib.error, os, sys
from pathlib import Path

ROOT = Path(__file__).parent
ICONS = ROOT / "icons"
ICONS.mkdir(exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# (name, domain) — domain without protocol
SOURCES = [
    # manga
    ("readmanga",     "web.usagi.one"),
    ("mintmanga",     "1.seimanga.me"),
    ("selfmanga",     "1.selfmanga.live"),
    ("allhentai",     "20.allhen.online"),
    ("desu",          "desu.me"),
    ("mangalib",      "mangalib.me"),
    ("yaoilib",       "yaoilib.me"),
    ("hentailib",     "hentailib.me"),
    ("remanga",       "remanga.org"),
    ("newmanga",      "newmanga.org"),
    ("mangabuff",     "mangabuff.ru"),
    ("acomics",       "acomics.ru"),
    # anime
    ("anilibria",     "anilibria.top"),
    ("jutsu",         "jut.su"),
    ("animevost",     "animevost.org"),
    ("animego",       "animego.me"),
    ("animelib",      "anilib.me"),
    ("animedia",      "animedia.my"),
    ("sovetromantica","sovetromantica.com"),
    ("animejoy",      "animejoy.ru"),
    ("shiz",          "shiz.cc"),
    ("animeshka",     "animeshka.com"),
    # novel
    ("tl_rulate",     "tl.rulate.ru"),
    ("author_today",  "author.today"),
    ("ranobelib",     "ranobelib.me"),
    ("ranoberf",      "xn--80ac9aeh6f.xn--p1ai"),
    ("jaomix",        "jaomix.ru"),
    ("novel_tl",      "novel-tl.com"),
    ("ranobehub",     "ranobehub.org"),
    ("litnet",        "litnet.com"),
]


def try_fetch(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ct = (r.headers.get("Content-Type") or "").lower()
            data = r.read()
            if len(data) < 200:
                return None, None
            if any(x in ct for x in ["image", "icon", "octet-stream"]):
                return data, ct
            # Accept unknown content types if starts with a known image magic
            if data[:4] in (b"\x89PNG", b"GIF8") or data[:3] == b"\xff\xd8\xff" or data[:2] == b"\x00\x00":
                return data, ct
            return None, None
    except Exception:
        return None, None


def fetch_icon(name, domain):
    target = ICONS / f"{name}.png"
    # Skip if already present
    if target.exists() and target.stat().st_size > 200:
        return "skipped"

    base = f"https://{domain}"
    candidates = [
        f"{base}/apple-touch-icon.png",
        f"{base}/apple-touch-icon-precomposed.png",
        f"{base}/favicon-196x196.png",
        f"{base}/favicon-96x96.png",
        f"{base}/icon.png",
        f"{base}/favicon.png",
        f"{base}/favicon.ico",
        # DuckDuckGo favicon service — reliable fallback
        f"https://icons.duckduckgo.com/ip3/{domain}.ico",
        # Google's s2 favicons — always works but 32x32
        f"https://www.google.com/s2/favicons?sz=128&domain={domain}",
    ]
    for url in candidates:
        data, ct = try_fetch(url)
        if data:
            # Write as .png regardless of actual format — Mangayomi usually displays fine
            target.write_bytes(data)
            return f"OK from {url}"
    return "FAILED"


if __name__ == "__main__":
    for name, domain in SOURCES:
        result = fetch_icon(name, domain)
        print(f"  {name:20s} {domain:30s} {result}")
