"""Offline tests for the sandbox exporter and its reference scorer (issue #76)."""
import copy

from test_copilot import synthetic_history  # synthetic Market with events, ceilings, prices

from turnup import copilot as C
from turnup import sandbox as S

LOAD = C.Load(type="electrolyser", capacity_mw=50.0, zone="Z1", value_gbp_mwh=100.0, max_periods=12)


def _setup():
    m = synthetic_history(days=14)
    days = S.build_days(m, {}, LOAD)
    return m, days


def _load(**kw):
    base = {"capacity_mw": 50.0, "zone": "Z1", "value_gbp_per_mwh": 100.0, "max_periods": 12}
    base.update(kw)
    return base


def test_reference_scorer_matches_the_copilot_settle_for_every_policy_and_day():
    m, days = _setup()
    event_days = sorted(days)
    checked = 0
    for day in event_days:
        pol = days[day]["policies"]["Z1"]["100"]
        for name, sched in pol.items():
            if sched is None:
                continue
            ref = S.score_schedule(days[day], _load(), sched)
            old = C.settle(m, LOAD, day, [(sp, price) for sp, price in sched])
            assert abs(ref["net_gbp"] - old["net"]) < 1e-6
            assert abs(ref["gross_gbp"] - old["gross"]) < 1e-6 and abs(ref["energy_cost_gbp"] - old["energy"]) < 1e-6
            assert ref["mwh"] == old["mwh"] and ref["accepted_half_hours"] == old["accepted"]
            checked += 1
    assert checked > 20


def test_accepted_budget_caps_a_long_user_schedule_in_time_order():
    _, days = _setup()
    day = days[sorted(days)[3]]
    everything = [[sp, 0.0] for sp in range(1, 49)]            # bid 0: accepted wherever tradable
    full = S.score_schedule(day, _load(max_periods=100), everything)
    capped = S.score_schedule(day, _load(max_periods=3), everything)
    assert full["accepted_half_hours"] > 3
    assert capped["accepted_half_hours"] == 3
    first3 = []
    for hh in day["half_hours"]:
        if hh["request"] and hh["ceiling_gbp_per_mwh"]["Z1"] is not None and hh["mid_gbp_per_mwh"] is not None:
            first3.append([hh["sp"], 0.0])
        if len(first3) == 3:
            break
    assert S.score_schedule(day, _load(max_periods=100), first3)["net_gbp"] == capped["net_gbp"]


def test_ceilings_and_caps_are_per_zone_and_a_too_big_load_scores_nothing():
    _, days = _setup()
    day = days[sorted(days)[3]]
    sched = [[sp, 40.0] for sp in range(23, 47)]
    z1 = S.score_schedule(day, _load(zone="Z1"), sched)
    z2 = S.score_schedule(day, _load(zone="Z2"), sched)
    assert z1["accepted_half_hours"] > 0 and z2["accepted_half_hours"] == 0      # synthetic data has Z1 ceilings only
    assert S.score_schedule(day, _load(capacity_mw=600.0), sched)["accepted_half_hours"] == 0   # caps are 500


def test_bid_above_the_ceiling_is_rejected_and_net_is_gross_plus_value_minus_energy():
    _, days = _setup()
    day = days[sorted(days)[3]]
    hh = next(h for h in day["half_hours"] if h["ceiling_gbp_per_mwh"]["Z1"] is not None and h["mid_gbp_per_mwh"] is not None and h["request"])
    ceiling = hh["ceiling_gbp_per_mwh"]["Z1"]
    assert S.score_schedule(day, _load(), [[hh["sp"], ceiling + 0.01]])["accepted_half_hours"] == 0
    ok = S.score_schedule(day, _load(), [[hh["sp"], ceiling]])
    assert ok["accepted_half_hours"] == 1
    assert abs(ok["net_gbp"] - (ok["gross_gbp"] + ok["value_gbp"] - ok["energy_cost_gbp"])) < 1e-9


def test_policy_schedules_do_not_depend_on_the_load_size():
    m, _ = _setup()
    event_days = sorted({d for d, _ in m.events})
    day = event_days[9]
    a = S.policy_schedules(m, day, event_days, "Z1", 100.0, C.Load(capacity_mw=10.0))
    b = S.policy_schedules(m, day, event_days, "Z1", 100.0, C.Load(capacity_mw=200.0))
    assert a == b


def test_ours_is_null_on_warmup_days_only():
    _, days = _setup()
    ordered = sorted(days)
    for i, d in enumerate(ordered):
        assert days[d]["ours_available"] == (i >= C.WARMUP_DAYS)
        ours = days[d]["policies"]["Z1"]["100"]["ours"]
        assert (ours is None) == (i < C.WARMUP_DAYS)


def test_test_vectors_are_reproducible_from_the_exported_inputs():
    m, days = _setup()
    vectors = S.test_vectors(days, LOAD)
    assert vectors
    for v in vectors:
        again = S.score_schedule(days[v["day"]], v["load"], v["schedule"])
        assert again == v["expected"]


def test_export_has_the_documented_shape_and_survives_json_round_trip():
    import json
    _, days = _setup()
    d = next(iter(days.values()))
    assert len(d["half_hours"]) == 48 and d["half_hours"][0]["sp"] == 1
    assert set(d["half_hours"][0]) == {"sp", "start_utc", "curtailed_mwh", "mid_gbp_per_mwh", "request",
                                       "caps_mw", "ceiling_gbp_per_mwh"}
    assert set(d["policies"]) == set(S.ZONES) and set(d["policies"]["Z1"]) == {"0", "50", "100", "150", "200"}
    blob = copy.deepcopy(d)
    assert json.loads(json.dumps(blob)) == blob
