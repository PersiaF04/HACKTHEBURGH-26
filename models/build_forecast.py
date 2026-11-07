"""Build data/public/forecast.json (lane B, issues #29, #30a and #58).

Usage, from the repo root:
    python models/build_forecast.py            # use cached inputs if present
    python models/build_forecast.py --refresh  # re-download every input first

Which model produces the periods:
1. flow_utilisation: if NESO has published a day-ahead flows snapshot for a day after today.
2. wind_forecast: otherwise, if NESO's day-ahead national wind forecast covers a day after today.
3. Neither: a same_day_replay of the latest published flows day (a retrospective illustration).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from turnup import forecast as F, inputs, turnup_prob as T  # noqa: E402
from turnup.fetch import ROOT  # noqa: E402

OUT = ROOT / "data" / "public" / "forecast.json"
FLOW, WIND = "flow_utilisation", "wind_forecast"


def select(flows: dict, wind: dict, issue_date: str) -> tuple[str, str, str]:
    """Return (target date, mode, model) following the rule in the module docstring."""
    target, mode = F.choose_target(flows, issue_date)
    if mode == "next_day":
        return target, mode, FLOW
    try:
        wind_target, wind_mode = F.choose_target(wind, issue_date)
    except RuntimeError:
        wind_target, wind_mode = target, "same_day_replay"
    if wind_mode == "next_day":
        return wind_target, wind_mode, WIND
    return target, "same_day_replay", FLOW


def leakage_note(model: str) -> str:
    if model == FLOW:
        return (
            f"Features: day-ahead {F.BOUNDARY} flow/limit for the target day (NESO publishes no per-row "
            f"issue time, so its vintage is unknown and every score is retrospective) and Scottish "
            f"curtailment from {F.PERSIST_LAG_DAYS} or more days earlier. Each backtest fold trains only "
            "on dates before the fold. No settlement, metered or DFS-procurement data is used as a feature.")
    return (
        "Features: NESO's national incentive wind forecast for the target day and Scottish curtailment from "
        f"{F.PERSIST_LAG_DAYS} or more days earlier. The live value for the target day is a genuine day-ahead "
        "forecast, but the archive used to fit and score the model is stamped on the target morning (a later, "
        "better-informed vintage), so the backtest scores are retrospective and probably optimistic for a "
        "day-ahead forecast. Each fold trains only on dates before the fold.")


def build(refresh: bool = False, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    issue_date = now.date().isoformat()
    curtail = inputs.scottish_curtailment(refresh)
    flows = inputs.flows(refresh)[F.BOUNDARY]
    wind = inputs.wind_feature(refresh)
    last_actual = max(d for d, _ in curtail)

    target, mode, model = select(flows, wind, issue_date)
    feature = flows if model == FLOW else wind
    rows = F.build_rows(curtail, feature, last_actual)
    backtest = F.backtest(rows, with_headroom=(model == FLOW))
    if model == FLOW:
        backtest["morning_update"] = F.morning_update_backtest(rows, inputs.national_wind_forecast(refresh))
    else:       # keep the flow model's scores alongside, so the two features can be compared
        flow_bt = F.backtest(F.build_rows(curtail, flows, last_actual))
        backtest["flow_model"] = {k: flow_bt[k] for k in ("test_window", "n_periods", "mae_mwh", "brier_heavy", "auc_heavy")}
    day = F.forecast_day(rows, target)

    reqs = inputs.dfs_requirements(refresh)
    events = inputs.turnup_events(reqs)
    last_dfs_day = max(r["date"] for r in reqs)
    obs = T.build_obs(events, feature, inputs.DFS_ERA_START, last_dfs_day)
    turnup_model = T.TurnupModel(obs) if obs else None
    backtest["turnup"] = T.evaluate(obs) if obs else {"available": False}
    if turnup_model:
        backtest["turnup"]["zone_cap_share_given_event"] = T.zone_share_given_event(events)
        backtest["turnup"]["feature"] = "flow utilisation" if model == FLOW else "national wind forecast"

    periods = [
        F.period_record(target, p["sp"], p,
                        turnup_model.prob(p["util"], p["sp"]) if turnup_model else None)
        for p in day
    ]
    sources = ["NESO Wind BOA Volumes", "NESO Day Ahead Wind BMU Forecast (region)", "NESO demand-flexibility (DFS)",
               "NESO day-ahead constraint flows and limits" if model == FLOW
               else "NESO Day Ahead Wind Forecast (national incentive forecast)"]
    return {
        "meta": {
            "source": sources,
            "generated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "retrospective": True,
            "model": model,
            "leakage_note": leakage_note(model),
            "mode": mode,
            "target_note": (
                "next_day: the earliest day after the issue date with a near-complete day-ahead input "
                f"({'flows snapshot' if model == FLOW else 'national wind forecast; no future flows snapshot was published'})."
                if mode == "next_day" else
                "same_day_replay: NESO had not published a day-ahead flows snapshot or wind forecast for any future "
                "day when this was issued, so this replays the latest published day (some or all of its periods have "
                "already elapsed). It is a retrospective illustration, NOT a next-day forecast. Rerun with --refresh "
                "once tomorrow's inputs are published."),
            "persistence_note": ("Persistence features are blank (the model falls back to the weather/grid feature "
                                 "only) when curtailment data for the lag day has not yet been published."),
            "region_definition": "Scottish = NESO Day Ahead Wind BMU Forecast Region of NORTH or SOUTH SCOTLAND",
            "last_actual_date": last_actual,
        },
        "issued_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target_date": target,
        "mode": mode,
        "periods": periods,
        "backtest": backtest,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true", help="re-download all inputs")
    args = ap.parse_args()
    doc = build(refresh=args.refresh)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    bt = doc["backtest"]
    print(f"wrote {OUT.relative_to(ROOT)}: {len(doc['periods'])} periods for {doc['target_date']} "
          f"({doc['mode']}, model {doc['meta']['model']})")
    print("MAE (MWh/half-hour):", bt["mae_mwh"])
    print("Brier (heavy):      ", bt["brier_heavy"])
    print("AUC (heavy):        ", bt["auc_heavy"])
    print("turn-up request:    ", {k: bt["turnup"].get(k) for k in ("brier", "auc", "scored_days")})
    if "flow_model" in bt:
        print("flow model (for comparison):", bt["flow_model"]["mae_mwh"])


if __name__ == "__main__":
    main()
