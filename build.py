#!/usr/bin/env python3
"""Build script for mangayomi-ru-sources repo.

Walks `sources/{lang}/{type}/{name}/{name}.js`, resolves `// @include: <libname>`
directives by concatenating matching `lib/<libname>.js` files, writes the
merged output to `dist/{lang}/{type}/{name}.js`, and regenerates:

    dist/index.json
    dist/manga_index.json
    dist/anime_index.json
    dist/novel_index.json

The `mangayomiSources` literal at the top of each source file is used as
the manifest for the index. The `sourceCodeUrl` and `iconUrl` are rewritten
to point at the raw GitHub Pages URL (set REPO_BASE_URL env var).
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
SRC = ROOT / "sources"
LIB = ROOT / "lib"
DIST = ROOT / "dist"
ICONS = ROOT / "icons"

REPO_BASE_URL = os.environ.get(
    "REPO_BASE_URL",
    "https://YOUR_USERNAME.github.io/mangayomi-ru-sources"
)

INCLUDE_RE = re.compile(r"//\s*@include:\s*([a-zA-Z0-9_\-]+)")
SOURCES_RE = re.compile(r"const\s+mangayomiSources\s*=\s*(\[[\s\S]*?\]);", re.M)

TYPE_DIR_TO_ITEMTYPE = {"manga": 0, "anime": 1, "novel": 2}


def read_source(path: Path) -> tuple[str, list[str]]:
    """Return (body, include_names)."""
    text = path.read_text(encoding="utf-8")
    includes = INCLUDE_RE.findall(text)
    # Strip the @include directives from final file — purely cosmetic
    body = INCLUDE_RE.sub("", text)
    return body, includes


def extract_manifest(text: str) -> list[dict]:
    m = SOURCES_RE.search(text)
    if not m:
        raise ValueError("mangayomiSources literal not found")
    raw = m.group(1)
    # Parse as JSON — requires property names to be quoted. The conventional
    # extension format uses double-quoted keys, so JSON.parse works directly.
    return json.loads(raw)


def merge(lib_names: list[str], source_body: str) -> str:
    parts: list[str] = []
    for name in lib_names:
        lib_path = LIB / f"{name}.js"
        if not lib_path.exists():
            raise FileNotFoundError(f"lib/{name}.js not found (referenced via @include)")
        parts.append(lib_path.read_text(encoding="utf-8"))
    parts.append(source_body)
    return "\n\n// ---- source file ----\n\n".join(parts)


def stable_id(name: str, base_url: str) -> int:
    """Deterministic numeric id derived from name+baseUrl — stable across builds."""
    import hashlib
    h = hashlib.md5(f"{name}|{base_url}".encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big") & 0x7FFFFFFF  # positive int32


def fill_index_entry(manifest: dict, lang: str, ctype: str, name: str) -> dict:
    item_type = manifest.get("itemType")
    if item_type is None:
        item_type = TYPE_DIR_TO_ITEMTYPE[ctype]
    # sourceCodeUrl → dist/{lang}/{ctype}/{name}.js
    source_code_url = f"{REPO_BASE_URL}/{lang}/{ctype}/{name}.js"

    icon_url = manifest.get("iconUrl", "")
    if not icon_url and (ICONS / f"{name}.png").exists():
        icon_url = f"{REPO_BASE_URL}/icons/{name}.png"

    entry = {
        "name": manifest["name"],
        "id": manifest.get("id") or stable_id(manifest["name"], manifest["baseUrl"]),
        "baseUrl": manifest["baseUrl"],
        "lang": manifest.get("lang", lang),
        "typeSource": manifest.get("typeSource", "single"),
        "iconUrl": icon_url,
        "dateFormat": manifest.get("dateFormat", ""),
        "dateFormatLocale": manifest.get("dateFormatLocale", ""),
        "isNsfw": manifest.get("isNsfw", False),
        "hasCloudflare": manifest.get("hasCloudflare", False),
        "sourceCodeUrl": source_code_url,
        "apiUrl": manifest.get("apiUrl", ""),
        "version": manifest.get("version", "0.1.0"),
        "isManga": item_type == 0,
        "itemType": item_type,
        "isFullData": manifest.get("isFullData", False),
        "appMinVerReq": manifest.get("appMinVerReq", "0.5.0"),
        "additionalParams": manifest.get("additionalParams", ""),
        "sourceCodeLanguage": 1,  # 1 = JavaScript
        "notes": manifest.get("notes", "")
    }
    return entry


def build_all() -> list[dict]:
    DIST.mkdir(exist_ok=True)
    (DIST / "icons").mkdir(exist_ok=True)

    entries: list[dict] = []

    # Walk sources/{lang}/{type}/{name}/{name}.js
    for lang_dir in sorted(SRC.iterdir()):
        if not lang_dir.is_dir():
            continue
        lang = lang_dir.name
        for type_dir in sorted(lang_dir.iterdir()):
            if not type_dir.is_dir() or type_dir.name not in TYPE_DIR_TO_ITEMTYPE:
                continue
            ctype = type_dir.name
            for src_dir in sorted(type_dir.iterdir()):
                if not src_dir.is_dir():
                    continue
                name = src_dir.name
                js_file = src_dir / f"{name}.js"
                if not js_file.exists():
                    print(f"  [skip] {js_file} missing", file=sys.stderr)
                    continue

                body, includes = read_source(js_file)
                merged = merge(includes, body)
                manifest_list = extract_manifest(body)

                # Copy icon if present
                icon_src = src_dir / "icon.png"
                if icon_src.exists():
                    (DIST / "icons").mkdir(exist_ok=True)
                    (DIST / "icons" / f"{name}.png").write_bytes(icon_src.read_bytes())

                # Write merged JS to dist
                out_dir = DIST / lang / ctype
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / f"{name}.js").write_text(merged, encoding="utf-8")

                # Manifest may have multiple sources in the array (multisrc);
                # for now we expect exactly one, but loop to be safe.
                for manifest in manifest_list:
                    # pkgPath points to the dist JS
                    manifest.setdefault("pkgPath", f"{lang}/{ctype}/{name}.js")
                    entry = fill_index_entry(manifest, lang, ctype, name)
                    entries.append(entry)
                    print(f"  [ok] {lang}/{ctype}/{name}")

    # Write index files
    (DIST / "index.json").write_text(
        json.dumps(entries, ensure_ascii=False), encoding="utf-8"
    )
    for ctype, itype in TYPE_DIR_TO_ITEMTYPE.items():
        filtered = [e for e in entries if e["itemType"] == itype]
        (DIST / f"{ctype}_index.json").write_text(
            json.dumps(filtered, ensure_ascii=False), encoding="utf-8"
        )

    # Copy icons folder to dist as well (for relative linking)
    if ICONS.exists():
        for p in ICONS.glob("*.png"):
            (DIST / "icons" / p.name).write_bytes(p.read_bytes())

    return entries


if __name__ == "__main__":
    entries = build_all()
    print(f"\nBuilt {len(entries)} sources.")
    by_type = {}
    for e in entries:
        by_type.setdefault(e["itemType"], 0)
        by_type[e["itemType"]] += 1
    labels = {0: "manga", 1: "anime", 2: "novel"}
    for t, cnt in sorted(by_type.items()):
        print(f"  {labels[t]}: {cnt}")
