"""Disk cache for raw API responses (``data/cache/``, gitignored).

Historic Elexon and NESO data does not change once settled, so each response is fetched once
and reused. Large JSON is stored gzip-compressed.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import os
from pathlib import Path
from typing import Callable

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE = REPO_ROOT / "data" / "cache"


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def cached_bytes(rel: str, fetch: Callable[[], bytes], refresh: bool = False) -> bytes:
    path = CACHE / (rel + ".gz")
    if path.exists() and not refresh:
        return gzip.decompress(path.read_bytes())
    body = fetch()
    _atomic_write(path, gzip.compress(body, compresslevel=6))
    return body


def cached_json(rel: str, fetch: Callable[[], bytes], refresh: bool = False):
    return json.loads(cached_bytes(rel, fetch, refresh).decode("utf-8"))


def parse_csv(body: bytes) -> list[dict]:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            text = body.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    return list(csv.DictReader(io.StringIO(text)))
