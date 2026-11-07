import json
from pathlib import Path

from turnup import grid


def way(i, pts, voltage="400000"):
    return {"id": i, "tags": {"voltage": voltage, "operator": "X"},
            "geometry": [{"lon": x, "lat": y} for x, y in pts]}


def test_border_lat_and_side():
    assert grid.border_lat(-5) == grid.BORDER[0][1]
    assert abs(grid.border_lat(-3.06) - 54.99) < 1e-9
    assert grid.is_scotland(-3.06, 55.5) and not grid.is_scotland(-3.06, 54.5)


def test_simplify_keeps_ends_and_drops_collinear_points():
    pts = [(0, 0), (1, 0.0001), (2, 0), (3, 1)]
    out = grid.simplify(pts, 0.01)
    assert out[0] == (0, 0) and out[-1] == (3, 1) and (1, 0.0001) not in out


def test_build_lines_classifies_and_filters():
    els = [
        way(1, [(-3.06, 55.6), (-3.06, 55.2)], "275000"),         # Scotland only
        way(2, [(-3.0, 55.3), (-2.9, 54.6)]),                      # spans the border
        way(3, [(-1.5, 54.4), (-1.4, 54.5)]),                      # England, far from the border
        way(4, [(-5.9, 54.6), (-5.7, 54.7)]),                      # Northern Ireland: dropped
    ]
    lines = {l["id"]: l for l in grid.build_lines(els)}
    assert set(lines) == {"osm-1", "osm-2", "osm-3"}
    assert lines["osm-1"]["kv"] == 275 and not lines["osm-1"]["crosses_border"]
    assert lines["osm-2"]["crosses_border"] and lines["osm-2"]["kv"] == 400
    assert not lines["osm-3"]["crosses_border"]


def test_committed_grid_file_shape():
    path = Path(__file__).resolve().parents[2] / "data" / "public" / "grid.json"
    if not path.exists():
        return
    g = json.loads(path.read_text(encoding="utf-8"))
    assert g["meta"]["attribution"] and g["border"] and g["lines"]
    assert g["counts"]["lines"] == len(g["lines"])
    for l in g["lines"]:
        assert l["kv"] in (275, 400, 600) and len(l["coords"]) >= 2
        assert all(-9 < x < 0 and 53 < y < 60 for x, y in l["coords"])
    wl = next(l for l in g["lines"] if l["id"] == "western-link")
    assert wl["southbound_link"] and not wl["crosses_border"] and wl["schematic"]
    assert g["meta"]["attribution_url"].startswith("https://www.openstreetmap.org/")
    assert g["counts"]["osm_ways"] == g["counts"]["lines"] - 1
    assert g["counts"]["crossing_border"] == sum(l["crosses_border"] for l in g["lines"])
