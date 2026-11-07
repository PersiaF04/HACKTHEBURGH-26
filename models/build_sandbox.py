"""Build data/public/sandbox.json (lane B, issue #76): inputs and test vectors for the interactive load sandbox.

Usage, from the repo root:
    python models/build_sandbox.py
    python models/build_sandbox.py --refresh
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_copilot import load_market  # noqa: E402
from turnup import copilot as C, inputs, sandbox as S  # noqa: E402
from turnup.fetch import ROOT  # noqa: E402

OUT = ROOT / "data" / "public" / "sandbox.json"


def check_against_copilot(market, days: dict, base: C.Load) -> None:
    """Refuse to write a file whose numbers disagree with the Copilot's own replay on the real data."""
    load = {"capacity_mw": base.capacity_mw, "zone": base.zone, "value_gbp_per_mwh": base.value_gbp_mwh,
            "max_periods": base.max_periods}
    for day, sched, res in C.run(market, base)["per_day"]:
        for name in ("naive", "ours", "oracle"):
            ref = S.score_schedule(days[day], load, days[day]["policies"][base.zone][str(int(base.value_gbp_mwh))][name])
            if abs(ref["net_gbp"] - res[name]["net"]) > 0.01 or ref["accepted_half_hours"] != res[name]["accepted"]:
                raise RuntimeError(f"sandbox disagrees with the Copilot on {day} {name}: "
                                   f"{ref['net_gbp']:.2f} vs {res[name]['net']:.2f}")


def build(refresh: bool = False, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    base = C.Load()                       # 50 MW electrolyser, Z1, GBP 100/MWh, 12 half-hours
    market = load_market(refresh)
    curtail = inputs.scottish_curtailment(refresh)
    days = S.build_days(market, curtail, base)
    check_against_copilot(market, days, base)
    return {
        "meta": {
            "source": ["NESO demand-flexibility (DFS)", "Elexon market index price (MID)", "NESO Wind BOA Volumes",
                       "derived: copilot.json policies"],
            "generated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "retrospective": True,
            "note": ("Per-half-hour inputs for re-running the Copilot's scoring for a load the user places. "
                     "Retrospective replay of NESO DFS Upwards/System requests; not a revenue claim. "
                     "mid_gbp_per_mwh is a market index price, not any site's tariff. "
                     "DFS zone IDs are not confirmed as Scotland."),
        },
        "load_defaults": {"type": base.type, "capacity_mw": base.capacity_mw, "zone": base.zone,
                          "value_gbp_per_mwh": base.value_gbp_mwh, "max_periods": base.max_periods},
        "grids": {"zones": list(S.ZONES), "value_gbp_per_mwh": [int(v) for v in S.VALUE_GRID]},
        "scoring_rule": S.SCORING_RULE,
        "days": days,
        "test_vectors": S.test_vectors(days, base),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true")
    doc = build(refresh=ap.parse_args().refresh)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=None, separators=(",", ":")) + "\n", encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)}: {len(doc['days'])} days, {len(doc['test_vectors'])} test vectors, {kb:.0f} KB")


if __name__ == "__main__":
    main()
