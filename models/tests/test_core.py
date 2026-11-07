"""Offline tests for lane B: time helpers, scoring helpers, the forecast and the turn-up model."""
import datetime as dt
import random

from turnup import forecast as F
from turnup import inputs, stats, turnup_prob as T
from turnup.timeutil import iso_z, sp_from_clock, sp_start_utc


# ---- time -------------------------------------------------------------------------------------
def test_sp_start_utc_handles_bst_and_gmt():
    assert iso_z(sp_start_utc(dt.date(2026, 10, 14), 30)) == "2026-10-14T13:30:00Z"   # BST, 14:30 local
    assert iso_z(sp_start_utc(dt.date(2026, 11, 8), 1)) == "2026-11-08T00:00:00Z"     # GMT
    assert iso_z(sp_start_utc(dt.date(2026, 3, 30), 1)) == "2026-03-29T23:00:00Z"     # first BST day
    assert iso_z(sp_start_utc(dt.date(2026, 10, 25), 1)) == "2026-10-24T23:00:00Z"    # BST day that ends
    assert iso_z(sp_start_utc(dt.date(2026, 10, 26), 1)) == "2026-10-26T00:00:00Z"


def test_sp_from_clock():
    assert sp_from_clock("00:00") == 1
    assert sp_from_clock("11:00") == 23
    assert sp_from_clock("23:30") == 48


# ---- stats ------------------------------------------------------------------------------------
def test_quantile_and_mae():
    assert stats.quantile([1, 2, 3, 4, 5], 0.5) == 3
    assert stats.quantile([0, 10], 0.25) == 2.5
    assert stats.mae([1, 2], [2, 4]) == 1.5


def test_auc_perfect_random_and_single_class():
    assert stats.auc([0.1, 0.2, 0.8, 0.9], [False, False, True, True]) == 1.0
    assert stats.auc([0.5, 0.5, 0.5, 0.5], [False, True, False, True]) == 0.5
    assert stats.auc([0.1, 0.2], [True, True]) is None


def test_brier_and_reliability():
    assert stats.brier([1.0, 0.0], [True, False]) == 0.0
    rel = stats.reliability([0.05, 0.06, 0.95], [False, False, True])
    assert [b["n"] for b in rel] == [2, 1] and rel[0]["observed"] == 0.0


# ---- forecast ---------------------------------------------------------------------------------
def synthetic_rows(days=200, seed=1):
    """Curtailment rises with boundary utilisation; fully synthetic, so no network is needed."""
    rnd = random.Random(seed)
    start = dt.date(2026, 1, 1)
    curtail, util = {}, {}
    for i in range(days):
        d = (start + dt.timedelta(days=i)).isoformat()
        level = rnd.random()
        for sp in range(1, 49):
            u = max(0.0, level + rnd.gauss(0, 0.1))
            util[(d, sp)] = u
            curtail[(d, sp)] = max(0.0, 3000 * (u - 0.6) + rnd.gauss(0, 100)) if u > 0.6 else 0.0
    last = (start + dt.timedelta(days=days - 1)).isoformat()
    return F.build_rows(curtail, util, last), last


def test_build_rows_fills_missing_curtailment_with_zero():
    rows = F.build_rows({("2026-01-03", 1): 50.0}, {("2026-01-05", 1): 0.7, ("2026-01-03", 2): 0.5}, "2026-01-05")
    by = {(r.date, r.sp): r for r in rows}
    assert by[("2026-01-03", 2)].y == 0.0               # no acceptance means zero, not missing
    assert by[("2026-01-05", 1)].pers == 50.0           # lag of 2 days
    assert by[("2026-01-05", 1)].y == 0.0


def test_target_date_after_last_actual_is_unscored():
    rows = F.build_rows({}, {("2026-01-09", 1): 0.9}, "2026-01-05")
    assert rows[0].y is None and rows[0].pers is None


def test_model_beats_baselines_on_synthetic_signal():
    rows, _ = synthetic_rows()
    bt = F.backtest(rows, test_start="2026-06-01")
    assert bt["mae_mwh"]["model"] < bt["mae_mwh"]["persistence"]
    assert bt["mae_mwh"]["model"] < bt["mae_mwh"]["training_mean"]
    assert bt["brier_heavy"]["model"] < bt["brier_heavy"]["prior"]
    assert bt["auc_heavy"]["model"] > 0.8


def test_backtest_never_trains_on_the_future():
    rows, last = synthetic_rows()
    first_fold = "2026-06-01"
    preds = F.backtest_predictions(rows, test_start=first_fold)
    assert min(p["date"] for p in preds) >= first_fold
    # Poison every row from the first test date onward: fold-1 predictions must not change.
    base = {(p["date"], p["sp"]): p["p50"] for p in preds if p["date"] < "2026-06-08"}
    poisoned = [F.Row(r.date, r.sp, r.util, r.pers, 99999.0 if r.date >= first_fold else r.y) for r in rows]
    again = {(p["date"], p["sp"]): p["p50"] for p in F.backtest_predictions(poisoned, test_start=first_fold)
             if p["date"] < "2026-06-08"}
    assert base == again


def test_forecast_day_quantiles_are_ordered_and_probabilities_valid():
    rows, last = synthetic_rows()
    target = (dt.date.fromisoformat(last) + dt.timedelta(days=1)).isoformat()
    rows += [F.Row(target, sp, 0.9, None, None) for sp in range(1, 49)]
    for p in F.forecast_day(rows, target):
        assert p["p10"] <= p["p50"] <= p["p90"]
        assert 0.0 <= p["p_heavy"] <= 1.0


def test_period_record_matches_contract_fields():
    rec = F.period_record("2026-11-08", 1, {"p10": 1.2, "p50": 5.7, "p90": 9.9, "p_heavy": 0.123456}, None)
    assert set(rec) == {"start_utc", "curtailed_mwh_p10", "curtailed_mwh_p50", "curtailed_mwh_p90",
                        "p_heavy", "p_turnup_request"}
    assert rec["p_turnup_request"] is None and rec["start_utc"] == "2026-11-08T00:00:00Z"


# ---- turn-up probability ----------------------------------------------------------------------
def test_turnup_events_filter_live_upwards_system_only():
    reqs = [
        {"type": "Upwards", "tag": "System", "req_type": "Live", "date": "2026-10-08", "sp": 25, "caps": {"Z1": 500.0}},
        {"type": "Upwards", "tag": "System", "req_type": "Test", "date": "2026-10-08", "sp": 26, "caps": {"Z1": 500.0}},
        {"type": "Downwards", "tag": "Energy", "req_type": "Live", "date": "2026-10-08", "sp": 27, "caps": {"Z1": 500.0}},
        {"type": "Upwards", "tag": "System", "req_type": "Live", "date": "2026-09-01", "sp": 28, "caps": {"Z1": 500.0}},
        {"type": "Upwards", "tag": "System", "req_type": "Live", "date": "2026-10-08", "sp": 29, "caps": {"Z1": 0.0}},
    ]
    assert set(inputs.turnup_events(reqs)) == {("2026-10-08", 25)}


def test_turnup_model_zero_outside_window_and_learns_signal():
    rnd = random.Random(3)
    util, events = {}, {}
    for i in range(20):
        d = (dt.date(2026, 10, 7) + dt.timedelta(days=i)).isoformat()
        for sp in T.WINDOW_SPS:
            u = rnd.random()
            util[(d, sp)] = u
            if u > 0.5:
                events[(d, sp)] = {}
    obs = T.build_obs(events, util, "2026-10-07", "2026-10-26")
    model = T.TurnupModel(obs)
    assert model.prob(0.9, 5) == 0.0                     # outside 11:00 to 23:00
    assert model.prob(0.95, 30) > model.prob(0.05, 30)
    ev = T.evaluate(obs)
    assert ev["available"] and ev["brier"]["model"] < ev["brier"]["base_rate"]


def test_turnup_evaluate_needs_enough_days():
    obs = [T.Obs("2026-10-07", 25, 0.5, True), T.Obs("2026-10-08", 25, 0.5, False)]
    assert T.evaluate(obs)["available"] is False


def test_scottish_curtailment_converts_mw_to_mwh_and_filters(monkeypatch):
    # NESO wind BOA volumes are average MW over a half-hour, so MWh = MW / 2, shown as a positive turn-down.
    monkeypatch.setattr(inputs, "scottish_generators", lambda refresh=False: {"A", "C"})
    monkeypatch.setattr(inputs, "boa_rows", lambda refresh=False: [
        ["2026-10-14", 30, "A", -100.0],   # Scottish turn-down
        ["2026-10-14", 30, "C", -20.0],    # second Scottish unit, same period: summed
        ["2026-10-14", 30, "B", -500.0],   # not Scottish: ignored
        ["2026-10-14", 31, "A", 40.0],     # turn-up: ignored
        ["2026-10-14", 32, "A", None],     # missing: ignored
    ])
    assert inputs.scottish_curtailment() == {("2026-10-14", 30): 60.0}


def test_morning_update_sensitivity_uses_same_rows_and_improves_with_informative_wind():
    rows, _ = synthetic_rows()
    # Informative stand-in "wind forecast": the synthetic hidden driver level, recovered from the target.
    wind = {}
    for r in rows:
        wind[(r.date, r.sp)] = (r.y or 0.0) / 10000.0
    out = F.morning_update_backtest(rows, wind, test_start="2026-06-01")
    assert out["available"] and out["n_periods"] > 0
    assert out["mae_mwh"]["with_wind_forecast"] < out["mae_mwh"]["main_model"]
    assert "Sensitivity, not the tomorrow model" in out["note"]


def test_morning_update_unavailable_without_wind_data():
    rows, _ = synthetic_rows()
    assert F.morning_update_backtest(rows, {}, test_start="2026-06-01") == {"available": False}
