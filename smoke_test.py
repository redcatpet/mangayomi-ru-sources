#!/usr/bin/env python3
"""Smoke tests for the 5 reference extensions.

Fetches live pages/API and verifies that the CSS selectors / JSON field paths
hardcoded in the extensions actually match the response. Runs from Claude's
environment — many РФ-sites return 403/connection refused, those are reported
as ⚠ needs-VPN-verify rather than errors.

Usage: python smoke_test.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error
from typing import Any

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


def fetch(url: str, timeout: int = 15) -> tuple[int, str]:
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", errors="replace")
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, f"ERR:{type(e).__name__}:{e}"


def check_selfmanga():
    print("\n[1/5] ReadManga family (SelfManga live mirror)")
    status, body = fetch("https://1.selfmanga.live/list?sortType=RATING&offset=0")
    if status != 200:
        print(f"  ⚠ HTTP {status} — likely geo-blocked; skipping parser check.")
        return
    try:
        from bs4 import BeautifulSoup  # type: ignore
    except ImportError:
        print("  (bs4 not installed, doing a textual check)")
        import re
        tiles = re.findall(r'class="tile col-sm-6', body)
        print(f"  tiles matched by class text: {len(tiles)}")
        return
    doc = BeautifulSoup(body, "html.parser")
    tiles = doc.select("div.tile.col-sm-6")
    print(f"  tiles found: {len(tiles)}")
    for t in tiles[:3]:
        link_el = t.select_one("div.img a") or t.select_one("h3 a")
        img_el = t.select_one("div.img img") or t.select_one("img")
        h3a = t.select_one("h3 a")
        link = link_el.get("href") if link_el else None
        img = ""
        if img_el:
            img = img_el.get("data-original") or img_el.get("data-src") or img_el.get("src") or ""
        name = ""
        if h3a:
            name = h3a.get("title") or h3a.get_text(strip=True)
        print(f"    • {name[:60]}  link={link}  img={img[:60]}")


def check_jutsu():
    print("\n[2/5] Jut.su")
    status, body = fetch("https://jut.su/anime/sort/rate/page-1/")
    if status != 200:
        print(f"  ⚠ HTTP {status} — skipping.")
        return
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        import re
        cnt = len(re.findall(r"all_anime_global", body))
        print(f"  all_anime_global tokens: {cnt}")
        return
    import re
    doc = BeautifulSoup(body, "html.parser")
    cards = doc.select("div.all_anime_global")
    print(f"  cards: {len(cards)}")
    shown = 0
    seen_hrefs = set()
    for card in cards:
        a = card.select_one("a")
        if not a:
            continue
        href = a.get("href") or ""
        if href in seen_hrefs or href in ("", "/", "/anime/"):
            continue
        seen_hrefs.add(href)
        name_el = card.select_one(".aaname")
        name = name_el.get_text(strip=True) if name_el else (a.get("title") or "")
        img_div = card.select_one(".all_anime_image")
        image_url = ""
        if img_div:
            style = img_div.get("style") or ""
            m = re.search(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", style)
            if m:
                image_url = m.group(1)
        print(f"    • {name[:50]}  link={href}  img={image_url[:50]}")
        shown += 1
        if shown >= 3:
            break
    print(f"  unique anime: {len(seen_hrefs)}")


def check_anilibria():
    print("\n[3/5] AniLibria (v1 API)")
    status, body = fetch("https://api.anilibria.app/api/v1/anime/catalog/releases?page=1&limit=10&f%5Bsorting%5D=RATING_DESC")
    if status != 200:
        print(f"  ⚠ HTTP {status}.")
        return
    j = json.loads(body)
    data = j.get("data", [])
    print(f"  data entries: {len(data)}, meta: {list(j.get('meta', {}).keys())}")
    for r in data[:3]:
        name = (r.get("name") or {}).get("main") or r.get("alias")
        alias = r.get("alias")
        poster = (r.get("poster") or {}).get("preview") or (r.get("poster") or {}).get("src")
        print(f"    • {name[:60]}  alias={alias}  poster={poster[:60] if poster else '-'}")

    print("  -- testing detail endpoint --")
    if data:
        alias = data[0].get("alias")
        status, body = fetch(f"https://api.anilibria.app/api/v1/anime/releases/{alias}")
        if status == 200:
            r = json.loads(body)
            eps = r.get("episodes") or []
            print(f"  episodes in '{alias}': {len(eps)}")
            if eps:
                e = eps[0]
                keys = sorted([k for k in e.keys() if "hls" in k])
                print(f"    first episode keys with 'hls': {keys}")
                print(f"    hls_480 starts: {(e.get('hls_480') or '')[:60]}")


def check_tlrulate():
    print("\n[4/5] Tl.Rulate")
    status, body = fetch("https://tl.rulate.ru/search?t=&category=0&type=0&sort=0&atmosphere=0&page=1")
    if status != 200:
        print(f"  ⚠ HTTP {status}.")
        return
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        import re
        cnt = len(re.findall(r'/book/\d+', body))
        print(f"  /book/ references: {cnt}")
        return
    doc = BeautifulSoup(body, "html.parser")
    for sel in ["div.book", "ul.search-results li", "div.bookshelf-item", "div.span2"]:
        cards = doc.select(sel)
        # narrow down to ones that actually contain a book link
        cards = [c for c in cards if c.select_one('a[href^="/book/"]')]
        if cards:
            print(f"  selector '{sel}' → {len(cards)} cards")
            break
    else:
        print("  ⚠ none matched.")
        return
    for c in cards[:3]:
        a = c.select_one('a[href^="/book/"]')
        title_el = c.select_one(".book-title, h5, h4, p.t-title") or a
        name = title_el.get_text(strip=True) or (a.get("title") or "")
        print(f"    • {name[:60]}  link={a.get('href')}")


def check_author_today():
    print("\n[5/5] Author.Today")
    status, body = fetch("https://author.today/catalog/all/popular?page=1")
    if status != 200:
        print(f"  ⚠ HTTP {status} — expected (Cloudflare geo-block), skipping.")
        return
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        import re
        cnt = len(re.findall(r"/work/\d+", body))
        print(f"  /work/ references: {cnt}")
        return
    doc = BeautifulSoup(body, "html.parser")
    for sel in ["div.book-row", "div.book-item", "article.book"]:
        cards = doc.select(sel)
        if cards:
            print(f"  selector '{sel}' → {len(cards)} cards")
            break
    else:
        print("  ⚠ none matched.")
        return
    for c in cards[:3]:
        a = c.select_one("a.book-title-link, a.book-title, h4 a, a[href^='/work/']")
        img = c.select_one(".book-cover img, img")
        name = a.get_text(strip=True) if a else "?"
        link = a.get("href") if a else "?"
        print(f"    • {name[:60]}  link={link}")


if __name__ == "__main__":
    check_selfmanga()
    check_jutsu()
    check_anilibria()
    check_tlrulate()
    check_author_today()
