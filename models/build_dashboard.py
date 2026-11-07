"""Build data/public/dashboard.json (lane B, issue #74): the summaries the map dashboard shows.

Derived from forecast.json, copilot.json and the replay index already in data/public/, plus the DFS
events (for the walk-forward request probability on replay days). Run build_forecast.py and
build_copilot.py first if you want it to reflect fresh data.

Usage, from the repo root:
    python models/build_dashboard.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from turnup import dashboard as D, forecast as F, inputs, turnup_prob as T  # noqa: E402
from turnup.fetch import ROOT  # noqa: E402

PUBLIC = ROOT / "data" / "public"
OUT = PUBLIC / "dashboard.json"


def build(refresh: bool = False, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    forecast = json.loads((PUBLIC / "forecast.json").read_text(encoding="utf-8"))
    copilot = json.loads((PUBLIC / "copilot.json").read_text(encoding="utf-8"))
    index = json.loads((PUBLIC / "replay" / "index.json").read_text(encoding="utf-8"))
    replay_dates = sorted(index["days"])

    reqs = inputs.dfs_requirements(refresh)
    events = inputs.turnup_events(reqs)
    event_days = sorted({d for d, _ in events})
    # Use the same feature the request model in forecast.json used, so the two are comparable.
    feature = (inputs.wind_feature(refresh) if forecast["meta"].get("model") == "wind_forecast"
               else inputs.flows(refresh)[F.BOUNDARY])
    obs = T.build_obs(events, feature, inputs.DFS_ERA_START, max(r["date"] for r in reqs))

    return {
        "meta": {
            "source": ["derived: forecast.json", "derived: copilot.json", "NESO demand-flexibility (DFS)"],
            "generated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "retrospective": True,
            "request_model_feature": "national wind forecast" if forecast["meta"].get("model") == "wind_forecast"
            else "flow utilisation",
            "note": ("Summaries for the map dashboard. The headline sentence is templated from the numbers next to it. "
                     "Replay-day request probabilities are walk-forward (the model sees only earlier days) and null "
                     "when there is not enough history. Nothing here is a revenue claim."),
        },
        "tomorrow": D.tomorrow_block(forecast),
        "replay_days": D.build_replay_days(replay_dates, copilot, obs, feature, events, event_days,
                                           inputs.DFS_ERA_START),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true")
    doc = build(refresh=ap.parse_args().refresh)
    OUT.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print("headline:", doc["tomorrow"]["headline"])
    for r in doc["replay_days"]:
        c = r["copilot"]
        ps = [x["p_turnup_request"] for x in r["request_probability"]]
        print(" ", r["date"], c["status"], "| pct_of_oracle", c.get("pct_of_oracle"), "| P(request) available:", any(p is not None for p in ps))


if __name__ == "__main__":
    main()
