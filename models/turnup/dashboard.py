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
