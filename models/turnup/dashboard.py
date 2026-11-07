"""Lane B, issue #74: dashboard.json, the summaries the map dashboard (#73) shows.

Everything here is derived from files already on main (forecast.json, copilot.json, the replay index and
the DFS events). The headline sentence is templated from the numbers beside it, so it cannot say anything
the data does not. Nothing here changes a model.
"""
from __future__ import annotations

import datetime as dt
from statistics import median

from . import turnup_prob as T
from .timeutil import iso_z, parse_date, sp_start_utc

HEAVY_P = 0.5            # a half-hour counts as "heavy" for the headline when P(heavy) is at least this
CALM_P_HEAVY = 0.2       # below this peak P(heavy), with zero median curtailment, the day is called calm


def _hhmm(iso: str) -> str:
    return iso[11:16]


def _weekday_label(date: str) -> str:
    d = dt.date.fromisoformat(date)
    return f"{d.strftime('%A')} {d.day} {d.strftime('%b')}"


def _pct(p: float) -> str:
    return "under 1%" if 0 < p < 0.005 else f"{round(p * 100)}%"


def headline(facts: dict, date: str, mode: str) -> str:
    """One sentence, templated from ``facts``. Never says 'tomorrow' unless the mode is next_day."""
    when = _weekday_label(date)
    prefix = f"Tomorrow, {when}" if mode == "next_day" else f"Latest published day, {when} (a replay, not tomorrow)"
    req = ""
    if facts["request_window_utc"]:
        lo, hi = facts["request_window_utc"]
        req = (f" NESO has up to a {_pct(facts['peak_p_request'])} chance of asking for flexible demand "
               f"between {lo} and {hi} UTC.")
    calm = facts["total_p50_mwh"] == 0 and facts["peak_p_heavy"] < CALM_P_HEAVY
    if calm:
        heavy = ("essentially no chance" if facts["peak_p_heavy"] < 0.005
                 else f"at most a {_pct(facts['peak_p_heavy'])} chance")
        return f"{prefix}: calm. Little or no wasted wind is expected, with {heavy} of a heavy half-hour.{req}"
    peak_t = _hhmm(facts["peak_p50_start_utc"]) if facts["peak_p50_start_utc"] else "n/a"
    return (f"{prefix}: expect about {facts['total_p50_mwh'] / 1000:.1f} GWh of wasted wind, peaking near "
            f"{facts['peak_p50_mwh']:,} MWh at {peak_t} UTC, with up to a {_pct(facts['peak_p_heavy'])} "
            f"chance of a heavy half-hour.{req}")


def tomorrow_block(forecast: dict) -> dict:
    """Headline, supporting numbers, request probability and caveat for the target day in forecast.json."""
    periods = forecast["periods"]
    meta, mode, date = forecast["meta"], forecast["mode"], forecast["target_date"]
    p50 = [p["curtailed_mwh_p50"] or 0 for p in periods]
    p90 = [p["curtailed_mwh_p90"] or 0 for p in periods]
    ph = [p["p_heavy"] or 0 for p in periods]
    req = [(p["start_utc"], p["p_turnup_request"]) for p in periods if p.get("p_turnup_request")]
    peak_i = max(range(len(periods)), key=lambda i: p50[i]) if periods else 0
    facts = {
        "total_p50_mwh": round(sum(p50)),
        "peak_p50_mwh": max(p50, default=0),
        "peak_p50_start_utc": periods[peak_i]["start_utc"] if periods else None,
        "peak_p90_mwh": max(p90, default=0),
        "peak_p_heavy": round(max(ph, default=0), 3),
        "heavy_half_hours": sum(1 for p in ph if p >= HEAVY_P),
        "peak_p_request": round(max((p for _, p in req), default=0), 3),
        "request_window_utc": [_hhmm(req[0][0]), _hhmm(req[-1][0])] if req else None,
    }
    return {
        "target_date": date, "mode": mode, "model": meta.get("model"),
        "headline": headline(facts, date, mode),
        "facts": facts,
        "request_probability": [{"start_utc": p["start_utc"], "p_turnup_request": p.get("p_turnup_request")}
                                for p in periods],
        "caveat": ("Retrospective: the backtest uses archived data and is probably optimistic. "
                   "The request probability is provisional (about one month of NESO events)."
                   + ("" if mode == "next_day"
                      else " This is a replay of the latest published day, not a forecast of tomorrow.")),
    }


def merge_windows(starts: list[str], step_minutes: int = 30) -> list[list[str]]:
    """Merge half-hour start times into [start, end] windows (end is when the last half-hour finishes)."""
    step = dt.timedelta(minutes=step_minutes)
    times = sorted(dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ") for s in starts)
    windows: list[list[dt.datetime]] = []
    for t in times:
        if windows and t == windows[-1][1]:
            windows[-1][1] = t + step
        else:
            windows.append([t, t + step])
    return [[iso_z(a), iso_z(b)] for a, b in windows]


def replay_request_probability(date: str, obs: list[T.Obs], feature: dict, events: dict,
                               era_start: str) -> list[dict]:
    """Walk-forward P(NESO publishes a turn-up request) for each half-hour of a replay day.

    The model sees only days before ``date``. ``p_turnup_request`` is null when there is not enough
    history (or the day is before requests existed); ``actual_request`` is what really happened.
    """
    train = [o for o in obs if o.date < date]
    enough = date >= era_start and len({o.date for o in train}) >= T.MIN_TRAIN_DAYS
    model = T.TurnupModel(train) if enough else None
    out = []
    for sp in range(1, 49):
        u = feature.get((date, sp))
        p = round(model.prob(u, sp), 3) if model is not None and u is not None else None
        out.append({"start_utc": iso_z(sp_start_utc(parse_date(date), sp)),
                    "p_turnup_request": p, "actual_request": (date, sp) in events})
    return out


def copilot_call(date: str, copilot: dict, event_days: list[str], era_start: str) -> dict:
    """The Copilot's call for one replay day, or the reason it has none."""
    load, summary = copilot["load"], copilot["summary"]
    day = next((d for d in copilot["days"] if d["date"] == date), None)
    if day is None:
        warm = copilot["meta"].get("warmup_days", 0)
        if date < era_start:
            why = "NESO had not begun procuring turn-up on this day, so there was nothing to answer."
        elif date in event_days[:warm]:
            why = (f"Warm-up day: the first {warm} request days only train the Copilot's acceptance model, "
                   "so it makes no scored call.")
        else:
            why = "Not in the Copilot's scored set (no request days to replay)."
        return {"status": "not_scored", "reason": why}
    pol = day["policies"]
    starts = [s["start_utc"] for s in day["schedule"] if s["action"] == "ready"]
    bids = sorted({s["bid_gbp_per_mwh"] for s in day["schedule"]
                   if s["action"] == "ready" and s["bid_gbp_per_mwh"] is not None})
    oracle, ours = pol["oracle"]["gbp"], pol["ours"]["gbp"]
    call = {
        "status": "scored",
        "ready_windows_utc": merge_windows(starts),
        "ready_half_hours": len(starts),
        "bid_gbp_per_mwh": bids[0] if len(bids) == 1 else (median(bids) if bids else None),
        "bid_range_gbp_per_mwh": [bids[0], bids[-1]] if len(bids) > 1 else None,
        "net_gbp": {k: pol[k]["gbp"] for k in ("naive", "ours", "oracle")},
        "pct_of_oracle": round(ours / oracle, 3) if oracle and oracle > 0 else None,
        "caveat": (f"Replay, net of electricity at an assumed site value of GBP {load.get('value_gbp_per_mwh', '?')}/MWh. "
                   f"Only {summary.get('tradable_half_hours', '?')} half-hours were tradable for zone {load['zone']} across "
                   f"the {copilot['meta'].get('scored_days', '?')} scored days. Full delivery is assumed (optimistic). "
                   "Zone IDs are not confirmed as Scotland."),
    }
    if not starts:
        call["note"] = "No tradable half-hour for this zone on this day: nothing to answer, so nothing is scheduled."
    return call


def build_replay_days(dates: list[str], copilot: dict, obs: list[T.Obs], feature: dict, events: dict,
                      event_days: list[str], era_start: str) -> list[dict]:
    return [{"date": d,
             "request_probability": replay_request_probability(d, obs, feature, events, era_start),
             "copilot": copilot_call(d, copilot, event_days, era_start)} for d in dates]


# ---- Optimised Model section (issue #100) ----------------------------------------------------------------

def _gbp(x: float) -> str:
    return f"-£{abs(round(x)):,}" if x < 0 else f"£{round(x):,}"


def _dm(date: str) -> str:
    d = dt.date.fromisoformat(date)
    return f"{d.day} {d.strftime('%b')}"


def break_even_vs_naive(sensitivity: list[dict]) -> float | None:
    """Site value at which the naive policy overtakes ours, interpolated between the two grid points where
    (ours - naive) changes sign. None if ours never loses on the grid."""
    pts = [(s["value_gbp_per_mwh"], s["net_gbp"]["ours"] - s["net_gbp"]["naive"]) for s in sensitivity]
    for (v0, d0), (v1, d1) in zip(pts, pts[1:]):
        if d0 > 0 >= d1:
            return round(v0 + (v1 - v0) * d0 / (d0 - d1), 1)
    return None


def _card(day: dict, load: dict) -> dict:
    pol = day["policies"]
    starts = [s["start_utc"] for s in day["schedule"] if s["action"] == "ready"]
    bids = sorted({s["bid_gbp_per_mwh"] for s in day["schedule"] if s["bid_gbp_per_mwh"] is not None})
    net = {k: pol[k]["gbp"] for k in ("naive", "ours", "oracle")}
    oracle, ours, naive = net["oracle"], net["ours"], net["naive"]
    when = _weekday_label(day["date"])
    if oracle > 0:
        status = "traded"
        bid = f"£{bids[0]:g}/MWh" if len(bids) == 1 else f"£{bids[0]:g} to £{bids[-1]:g}/MWh"
        text = (f"{when}: the Copilot readied {len(starts)} half-hours at {bid} and netted {_gbp(ours)} "
                f"({round(ours / oracle * 100, 1):g}% of perfect hindsight, {_gbp(oracle)}); the naive rule netted {_gbp(naive)}.")
    elif starts:
        status = "bid_not_accepted"
        text = (f"{when}: nothing was tradable for zone {load['zone']} (no bid could have been accepted). The Copilot "
                f"readied {len(starts)} half-hours anyway and earned nothing; the naive rule netted {_gbp(naive)}.")
    elif naive < 0:
        status = "stayed_out_naive_lost"
        text = (f"{when}: nothing was tradable for zone {load['zone']}, so the Copilot bid nothing. "
                f"The naive rule bid anyway and lost {_gbp(-naive)}.")
    else:
        status = "nothing_tradable"
        text = f"{when}: nothing was tradable for zone {load['zone']}, so there was nothing to answer."
    return {
        "date": day["date"], "status": status, "text": text,
        "ready_windows_utc": merge_windows(starts), "ready_half_hours": len(starts),
        "bid_gbp_per_mwh": bids[0] if len(bids) == 1 else (median(bids) if bids else None),
        "net_gbp": net, "mwh": {k: pol[k]["mwh"] for k in ("naive", "ours", "oracle")},
        "accepted_half_hours": {k: pol[k]["accepted_periods"] for k in ("naive", "ours", "oracle")},
        "pct_of_oracle": round(ours / oracle, 3) if oracle > 0 else None,
    }


def optimised_block(copilot: dict, sandbox: dict, forecast: dict) -> dict:
    """Content for the Optimised Model section. Every sentence is templated from the numbers beside it."""
    load, summ, meta = copilot["load"], copilot["summary"], copilot["meta"]
    value = load["value_gbp_per_mwh"]
    sens = [{"value_gbp_per_mwh": s["value_gbp_per_mwh"], "net_gbp": s["net_gbp"],
             "pct_of_oracle": round(s["net_gbp"]["ours"] / s["net_gbp"]["oracle"], 3) if s["net_gbp"]["oracle"] > 0 else None,
             "ours_beats_naive": s["net_gbp"]["ours"] > s["net_gbp"]["naive"]} for s in copilot["sensitivity"]]
    at = next((s for s in sens if s["value_gbp_per_mwh"] == value), None)
    be = break_even_vs_naive(copilot["sensitivity"])
    cards = [_card(d, load) for d in copilot["days"]]
    gross, energy = summ["gross_settlement_gbp"], summ["energy_cost_gbp"]
    traded = [c for c in cards if c["status"] == "traded"]
    ours_total = sum(c["net_gbp"]["ours"] for c in cards)
    lead = max(traded, key=lambda c: c["net_gbp"]["ours"], default=None)
    settled = copilot["validation"]["settled_to_accepted_cost_ratio_all_dfs"]
    scored = {c["date"] for c in cards}
    no_call = sorted(d for d, v in sandbox["days"].items()
                     if d not in scored and any(h["request"] for h in v["half_hours"]))

    thin = [
        {"id": "one_day", "text": (
            f"{len(traded)} of {len(cards)} scored days {'carries' if len(traded) == 1 else 'carry'} all the value"
            + (f" ({_weekday_label(lead['date'])} is {round(lead['net_gbp']['ours'] / ours_total * 100)}% of the Copilot's net)"
               if lead and ours_total > 0 else "") + ". The rest had nothing tradable.")},
        {"id": "few_half_hours", "text": (
            f"Only {summ['tradable_half_hours']} half-hours were tradable for zone {load['zone']}, so the share of "
            "perfect hindsight rests on a handful of events, not a trend.")},
        {"id": "needs_site_value", "text": (
            f"Net £ = settlement + assumed site value x MWh - electricity. Without the £{value:g}/MWh site value the "
            f"settlement ({_gbp(gross)}) does not cover the electricity ({_gbp(energy)}): {_gbp(gross - energy)}.")},
        {"id": "site_value_sensitive", "text": (
            (f"The {round(at['pct_of_oracle'] * 100, 1):g}% of perfect hindsight holds only at £{value:g}/MWh. "
             if at and at["pct_of_oracle"] else "")
            + " ".join(f"At £{s['value_gbp_per_mwh']:g} it is {round(s['pct_of_oracle'] * 100, 1):g}%"
                       + (" and the naive rule beats ours" if not s["ours_beats_naive"] else "") + "."
                       for s in sens if s["value_gbp_per_mwh"] > value and s["pct_of_oracle"] is not None))},
        {"id": "settled_cost", "text": (
            f"Full delivery is assumed. NESO's published settled cost is only {round(settled * 1000) / 10:g}% of accepted "
            "cost across demand-flexibility so far, so real payments could be lower.")},
        {"id": "unconfirmed", "text": (
            "Replay of past NESO requests, not a revenue claim. Zones Z1 to Z3 are IDs; they are not confirmed as Scotland. "
            f"{len(no_call)} early request days ({', '.join(_dm(d) for d in no_call)}) are "
            "warm-up: the Copilot makes no call on them.")},
    ]
    headline = (
        f"Replaying {meta['scored_days']} days, the Copilot's net was {_gbp(summ['net_gbp']['ours'])} against "
        f"{_gbp(summ['net_gbp']['oracle'])} for perfect hindsight and {_gbp(summ['net_gbp']['naive'])} for the naive rule, "
        f"at an assumed site value of £{value:g}/MWh"
        + (f". The naive rule overtakes it at about £{be:g}/MWh." if be is not None else ".")
        + " This is a retrospective replay, not revenue.")
    fp = [p["p_turnup_request"] for p in forecast["periods"] if p.get("p_turnup_request")]
    return {
        "headline": headline,
        "load": {"type": load["type"], "capacity_mw": load["capacity_mw"], "zone": load["zone"],
                 "assumed_site_value_gbp_per_mwh": value, "max_half_hours_per_day": load["max_periods_per_day"]},
        "how_it_works": {
            "steps": [
                "NESO publishes a request for extra demand in some half-hours, with a price ceiling per zone. A bid is accepted only if a request is live, the zone has room for the load, and the bid is at or below the ceiling.",
                f"Each day the Copilot only looks at {copilot['assumptions']['window_local']} local time and readies at most {load['max_periods_per_day']} half-hours.",
                "It scores every candidate half-hour by expected margin: the chance the bid is accepted, times (the price plus what the energy is worth to the site, minus the electricity price), times the MWh.",
                "The chance of acceptance is learned only from earlier days, split by electricity price and by how full the cable south is forecast to be.",
                "It tries each bid price seen in the history and keeps the single price whose best half-hours add up to the most expected margin. Half-hours with no expected margin are left out.",
                "Accepted half-hours are paid the bid price per MWh (pay-as-bid). The site buys the electricity at the market index price and counts the energy as worth the site value per MWh.",
            ],
            "policies": [
                {"id": "naive", "label": "Naive", "rule": copilot["assumptions"]["naive_rule"]},
                {"id": "ours", "label": "Ours (the Copilot)", "rule": copilot["assumptions"]["ours_rule"]},
                {"id": "oracle", "label": "Perfect hindsight", "rule": copilot["assumptions"]["oracle_rule"]},
            ],
            "net_formula": "net £ = gross settlement + assumed site value x MWh - electricity",
            "mwh_note": "MWh is what the load itself uses in accepted half-hours. It is not proof that the same MWh of switched-off wind was absorbed.",
        },
        "sensitivity": sens,
        "break_even_site_value_gbp_per_mwh": be,
        "break_even_note": ("Site value at which the naive rule overtakes ours, interpolated between the grid points either side "
                            "of the crossing. Below it ours is ahead; above it naive is." if be is not None else None),
        "at_assumed_value": at,
        "without_site_value": {"gross_settlement_gbp": gross, "energy_cost_gbp": energy, "net_gbp": gross - energy,
                               "note": "Settlement minus electricity for the Copilot's schedule at the assumed value. Not a profit."},
        "where_it_is_thin": thin,
        "days": cards,
        "no_call_days": no_call,
        "outlook": {"target_date": forecast["target_date"], "mode": forecast["mode"],
                    "peak_p_request": round(max(fp, default=0), 3),
                    "note": "The Copilot replays past days. It does not schedule the forecast day; see Tomorrow's Predictions for request odds."},
        "caveat": summ["caveat"],
    }
