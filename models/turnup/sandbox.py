"""Lane B, issue #76: inputs and a reference scorer for the interactive load sandbox (#75).

The map dashboard lets a judge place a load, set its size, zone and bid, and see the result at once. The
client needs (a) the per-half-hour facts the scoring depends on and (b) the scoring rule. This module
exports (a) and defines (b) in one small function, ``score_schedule``, that lane C ports to TypeScript.

The scorer works on the EXPORTED numbers (full floating-point precision, summed in time order), so a
port doing the same arithmetic reproduces the Python results exactly.
"""
from __future__ import annotations

from . import copilot as C
from .timeutil import iso_z, parse_date, sp_start_utc

ZONES = ("Z1", "Z2", "Z3")             # the only zones with a positive cap in any live request so far
VALUE_GRID = (0.0, 50.0, 100.0, 150.0, 200.0)

SCORING_RULE = [
    "Inputs: a load (capacity_mw, zone, value_gbp_per_mwh, max_periods) and a schedule of [sp, bid_gbp_per_mwh].",
    "Take the schedule in ascending sp order. Let accepted = 0, gross = 0, energy = 0, wind_matched = 0, mwh_period = capacity_mw * 0.5.",
    "For each [sp, bid]: stop if accepted >= max_periods. Look up that day's half-hour sp.",
    "Skip it unless ALL hold: request is true; caps_mw[zone] >= capacity_mw; ceiling_gbp_per_mwh[zone] is not null; "
    "mid_gbp_per_mwh is not null; bid <= ceiling_gbp_per_mwh[zone].",
    "Otherwise it is accepted: gross += bid * mwh_period; energy += mid_gbp_per_mwh * mwh_period; accepted += 1; "
    "wind_matched += min(mwh_period, curtailed_mwh).",
    "mwh = accepted * mwh_period. value_gbp = value_gbp_per_mwh * mwh. net_gbp = gross + value_gbp - energy.",
    "mwh is the electricity the LOAD buys and uses in the half-hours NESO would have accepted, assuming full delivery. "
    "It is NOT proof that the same MWh of curtailed wind was absorbed.",
    "wind_matched_mwh is an APPROXIMATE upper bound on how much of that could have been otherwise-curtailed wind: in each accepted "
    "half-hour the lesser of the load's use and the Scottish wind turned down in that half-hour (curtailed_mwh). It ignores which "
    "farms or zone the wind is in (the zone-to-region mapping is unconfirmed), and assumes no other load competes for the wind.",
    "Use IEEE doubles and the order above so results match to the cent. Compare with a tolerance of 0.005.",
]


def day_inputs(m: C.Market, curtail: dict, day: str) -> dict:
    """Per half-hour facts for one day. mid and ceilings are unrounded: the scorer must use them as exported."""
    date = parse_date(day)
    hours = []
    for sp in range(1, 49):
        ev = m.events.get((day, sp))
        hours.append({
            "sp": sp,
            "start_utc": iso_z(sp_start_utc(date, sp)),
            "curtailed_mwh": round(curtail.get((day, sp), 0.0), 3),
            "mid_gbp_per_mwh": m.mid.get((day, sp)),
            "request": ev is not None,
            "caps_mw": {z: (ev["caps"].get(z, 0) if ev else 0) for z in ZONES},
            "ceiling_gbp_per_mwh": {z: m.threshold.get((day, sp, z)) for z in ZONES},
        })
    return {"half_hours": hours}


def score_schedule(day: dict, load: dict, schedule: list) -> dict:
    """Reference scorer; the plain-words rule is SCORING_RULE. ``schedule`` is a list of [sp, bid].

    ``mwh`` is the load's own consumption (full delivery assumed). ``wind_matched_mwh`` is a separate,
    approximate upper bound on how much of it could have been otherwise-curtailed Scottish wind.
    """
    zone, mw = load["zone"], load["capacity_mw"]
    budget, value = load["max_periods"], load["value_gbp_per_mwh"]
    mwh_period = mw * 0.5
    gross = energy = wind_matched = 0.0
    accepted = 0
    for sp, bid in sorted(schedule, key=lambda s: s[0]):
        if accepted >= budget:
            break
        hh = day["half_hours"][sp - 1]
        ceiling, mid = hh["ceiling_gbp_per_mwh"][zone], hh["mid_gbp_per_mwh"]
        if (not hh["request"] or hh["caps_mw"][zone] < mw or ceiling is None or mid is None or bid > ceiling):
            continue
        gross += bid * mwh_period
        energy += mid * mwh_period
        wind_matched += min(mwh_period, hh["curtailed_mwh"])
        accepted += 1
    mwh = accepted * mwh_period
    value_gbp = value * mwh
    return {"mwh": mwh, "wind_matched_mwh": wind_matched, "gross_gbp": gross, "energy_cost_gbp": energy,
            "value_gbp": value_gbp, "net_gbp": gross + value_gbp - energy, "accepted_half_hours": accepted}


def policy_schedules(m: C.Market, day: str, event_days: list[str], zone: str, value: float,
                     base: C.Load) -> dict:
    """naive / ours / oracle schedules for one day, zone and site value (as lists of [sp, bid]).

    ``ours`` is null on warm-up days, where the Copilot has no earlier days to learn from. Schedules do not
    depend on the load's MW (they only rank half-hours), as long as MW is within every zone cap used.
    """
    load = C.Load(base.type, base.capacity_mw, zone, value, base.max_periods)
    train_days = [x for x in event_days if x < day]
    naive = C.naive_schedule(m, load, day, C.naive_price(m, load, train_days))
    ours = C.ours_schedule(m, load, day, train_days) if len(train_days) >= C.WARMUP_DAYS else None
    oracle = C.oracle_schedule(m, load, day)
    fmt = lambda s: None if s is None else [[sp, price] for sp, price in sorted(s)]  # noqa: E731
    return {"naive": fmt(naive), "ours": fmt(ours), "oracle": fmt(oracle)}


def build_days(m: C.Market, curtail: dict, base: C.Load) -> dict:
    event_days = sorted({d for d, _ in m.events})
    out = {}
    for day in event_days:
        entry = day_inputs(m, curtail, day)
        entry["ours_available"] = len([x for x in event_days if x < day]) >= C.WARMUP_DAYS
        entry["policies"] = {
            z: {str(int(v)): policy_schedules(m, day, event_days, z, v, base) for v in VALUE_GRID}
            for z in ZONES
        }
        out[day] = entry
    return out


def test_vectors(days: dict, base: C.Load) -> list[dict]:
    """Cases with expected results, computed by the reference scorer, for checking a TypeScript port."""
    cases: list[dict] = []

    def add(case_id: str, day: str, zone: str, mw: float, value: float, schedule: list, note: str):
        load = {"capacity_mw": mw, "zone": zone, "value_gbp_per_mwh": value, "max_periods": base.max_periods}
        cases.append({"id": case_id, "day": day, "load": load, "schedule": schedule, "note": note,
                      "expected": score_schedule(days[day], load, schedule)})

    # The Copilot's own policies at the default load, on every day that has a Copilot call.
    for day, entry in days.items():
        pol = entry["policies"]["Z1"]["100"]
        for name in ("naive", "ours", "oracle"):
            if pol[name] is not None and any(pol[name]):
                add(f"{name}-{day}-Z1-100", day, "Z1", base.capacity_mw, 100.0, pol[name],
                    f"{name} policy, default load; matches copilot.json for scored days")
    # User-style schedules: bid the same price in every half-hour from 11:00 to 23:00 local.
    window = [sp for sp in range(23, 47)]
    for day in ("2026-10-27", "2026-10-14"):
        if day in days:
            for bid in (45.0, 60.0, 70.0):
                add(f"always-{int(bid)}-{day}-Z1-50-100", day, "Z1", 50.0, 100.0, [[sp, bid] for sp in window],
                    f"user bids {bid:g} in every half-hour 11:00-23:00 local")
    if "2026-10-27" in days:
        add("always-60-2026-10-27-Z1-20-0", "2026-10-27", "Z1", 20.0, 0.0, [[sp, 60.0] for sp in window],
            "smaller load, zero site value")
        add("always-60-2026-10-27-Z2-50-100", "2026-10-27", "Z2", 50.0, 100.0, [[sp, 60.0] for sp in window],
            "different zone: ceilings are per zone")
        add("too-big-2026-10-27-Z1-600-100", "2026-10-27", "Z1", 600.0, 100.0, [[sp, 60.0] for sp in window],
            "600 MW exceeds the 500 MW zone cap, so nothing is accepted")
    return cases
