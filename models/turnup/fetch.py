"""Keyless HTTP fetch with a small on-disk cache (data/cache/models, git-ignored)."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache" / "models"
NESO = "https://api.neso.energy/api/3/action"
ELEXON = "https://data.elexon.co.uk/bmrs/api/v1"
UA = {"User-Agent": "turn-up-scotland-lane-b/0.1", "Accept": "application/json"}


def get_json(url: str, retries: int = 3, timeout: int = 120):
    err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=timeout).read())
        except Exception as e:  # network or JSON error: retry, then raise the last one
            err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET failed after {retries} tries: {url}: {err}")


def cached(name: str, refresh: bool, build):
    """Return cached JSON for ``name`` or build, store and return it."""
    path = CACHE / f"{name}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    value = build()
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    return value


def resource_id(package: str, name_regex: str) -> str:
    pkg = get_json(f"{NESO}/package_show?id={package}")["result"]
    for res in pkg["resources"]:
        if re.fullmatch(name_regex, res["name"].strip()):
            return res["id"]
    raise LookupError(f"no resource matching {name_regex!r} in {package}")


def datastore_all(rid: str, fields: list[str] | None = None, filters: dict | None = None,
                  page: int = 32000) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        q = {"resource_id": rid, "limit": page, "offset": offset}
        # NESO's datastore rejects the ``fields`` parameter (HTTP 409), so project client-side.
        if filters:
            q["filters"] = json.dumps(filters)
        result = get_json(f"{NESO}/datastore_search?{urllib.parse.urlencode(q)}")["result"]
        rows += [{k: r.get(k) for k in fields} for r in result["records"]] if fields else result["records"]
        offset += len(result["records"])
        if not result["records"] or offset >= result["total"]:
            return rows
