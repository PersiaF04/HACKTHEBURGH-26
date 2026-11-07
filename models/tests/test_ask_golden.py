"""The Ask the Grid golden set must match what the tools compute from data/public (issue #91)."""
import json

import ask_golden as G


def test_golden_file_matches_recomputed_answers():
    committed = json.loads(G.GOLDEN.read_text(encoding="utf-8"))
    assert committed == G.compute(), "data/public changed: run 'python models/ask_golden.py --write' and review the diff"


def test_golden_set_shape():
    qs = G.compute()["questions"]
    assert len(qs) == 25
    assert len({q["id"] for q in qs}) == 25
    assert sum(q["kind"] == "refuse" for q in qs) == 5
    assert {q["refusal_type"] for q in qs if q["kind"] == "refuse"} == {
        "revenue_claim", "zone_to_region", "farm_cause", "beyond_data", "outside_scotland"}


def test_manifest_lists_exactly_the_implemented_tools():
    manifest = json.loads((G.ROOT / "contracts" / "ask-the-grid-tools.json").read_text(encoding="utf-8"))
    assert {t["name"] for t in manifest["tools"]} == set(G.TOOLS)
    used = {c["tool"] for q in G.compute()["questions"] for c in q["tool_calls"]}
    assert used == set(G.TOOLS)
    for t in manifest["tools"]:
        for r in t["reads"]:
            assert (G.ROOT / r["file"].replace("<date>", "2026-10-14")).exists(), r["file"]


def test_every_tool_result_names_its_source():
    for name, args in [("curtailment_for_day", {"date": "2026-10-14"}), ("forecast_tomorrow", {}),
                       ("farm_lookup", {"name": "Aberdeen"})]:
        assert G.TOOLS[name](**args)["source"]


def test_unknown_dates_return_errors_not_numbers():
    assert G.curtailment_for_day("1999-01-01")["error"] == "no_data"
    assert G.scotex_gap("1999-01-01")["error"] == "no_replay_for_date"
    assert G.copilot_call("1999-01-01")["error"] == "no_copilot_for_date"


def test_replay_lookup_accepts_only_a_strict_date_inside_data_public():
    assert G._replay("../../../contracts/fixtures/replay/2026-10-14") is None
    assert G._replay("2026-10-14/../../farms") is None
    assert G._replay("not-a-date") is None
    assert G._replay(None) is None
    assert G._replay("2026-10-14") is not None


def test_scotex_gap_reports_no_overshoot_on_a_day_that_never_exceeds_the_limit(monkeypatch):
    calm = {"periods": [{"sp": sp, "scotex_limit_mw": 5000.0, "scotex_flow_mw": 4000.0 + sp} for sp in range(1, 49)]}
    monkeypatch.setattr(G, "_replay", lambda date: calm)
    r = G.scotex_gap("2026-10-13")
    assert r["periods_over_limit"] == 0 and r["max_overshoot_mw"] is None and r["max_overshoot_sp"] is None
    mixed = {"periods": [{"sp": 1, "scotex_limit_mw": 5000.0, "scotex_flow_mw": 4000.0},
                         {"sp": 2, "scotex_limit_mw": 5000.0, "scotex_flow_mw": 5200.5}]}
    monkeypatch.setattr(G, "_replay", lambda date: mixed)
    r = G.scotex_gap("2026-10-13")
    assert r["periods_over_limit"] == 1 and r["max_overshoot_mw"] == 200.5 and r["max_overshoot_sp"] == 2
