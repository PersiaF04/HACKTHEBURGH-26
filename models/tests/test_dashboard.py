"""Offline tests for the dashboard summaries (issue #74)."""
import datetime as dt

from turnup import dashboard as D
from turnup import turnup_prob as T


def _periods(date, p50=0, p90=0, p_heavy=0.0, req=None):
    out = []
    for sp in range(1, 49):
        start = dt.datetime.combine(dt.date.fromisoformat(date), dt.time()) + dt.timedelta(minutes=30 * (sp - 1))
        in_window = 23 <= sp <= 46
        out.append({"start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "curtailed_mwh_p10": 0, "curtailed_mwh_p50": p50(sp) if callable(p50) else p50,
                    "curtailed_mwh_p90": p90, "p_heavy": p_heavy(sp) if callable(p_heavy) else p_heavy,
                    "p_turnup_request": (req if in_window else 0.0) if req is not None else None})
    return out


def _forecast(date="2026-11-08", mode="next_day", **kw):
    return {"meta": {"model": "wind_forecast"}, "mode": mode, "target_date": date, "periods": _periods(date, **kw)}


def test_calm_headline_says_tomorrow_and_the_request_window():
    h = D.tomorrow_block(_forecast(req=0.233))["headline"]
    assert h.startswith("Tomorrow, Sunday 8 Nov: calm.")
    assert "essentially no chance" in h and "up to a 23% chance" in h and "11:00 and 22:30 UTC" in h


def test_replay_mode_never_says_tomorrow():
    h = D.tomorrow_block(_forecast(mode="same_day_replay", req=0.2))["headline"]
    assert "Tomorrow" not in h and "a replay, not tomorrow" in h


def test_windy_headline_uses_the_numbers_in_facts():
    fc = _forecast(p50=lambda sp: 1200 if sp == 30 else 100, p90=2500, p_heavy=lambda sp: 0.8 if sp == 30 else 0.1, req=0.5)
    block = D.tomorrow_block(fc)
    f = block["facts"]
    assert f["total_p50_mwh"] == 1200 + 47 * 100 and f["peak_p50_mwh"] == 1200
    assert f["peak_p50_start_utc"].endswith("T14:30:00Z") and f["peak_p_heavy"] == 0.8 and f["heavy_half_hours"] == 1
    h = block["headline"]
    assert "about 5.9 GWh" in h and "1,200 MWh at 14:30 UTC" in h and "up to a 80% chance" in h and "up to a 50% chance" in h


def test_headline_without_any_request_probability_has_no_request_sentence():
    block = D.tomorrow_block(_forecast(req=None))
    assert "NESO" not in block["headline"] and block["facts"]["request_window_utc"] is None
    assert all(p["p_turnup_request"] is None for p in block["request_probability"])


def test_request_probability_is_aligned_one_to_one_with_the_periods():
    fc = _forecast(req=0.3)
    block = D.tomorrow_block(fc)
    assert [p["start_utc"] for p in block["request_probability"]] == [p["start_utc"] for p in fc["periods"]]


def test_caveat_flags_replay_mode():
    assert "not a forecast of tomorrow" in D.tomorrow_block(_forecast(mode="same_day_replay"))["caveat"]
    assert "not a forecast of tomorrow" not in D.tomorrow_block(_forecast())["caveat"]


def test_merge_windows_joins_consecutive_half_hours_and_splits_gaps():
    s = ["2026-10-27T11:00:00Z", "2026-10-27T11:30:00Z", "2026-10-27T12:00:00Z", "2026-10-27T14:00:00Z"]
    assert D.merge_windows(s) == [["2026-10-27T11:00:00Z", "2026-10-27T12:30:00Z"],
                                  ["2026-10-27T14:00:00Z", "2026-10-27T14:30:00Z"]]
    assert D.merge_windows([]) == []


def _copilot(days):
    return {"meta": {"warmup_days": 5, "scored_days": 13}, "load": {"zone": "Z1", "value_gbp_per_mwh": 100},
            "summary": {"tradable_half_hours": 28}, "days": days}


def _day(date, ours, oracle, starts, bid=60.0):
    return {"date": date, "policies": {"naive": {"gbp": 1}, "ours": {"gbp": ours}, "oracle": {"gbp": oracle}},
            "schedule": [{"start_utc": s, "action": "ready", "bid_gbp_per_mwh": bid} for s in starts]}


def test_copilot_call_scored_day():
    cp = _copilot([_day("2026-10-27", 90, 100, ["2026-10-27T11:00:00Z", "2026-10-27T11:30:00Z"])])
    c = D.copilot_call("2026-10-27", cp, ["2026-10-08"], "2026-10-07")
    assert c["status"] == "scored" and c["bid_gbp_per_mwh"] == 60.0 and c["pct_of_oracle"] == 0.9
    assert c["ready_windows_utc"] == [["2026-10-27T11:00:00Z", "2026-10-27T12:00:00Z"]] and c["ready_half_hours"] == 2
    assert "28 half-hours" in c["caveat"] and "Zone IDs are not confirmed" in c["caveat"]


def test_copilot_call_pct_is_null_when_the_oracle_earned_nothing():
    cp = _copilot([_day("2026-10-28", 0, 0, [])])
    c = D.copilot_call("2026-10-28", cp, [], "2026-10-07")
    assert c["status"] == "scored" and c["pct_of_oracle"] is None and "nothing to answer" in c["note"]


def test_copilot_call_reasons_for_unscored_days():
    cp = _copilot([])
    event_days = [f"2026-10-{d:02d}" for d in (8, 9, 12, 13, 14, 15, 16)]
    assert "had not begun" in D.copilot_call("2026-10-05", cp, event_days, "2026-10-07")["reason"]
    assert "Warm-up day" in D.copilot_call("2026-10-14", cp, event_days, "2026-10-07")["reason"]
    assert "Not in the Copilot's scored set" in D.copilot_call("2026-10-16", cp, event_days, "2026-10-07")["reason"]


def _obs(days, event_if):
    out = []
    for i in range(days):
        d = (dt.date(2026, 10, 7) + dt.timedelta(days=i)).isoformat()
        for sp in T.WINDOW_SPS:
            out.append(T.Obs(d, sp, 0.9 if event_if(i, sp) else 0.1, event_if(i, sp)))
    return out


def test_replay_probability_is_null_without_enough_history_and_aligned_otherwise():
    obs = _obs(12, lambda i, sp: sp >= 30)
    feature = {(o.date, o.sp): o.util for o in obs}
    for o in obs:                                   # the real feature map covers all 48 half-hours of a day
        for sp in range(1, 49):
            feature.setdefault((o.date, sp), 0.1)
    events = {(o.date, o.sp): {} for o in obs if o.event}
    early = D.replay_request_probability("2026-10-09", obs, feature, events, "2026-10-07")
    assert len(early) == 48 and all(p["p_turnup_request"] is None for p in early)
    late = D.replay_request_probability("2026-10-16", obs, feature, events, "2026-10-07")
    assert len(late) == 48 and late[0]["start_utc"].endswith("T23:00:00Z")      # SP1 on a BST day
    by_sp = {i + 1: p for i, p in enumerate(late)}
    assert by_sp[40]["p_turnup_request"] > by_sp[25]["p_turnup_request"] and by_sp[40]["actual_request"] is True
    assert by_sp[5]["p_turnup_request"] == 0.0           # outside the request window


def test_replay_probability_uses_only_earlier_days():
    obs = _obs(12, lambda i, sp: sp >= 30)
    feature = {(o.date, o.sp): o.util for o in obs}
    events = {(o.date, o.sp): {} for o in obs if o.event}
    base = D.replay_request_probability("2026-10-16", obs, feature, events, "2026-10-07")
    flipped = [T.Obs(o.date, o.sp, o.util, not o.event) if o.date >= "2026-10-16" else o for o in obs]
    again = D.replay_request_probability("2026-10-16", flipped, feature, events, "2026-10-07")
    assert [p["p_turnup_request"] for p in base] == [p["p_turnup_request"] for p in again]


# ---- Optimised Model block (issue #100) ----

def _sens(v, naive, ours, oracle):
    return {"value_gbp_per_mwh": v, "net_gbp": {"naive": naive, "ours": ours, "oracle": oracle}}


def test_break_even_is_interpolated_between_the_sign_change_points():
    s = [_sens(0, -100, 0, 0), _sens(100, 0, 100, 120), _sens(150, 100, 50, 200)]
    assert D.break_even_vs_naive(s) == 133.3          # diff +100 at 100, -50 at 150
    assert D.break_even_vs_naive(s[:2]) is None


def _opt_inputs():
    cp = _copilot([_day("2026-10-27", 90, 100, ["2026-10-27T11:00:00Z", "2026-10-27T11:30:00Z"]),
                   _day("2026-10-28", 0, 0, [])])
    cp["days"][0]["policies"]["naive"]["gbp"] = 40
    cp["days"][1]["policies"]["naive"]["gbp"] = -50
    for d in cp["days"]:
        for p in d["policies"].values():
            p.update({"mwh": 25.0, "accepted_periods": 1})
    cp["load"].update({"type": "electrolyser", "capacity_mw": 50.0, "max_periods_per_day": 12})
    cp["summary"].update({"gross_settlement_gbp": 1000, "energy_cost_gbp": 1600,
                          "net_gbp": {"naive": -10, "ours": 90, "oracle": 100}, "caveat": "c"})
    cp["assumptions"] = {"window_local": "11:00 to 23:00", "naive_rule": "n", "ours_rule": "o", "oracle_rule": "h"}
    cp["validation"] = {"settled_to_accepted_cost_ratio_all_dfs": 0.394}
    cp["sensitivity"] = [_sens(100, 0, 90, 100), _sens(150, 200, 120, 300)]
    sb = {"days": {"2026-10-13": {"half_hours": [{"request": True}]}, "2026-10-27": {"half_hours": [{"request": True}]},
                   "2026-10-30": {"half_hours": [{"request": False}]}}}
    return cp, sb, _forecast(req=0.233)


def test_optimised_block_numbers_and_honesty_text():
    cp, sb, fc = _opt_inputs()
    o = D.optimised_block(cp, sb, fc)
    assert o["break_even_site_value_gbp_per_mwh"] == 126.5
    assert o["without_site_value"]["net_gbp"] == -600
    assert o["no_call_days"] == ["2026-10-13"]                      # requests but not scored; no-request days ignored
    assert [r["pct_of_oracle"] for r in o["sensitivity"]] == [0.9, 0.4]
    assert [r["ours_beats_naive"] for r in o["sensitivity"]] == [True, False]
    thin = {t["id"]: t["text"] for t in o["where_it_is_thin"]}
    assert "1 of 2 scored days carries all the value" in thin["one_day"] and "100%" in thin["one_day"]
    assert "28 half-hours" in thin["few_half_hours"]
    assert "-£600" in thin["needs_site_value"] and "£100/MWh" in thin["needs_site_value"]
    assert "At £150 it is 40% and the naive rule beats ours" in thin["site_value_sensitive"]
    assert "39.4%" in thin["settled_cost"]
    assert "not a revenue claim" in thin["unconfirmed"] and "13 Oct" in thin["unconfirmed"]
    assert "retrospective replay, not revenue" in o["headline"] and "£126.5/MWh" in o["headline"]
    assert o["outlook"]["peak_p_request"] == 0.233


def test_optimised_day_cards():
    cp, sb, fc = _opt_inputs()
    cards = {c["date"]: c for c in D.optimised_block(cp, sb, fc)["days"]}
    t = cards["2026-10-27"]
    assert t["status"] == "traded" and t["pct_of_oracle"] == 0.9 and t["ready_half_hours"] == 2
    assert t["ready_windows_utc"] == [["2026-10-27T11:00:00Z", "2026-10-27T12:00:00Z"]]
    assert cards["2026-10-28"]["status"] == "stayed_out_naive_lost" and "lost £50" in cards["2026-10-28"]["text"]
    assert cards["2026-10-28"]["pct_of_oracle"] is None


def test_committed_dashboard_optimised_block_matches_the_source_files():
    import json
    from pathlib import Path
    pub = Path(__file__).resolve().parents[2] / "data" / "public"
    load = lambda f: json.loads((pub / f).read_text(encoding="utf-8"))
    o = D.optimised_block(load("copilot.json"), load("sandbox.json"), load("forecast.json"))
    assert o == load("dashboard.json")["optimised"]
    assert 134 <= o["break_even_site_value_gbp_per_mwh"] < 135
    assert o["without_site_value"]["net_gbp"] == -5591
