"""Offline tests for the Flex Copilot: scoring arithmetic and the three policies."""
import datetime as dt
import random

from turnup import copilot as C

LOAD = C.Load(type="electrolyser", capacity_mw=50.0, zone="Z1", value_gbp_mwh=100.0, max_periods=4)


def tiny_market():
    """One event day: sp 30 is cheap and tradable up to 70; sp 31 is dear; sp 32 has no accepted bid."""
    day = "2026-10-20"
    caps = {"Z1": 500.0}
    events = {(day, sp): {"caps": caps} for sp in (30, 31, 32)}
    return day, C.Market(
        events=events,
        threshold={(day, 30): 70.0, (day, 31): 60.0},
        mid={(day, 30): 40.0, (day, 31): 190.0, (day, 32): 50.0},
        util={(day, sp): 1.0 for sp in range(23, 47)},
    )


def test_settle_charges_energy_and_pays_bid_only_when_accepted():
    day, m = tiny_market()
    r = C.settle(m, LOAD, day, [(30, 60.0), (31, 60.0), (32, 60.0)])
    # sp30: accepted (60 <= 70). sp31: accepted (60 <= 60). sp32: no accepted bid anywhere, so not tradable.
    mwh = 25.0
    assert r["accepted"] == 2 and r["mwh"] == 2 * mwh
    assert r["gross"] == 2 * 60.0 * mwh
    assert r["energy"] == (40.0 + 190.0) * mwh
    assert r["net"] == r["gross"] + 100.0 * r["mwh"] - r["energy"]


def test_bid_above_ceiling_is_rejected():
    day, m = tiny_market()
    assert C.settle(m, LOAD, day, [(31, 61.0)])["accepted"] == 0


def test_zone_cap_must_cover_the_load():
    day, m = tiny_market()
    small = C.Load(zone="Z1", capacity_mw=600.0)
    assert C.tradable(m, small, day, 30) is None
    assert C.tradable(m, C.Load(zone="Z9"), day, 30) is None


def test_oracle_skips_loss_making_half_hours_and_bids_at_ceiling():
    day, m = tiny_market()
    sched = C.oracle_schedule(m, C.Load(value_gbp_mwh=0.0, max_periods=4), day)
    assert sched == [(30, 70.0)]          # sp31 loses money at zero value (60 - 190 < 0)
    assert dict(C.oracle_schedule(m, LOAD, day)) == {30: 70.0}      # at value 100, sp31 is 60 + 100 - 190 < 0
    rich = C.Load(value_gbp_mwh=200.0, max_periods=4)
    assert dict(C.oracle_schedule(m, rich, day)) == {30: 70.0, 31: 60.0}   # at value 200 it pays: 60 + 200 - 190 > 0


def test_naive_picks_cheapest_electricity_half_hours_with_fixed_price():
    day, m = tiny_market()
    sched = C.naive_schedule(m, C.Load(max_periods=2), day, 55.0)
    assert sched == [(30, 55.0), (32, 55.0)] and all(p == 55.0 for _, p in sched)


def synthetic_history(days=12, seed=5):
    rnd = random.Random(seed)
    events, threshold, mid, util = {}, {}, {}, {}
    start = dt.date(2026, 10, 7)
    for i in range(days):
        d = (start + dt.timedelta(days=i)).isoformat()
        for sp in C.WINDOW:
            u = rnd.random()
            util[(d, sp)] = u
            mid[(d, sp)] = 200.0 - 150.0 * u + rnd.gauss(0, 10)
            events[(d, sp)] = {"caps": {"Z1": 500.0}}
            if u > 0.4:
                threshold[(d, sp)] = rnd.choice([50.0, 60.0, 70.0])
    return C.Market(events=events, threshold=threshold, mid=mid, util=util)


def test_oracle_is_never_worse_than_ours_or_naive_each_day():
    m = synthetic_history()
    res = C.run(m, LOAD)
    for _d, _sched, r in res["per_day"]:
        assert r["oracle"]["net"] >= r["ours"]["net"] - 1e-6
        assert r["oracle"]["net"] >= r["naive"]["net"] - 1e-6


def test_ours_uses_only_earlier_days():
    m = synthetic_history()
    day = sorted({d for d, _ in m.events})[8]
    train = [d for d, _ in sorted(m.events) if d < day]
    train = sorted(set(train))
    base = C.ours_schedule(m, LOAD, day, train)
    for k in list(m.threshold):                      # poison the target day and everything after it
        if k[0] >= day:
            m.threshold[k] = 999.0
    assert C.ours_schedule(m, LOAD, day, train) == base


def test_budget_is_respected_and_pct_of_oracle_matches_totals():
    m = synthetic_history()
    res = C.run(m, LOAD)
    for _d, sched, _r in res["per_day"]:
        assert all(len(s) <= LOAD.max_periods for s in sched.values())
    t = res["totals"]
    expected = None if t["oracle"]["net"] <= 0 else round(t["ours"]["net"] / t["oracle"]["net"], 3)
    assert C.pct_of_oracle(t) == expected
    assert [d["date"] for d in res["days"]] == res["scored_days"]


def test_break_even_value_is_energy_minus_settlement_per_mwh():
    totals = {"ours": {"gross": 600.0, "energy": 1100.0, "mwh": 10.0}}
    assert C.break_even_value(totals, "ours") == 50.0
    assert C.break_even_value({"ours": {"gross": 0, "energy": 0, "mwh": 0}}, "ours") is None
