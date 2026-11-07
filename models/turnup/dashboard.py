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
    if is_calm(facts):
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


# Issue #100: the content of the "Tomorrow's Predictions" section, so the web app only has to render it.
# Every sentence and number below is templated from forecast.json and copilot.json.

def is_calm(facts: dict) -> bool:
    return facts["total_p50_mwh"] == 0 and facts["peak_p_heavy"] < CALM_P_HEAVY


def _metric(bt: dict, key: str, label: str, unit: str, lower_is_better: bool, baselines: dict[str, str]) -> dict:
    """One row of the 'how we know' strip: our score beside the baselines it has to beat."""
    scores = bt[key]
    return {"id": key, "label": label, "unit": unit, "lower_is_better": lower_is_better,
            "model": scores["model"],
            "baselines": [{"id": k, "label": lbl, "value": scores[k]} for k, lbl in baselines.items() if k in scores]}


def predictions_block(forecast: dict, copilot: dict | None = None) -> dict:
    """Everything the Tomorrow's Predictions section shows, as data: headline, fact cards, a per-half-hour
    table, a calm-day state and a backtest strip. 'Tomorrow' appears only when the forecast mode is next_day."""
    t = tomorrow_block(forecast)
    facts, bt, meta = t["facts"], forecast["backtest"], forecast["meta"]
    mode, date = t["mode"], t["target_date"]
    next_day = mode == "next_day"
    day = "tomorrow" if next_day else f"the latest published day ({_weekday_label(date)})"
    turnup = bt.get("turnup") or {}
    mae = bt["mae_mwh"]
    cov = bt["interval_coverage_p10_p90"]
    lo, hi = facts["request_window_utc"] or (None, None)

    retro = {"source": "forecast.json backtest",
             "caveat": "Scored after the fact on archived data; probably optimistic for a true day-ahead forecast."}
    cards = [
        {"id": "wasted_wind", "label": f"Wasted wind expected {day} (median)", "value": facts["total_p50_mwh"],
         "unit": "MWh", "display": f"{facts['total_p50_mwh']:,} MWh", "source": "forecast.json periods[].curtailed_mwh_p50",
         "caveat": f"Median of the model's range; the upper end (p90) peaks at {facts['peak_p90_mwh']:,} MWh in one half-hour."},
        {"id": "heavy_chance",
         "label": f"Highest chance of a heavy half-hour (over {round(bt['heavy_threshold_mwh']):,} MWh)",
         "value": facts["peak_p_heavy"], "unit": "probability", "display": _pct(facts["peak_p_heavy"]),
         "source": "forecast.json periods[].p_heavy",
         "caveat": f"The p10-p90 band covered {round(cov * 100)}% of outcomes in the backtest, not 80%."},
        {"id": "request_chance", "label": "Highest chance NESO asks for flexible demand",
         "value": facts["peak_p_request"], "unit": "probability", "display": _pct(facts["peak_p_request"]),
         "window_utc": facts["request_window_utc"], "source": "forecast.json periods[].p_turnup_request",
         "caveat": (f"Provisional: about 4 weeks of NESO demand-flexibility history ({turnup.get('scored_days', '?')} "
                    f"scored days), AUC {turnup.get('auc', {}).get('model', '?')}.")},
        {"id": "backtest_mae", "label": "Typical miss per half-hour in the backtest",
         "value": mae["model"], "unit": "MWh",
         "display": f"{round(mae['model']):,} MWh vs {round(mae['persistence']):,} for 'same as 2 days ago'", **retro},
    ]
    if copilot:
        s = copilot["summary"]
        cards.append({"id": "copilot_vs_hindsight",
                      "label": "Copilot on past request days (retrospective, not revenue)",
                      "value": s["pct_of_oracle"], "unit": "fraction of perfect hindsight",
                      "display": f"{round(s['pct_of_oracle'] * 100, 1)}% of perfect hindsight",
                      "source": "copilot.json summary.pct_of_oracle",
                      "caveat": (f"Replay over {copilot['meta']['scored_days']} scored days; only {s['tradable_half_hours']} "
                                 "half-hours were tradable, full delivery assumed. Not a revenue claim.")})

    table = [{"start_utc": p["start_utc"], "time_utc": _hhmm(p["start_utc"]),
              "p_heavy": p["p_heavy"], "p50_mwh": p["curtailed_mwh_p50"],
              "p10_mwh": p["curtailed_mwh_p10"], "p90_mwh": p["curtailed_mwh_p90"],
              "p_request": p.get("p_turnup_request")} for p in forecast["periods"]]

    calm_state = {"is_calm": False, "title": None, "message": None}
    if is_calm(facts):
        req = (f" NESO still has up to a {_pct(facts['peak_p_request'])} chance of asking for flexible demand between "
               f"{lo} and {hi} UTC, so a request is possible even on a quiet day." if facts["request_window_utc"] else "")
        calm_state = {"is_calm": True, "title": "A calm day",
                      "message": (f"The median forecast for {day} is {facts['total_p50_mwh']} MWh of wasted wind, and the "
                                  f"highest chance of a heavy half-hour is {_pct(facts['peak_p_heavy'])}.{req}")}

    return {
        "target_date": date, "mode": mode, "is_tomorrow": next_day,
        "section_title": "Tomorrow's Predictions" if next_day else "Latest published day (a replay, not tomorrow)",
        "issued_utc": forecast.get("issued_utc"), "headline": t["headline"],
        "calm": calm_state, "facts": cards, "table": table,
        "how_we_know": {
            "retrospective": True, "test_window": bt["test_window"], "n_half_hours": bt["n_periods"],
            "method": bt["method"], "leakage_note": meta["leakage_note"],
            "metrics": [
                _metric(bt, "mae_mwh", "Average miss per half-hour", "MWh", True,
                        {"persistence": "Same as 2 days ago", "training_mean": "Training average"}),
                _metric(bt, "brier_heavy", "Brier score for 'heavy half-hour' (0 is perfect)", "score", True,
                        {"persistence": "Same as 2 days ago", "prior": "Always the base rate"}),
                _metric(bt, "auc_heavy", "AUC for 'heavy half-hour' (0.5 is a coin flip)", "score", False,
                        {"persistence": "Same as 2 days ago"}),
            ],
            "band": {"p10_p90_coverage": cov, "nominal": 0.8,
                     "note": f"The shaded p10-p90 band is meant to hold 80% of outcomes; in the backtest it held {round(cov * 100)}%."},
            "request_model": {"available": bool(turnup.get("available")), "scored_days": turnup.get("scored_days"),
                              "auc": turnup.get("auc", {}).get("model"), "brier": turnup.get("brier", {}).get("model"),
                              "brier_base_rate": turnup.get("brier", {}).get("base_rate"),
                              "caveat": "Provisional: about 4 weeks of NESO demand-flexibility history, AUC about 0.65."},
        },
        "caveats": [
            "Results are retrospective: scored after the fact, and probably optimistic for a true day-ahead forecast.",
            "Nothing here is a revenue claim; the Copilot figure replays procured and accepted data, not delivery.",
        ],
    }
