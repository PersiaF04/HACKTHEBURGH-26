"""Keeps docs/PANEL-COPY.md and the data in step."""
from pathlib import Path

import panel_numbers as P

DOC = Path(__file__).resolve().parents[2] / "docs" / "PANEL-COPY.md"


def test_headline_numbers():
    n = P.compute()
    assert round(n["days_total_mwh"]) == 7116615
    assert n["daily_27oct_mwh"] == 168351
    assert round(n["replay_27oct_mwh"]) == 168390
    assert n["replay_vs_daily_pct"] < 0.05
    assert n["dfs_requested_mwh"] == 81000
    assert n["dfs_procured_mwh"] == 37.65
    assert round(n["cable_1gw_avoided_mwh"]) == 24000
    assert round(n["cable_5gw_avoided_mwh"]) == 120000
    assert n["half_hours_over_limit"] == 48
    assert n["wi_net_gbp"] == 11909.25


def test_cable_rule_is_capped_and_monotonic():
    p = [{"scotex_flow_mw": 5000, "scotex_limit_mw": 3000,
          "farms": {"a": {"curtailed_mwh": 100.0}}}]
    # excess 2000 MW; +1000 MW cuts 1000 MW = 500 MWh, capped at 100 MWh curtailed
    assert P.cable_whatif(p, 1000) == 100.0
    p[0]["farms"]["a"]["curtailed_mwh"] = 900.0
    assert P.cable_whatif(p, 1000) == 500.0
    assert P.cable_whatif(p, 5000) == 900.0  # excess is 1000 MWh, curtailed 900
    assert P.cable_whatif(p, 0) == 0.0


def test_doc_quotes_computed_values():
    text = DOC.read_text(encoding="utf-8")
    missing = [f"{k}: {v}" for k, v in P.fmt(P.compute()).items() if v not in text]
    assert not missing, missing


def test_doc_lines_max_25_words():
    for row in DOC.read_text(encoding="utf-8").splitlines():
        if row.startswith("| ") and not row.startswith("| #") and not row.startswith("| ---"):
            line = row.split("|")[2]
            assert len(line.split()) <= 25, line
