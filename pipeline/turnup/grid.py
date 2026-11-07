"""Transmission lines for the map's power-lines layer (``data/public/grid.json``).

Geometry comes from OpenStreetMap (ODbL, (c) OpenStreetMap contributors) through the Overpass API:
275 kV and 400 kV overhead lines from the Scottish mainland to 54.3 N in the north of England. Each line is
tagged ``crosses_border`` when it spans or touches the Scotland-England border, so the web app can animate the
flow across the Scotland-England boundary (SCOTEX) against NESO's limit. The Western HVDC link is a
schematic route between its two converter stations (``southbound_link``, not ``crosses_border``) because its
subsea route is not mapped here.

Per-line flow is not published anywhere, so this file carries geometry only; the app scales the
animation with ``scotex_flow_mw`` and ``scotex_limit_mw`` from the replay periods.

Run: ``python -m turnup.grid`` from ``pipeline/`` (``--refresh`` re-downloads OpenStreetMap).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import math
from urllib.parse import urlencode

from . import cache, http
from .backfill import write_json

log = logging.getLogger("turnup.grid")

OVERPASS = "https://overpass-api.de/api/interpreter"
QUERY = ('[out:json][timeout:120];way["power"="line"]'
         '["voltage"~"^(400000|275000|400000;275000|275000;400000)$"](54.3,-5.9,60.9,-0.7);out geom tags;')
ATTRIBUTION = "Power line geometry (c) OpenStreetMap contributors, ODbL"
LICENSE_URL = "https://www.openstreetmap.org/copyright"

# Approximate Anglo-Scottish border as (lon, lat) so lines can be classed north or south of it.
BORDER = [(-3.65, 54.96), (-3.06, 54.99), (-2.60, 55.30), (-2.25, 55.45), (-2.05, 55.79), (-1.9, 55.9)]

# Western Link (HVDC, 2.2 GW): Hunterston to Flintshire Bridge in Wales. Schematic subsea route. It does not
# cross the Scotland-England land border, so it is not flagged crosses_border; southbound_link marks it as a
# Scotland-to-south interconnector. Whether NESO counts its flow in SCOTEX is not confirmed here.
HVDC = [{"id": "western-link", "name": "Western Link (HVDC, subsea)", "kv": 600, "capacity_mw": 2250,
         "coords": [[-4.898, 55.723], [-4.95, 55.2], [-4.4, 54.4], [-3.65, 53.55], [-3.07, 53.23]],
         "crosses_border": False, "southbound_link": True, "schematic": True}]


BORDER_TOUCH = 0.03  # degrees of latitude: a line this close to the border counts as a crossing circuit


def border_lat(lon: float) -> float:
    """Latitude of the approximate border at ``lon`` (clamped at the ends)."""
    if lon <= BORDER[0][0]:
        return BORDER[0][1]
    for (x0, y0), (x1, y1) in zip(BORDER, BORDER[1:]):
        if lon <= x1:
            return y0 + (y1 - y0) * (lon - x0) / (x1 - x0)
    return BORDER[-1][1]


def is_scotland(lon: float, lat: float) -> bool:
    return lat > border_lat(lon)


def in_northern_ireland(lon: float, lat: float) -> bool:
    return lon < -5.4 and lat < 55.3


def _perp(p, a, b) -> float:
    (x, y), (x0, y0), (x1, y1) = p, a, b
    dx, dy = x1 - x0, y1 - y0
    if dx == dy == 0:
        return math.hypot(x - x0, y - y0)
    t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x0 + t * dx), y - (y0 + t * dy))


def simplify(points: list, tol: float) -> list:
    """Douglas-Peucker; keeps the end points."""
    if len(points) < 3:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        far, idx = 0.0, None
        for k in range(i + 1, j):
            d = _perp(points[k], points[i], points[j])
            if d > far:
                far, idx = d, k
        if idx is not None and far > tol:
            keep.add(idx)
            stack += [(i, idx), (idx, j)]
    return [points[k] for k in sorted(keep)]


def build_lines(elements: list, tol: float = 0.004) -> list[dict]:
    """OSM ways to simplified line features: Scotland and the north of England, without Northern Ireland."""
    lines = []
    for el in elements:
        geom = el.get("geometry") or []
        pts = [(p["lon"], p["lat"]) for p in geom]
        if len(pts) < 2 or any(in_northern_ireland(*p) for p in pts):
            continue
        north = [is_scotland(*p) for p in pts]
        tags = el.get("tags", {})
        kv = 400 if "400000" in tags.get("voltage", "") else 275
        simple = simplify(pts, tol)
        lines.append({"id": f"osm-{el['id']}", "kv": kv, "operator": tags.get("operator"),
                      "coords": [[round(x, 4), round(y, 4)] for x, y in simple],
                      "crosses_border": (any(north) and not all(north))
                      or min(abs(y - border_lat(x)) for x, y in pts) < BORDER_TOUCH})
    lines.sort(key=lambda l: (-l["kv"], l["id"]))
    return lines


def fetch_osm(refresh: bool = False) -> list:
    def _get() -> bytes:
        url = OVERPASS + "?" + urlencode({"data": QUERY})
        return http.get_bytes(url, timeout=170)
    return json.loads(cache.cached_bytes("osm/power_lines_scotland.json", _get, refresh))["elements"]


def build(refresh: bool = False) -> dict:
    lines = build_lines(fetch_osm(refresh)) + HVDC
    crossing = [l for l in lines if l["crosses_border"]]
    return {
        "meta": {"source": ["OpenStreetMap via Overpass API"], "attribution": ATTRIBUTION, "attribution_url": LICENSE_URL,
                 "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "retrospective": False,
                 "note": ("Geometry only: no per-line flow is published. Scale animation with scotex_flow_mw and "
                          "scotex_limit_mw. Lines are simplified and the border test is approximate. The Western Link "
                          "route is schematic and is not part of the border-crossing set.")},
        "border": [list(p) for p in BORDER],
        "counts": {"lines": len(lines), "osm_ways": len(lines) - len(HVDC),
                   "kv400": sum(l["kv"] == 400 for l in lines), "kv275": sum(l["kv"] == 275 for l in lines),
                   "crossing_border": len(crossing)},
        "lines": lines,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="re-download OpenStreetMap data")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    obj = build(args.refresh)
    log.info("grid: %s", obj["counts"])
    write_json("grid.json", obj, compact=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
