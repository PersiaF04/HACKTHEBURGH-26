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
