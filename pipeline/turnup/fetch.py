"""Cached fetchers for the backfill (#27). Everything here is keyless and public."""

from __future__ import annotations

import datetime as dt
import logging
import re
import time

from . import cache, http, sources

log = logging.getLogger("turnup.fetch")
POLITE_DELAY = 0.3  # seconds between uncached Elexon calls


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _elexon(path: str, params: dict | None = None) -> bytes:
    time.sleep(POLITE_DELAY)
    return http.get_bytes(f"{sources.ELEXON}{path}", params, timeout=300)


def _unwrap(payload):
    return payload.get("data", payload) if isinstance(payload, dict) else payload


def elexon_cashflows(kind: str, date: str) -> list[dict]:
    """Indicative cashflows for every BMU and settlement period of a day. kind: bid|offer."""
    return _unwrap(cache.cached_json(
        f"elexon/cashflows_{kind}/{date}.json",
        lambda: _elexon(f"/balancing/settlement/indicative/cashflows/all/{kind}/{date}")))


def elexon_volumes(kind: str, date: str) -> list[dict]:
    """Indicative accepted volumes (MWh) for every BMU and settlement period of a day."""
    return _unwrap(cache.cached_json(
        f"elexon/volumes_{kind}/{date}.json",
        lambda: _elexon(f"/balancing/settlement/indicative/volumes/all/{kind}/{date}")))


def elexon_physical(dataset: str, date: str, sp: int) -> list[dict]:
    """PN or MELS for all BMUs in one settlement period."""
    return _unwrap(cache.cached_json(
        f"elexon/{dataset}/{date}/{sp:02d}.json",
        lambda: _elexon("/balancing/physical/all",
                        {"dataset": dataset, "settlementDate": date, "settlementPeriod": sp})))


def elexon_bmunits(refresh: bool = False) -> list[dict]:
    return _unwrap(cache.cached_json(
        "elexon/bmunits_all.json", lambda: _elexon("/reference/bmunits/all"), refresh=refresh))


def neso_resource(package: str, *, name: str | None = None, resource_id: str | None = None,
                  refresh: bool = False) -> list[dict]:
    """Download a NESO CKAN resource (CSV) by exact name or id, cached."""
    key = f"neso/{package}/{_slug(name or resource_id or 'resource')}.csv"

    def fetch() -> bytes:
        pkg = http.get_json(f"{sources.NESO_CKAN}/package_show", {"id": package}, timeout=60)["result"]
        for res in pkg["resources"]:
            if (resource_id and res["id"] == resource_id) or (name and res.get("name", "").strip() == name):
                time.sleep(1.0)
                return http.get_bytes(res["url"].strip(), timeout=300)
        raise LookupError(f"{package}: no resource {name or resource_id}")

    return cache.parse_csv(cache.cached_bytes(key, fetch, refresh=refresh))


def daterange(start: str, end: str):
    d = dt.date.fromisoformat(start)
    stop = dt.date.fromisoformat(end)
    while d <= stop:
        yield d.isoformat()
        d += dt.timedelta(days=1)
