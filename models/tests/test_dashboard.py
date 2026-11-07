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


# --- Issue #101: the Tomorrow's Predictions content block -------------------------------------------------

def _full_forecast(**kw):
    fc = _forecast(**kw)
    fc["issued_utc"] = "2026-11-07T17:00:00Z"
    fc["meta"]["leakage_note"] = "leak"
    fc["backtest"] = {
        "test_window": ["2026-09-01", "2026-11-05"], "n_periods": 3170, "heavy_threshold_mwh": 1000.0, "method": "m",
        "mae_mwh": {"model": 663.2, "persistence": 1225.0, "training_mean": 999.0},
        "brier_heavy": {"model": 0.149, "persistence": 0.471, "prior": 0.299},
        "auc_heavy": {"model": 0.914, "persistence": 0.528},
        "interval_coverage_p10_p90": 0.71,
        "turnup": {"available": True, "scored_days": 27, "auc": {"model": 0.647},
                   "brier": {"model": 0.238, "base_rate": 0.268}},
    }
    return fc


COPILOT = {"meta": {"scored_days": 13}, "summary": {"pct_of_oracle": 0.946, "tradable_half_hours": 28}}


def test_predictions_calm_day_has_state_table_and_cards():
    p = D.predictions_block(_full_forecast(req=0.233), COPILOT)
    assert p["is_tomorrow"] and p["section_title"] == "Tomorrow's Predictions"
    assert p["calm"]["is_calm"] and "23%" in p["calm"]["message"] and "11:00 and 22:30 UTC" in p["calm"]["message"]
    assert 3 <= len(p["facts"]) <= 5
    for c in p["facts"]:
        assert c["label"] and c["source"] and c["caveat"] and "display" in c and "value" in c
    assert len(p["table"]) == 48 and set(p["table"][0]) >= {"p_heavy", "p50_mwh", "p_request", "time_utc"}


def test_predictions_honest_caveats_and_scores():
    p = D.predictions_block(_full_forecast(req=0.233), COPILOT)
    by_id = {c["id"]: c for c in p["facts"]}
    assert "71%" in by_id["heavy_chance"]["caveat"] and "not 80%" in by_id["heavy_chance"]["caveat"]
    assert "4 weeks" in by_id["request_chance"]["caveat"] and "0.647" in by_id["request_chance"]["caveat"]
    assert "Not a revenue claim" in by_id["copilot_vs_hindsight"]["caveat"]
    hw = p["how_we_know"]
    assert hw["retrospective"] and hw["leakage_note"] == "leak" and hw["band"]["p10_p90_coverage"] == 0.71
    mae = next(m for m in hw["metrics"] if m["id"] == "mae_mwh")
    assert mae["model"] == 663.2 and {b["id"]: b["value"] for b in mae["baselines"]}["persistence"] == 1225.0
    assert [m["id"] for m in hw["metrics"]] == ["mae_mwh", "brier_heavy", "auc_heavy"]


def test_predictions_windy_day_is_not_calm():
    fc = _full_forecast(p50=lambda sp: 1200 if sp == 30 else 100, p90=2500,
                        p_heavy=lambda sp: 0.8 if sp == 30 else 0.1, req=0.5)
    p = D.predictions_block(fc, COPILOT)
    assert not p["calm"]["is_calm"] and p["calm"]["message"] is None
    assert "1,200 MWh at 14:30 UTC" in p["headline"]


def test_predictions_replay_mode_never_says_tomorrow():
    p = D.predictions_block(_full_forecast(mode="same_day_replay", req=0.2), COPILOT)
    assert not p["is_tomorrow"]
    text = str({k: v for k, v in p.items() if k not in ("table", "is_tomorrow")})
    assert "omorrow" not in text.replace("not tomorrow", "")


def test_predictions_without_copilot_or_request_probability():
    p = D.predictions_block(_full_forecast(req=None))
    assert all(c["id"] != "copilot_vs_hindsight" for c in p["facts"])
    assert "NESO still" not in p["calm"]["message"] and all(r["p_request"] is None for r in p["table"])
