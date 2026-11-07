"""Build data/public/forecast.json (lane B, issue #29 and #30a).

Usage, from the repo root:
    python models/build_forecast.py            # use cached inputs if present
    python models/build_forecast.py --refresh  # re-download every input first
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


def build(refresh: bool = False, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    curtail = inputs.scottish_curtailment(refresh)
    util = inputs.flows(refresh)[F.BOUNDARY]
    last_actual = max(d for d, _ in curtail)
    rows = F.build_rows(curtail, util, last_actual)
    backtest = F.backtest(rows)
    backtest["morning_update"] = F.morning_update_backtest(rows, inputs.national_wind_forecast(refresh))

    target, mode = F.choose_target(util, issue_date=now.date().isoformat())
    day = F.forecast_day(rows, target)

    reqs = inputs.dfs_requirements(refresh)
    events = inputs.turnup_events(reqs)
    last_dfs_day = max(r["date"] for r in reqs)
    obs = T.build_obs(events, util, inputs.DFS_ERA_START, last_dfs_day)
    turnup_model = T.TurnupModel(obs) if obs else None
    backtest["turnup"] = T.evaluate(obs) if obs else {"available": False}
    if turnup_model:
        backtest["turnup"]["zone_cap_share_given_event"] = T.zone_share_given_event(events)

    periods = [
        F.period_record(target, p["sp"], p,
                        turnup_model.prob(p["util"], p["sp"]) if turnup_model else None)
        for p in day
    ]
    return {
        "meta": {
            "source": ["NESO Wind BOA Volumes", "NESO Day Ahead Wind BMU Forecast (region)",
                       "NESO day-ahead constraint flows and limits", "NESO demand-flexibility (DFS)"],
            "generated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "retrospective": True,
            "leakage_note": (
                f"Features: day-ahead {F.BOUNDARY} flow/limit for the target day (NESO publishes no per-row "
                f"issue time, so its vintage is unknown and every score is retrospective) and Scottish "
                f"curtailment from {F.PERSIST_LAG_DAYS} or more days earlier. Each backtest fold trains only "
                "on dates before the fold. No settlement, metered or DFS-procurement data is used as a feature."),
            "mode": mode,
            "target_note": (
                "next_day: the earliest day after the issue date with a near-complete day-ahead flows snapshot."
                if mode == "next_day" else
                "same_day_replay: NESO had not published a day-ahead flows snapshot for any future day when this was "
                "issued, so this replays the latest published day (some or all of its periods have already elapsed). "
                "It is a retrospective illustration, NOT a next-day forecast. Rerun with --refresh once tomorrow's "
                "snapshot is published."),
            "persistence_note": ("Persistence features are blank (the model falls back to utilisation only) when "
                                 "curtailment data for the lag day has not yet been published."),
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
    print(f"wrote {OUT.relative_to(ROOT)}: {len(doc['periods'])} periods for {doc['target_date']} ({doc['mode']})")
    print("MAE (MWh/half-hour):", bt["mae_mwh"])
    print("Brier (heavy):      ", bt["brier_heavy"])
    print("AUC (heavy):        ", bt["auc_heavy"])
    print("turn-up request:    ", {k: bt["turnup"].get(k) for k in ("brier", "auc", "scored_days")})
    mu = bt["morning_update"]
    print("morning update (sensitivity):", mu.get("mae_mwh"), mu.get("brier_heavy"))


if __name__ == "__main__":
    main()
