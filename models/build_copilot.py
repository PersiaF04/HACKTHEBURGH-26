"""Build data/public/copilot.json (lane B, issue #30).

Usage, from the repo root:
    python models/build_copilot.py
    python models/build_copilot.py --type electrolyser --mw 50 --zone Z1 --value 100 --periods 12
    python models/build_copilot.py --refresh
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from turnup import copilot as C, forecast as F, inputs  # noqa: E402
from turnup.fetch import ROOT  # noqa: E402

OUT = ROOT / "data" / "public" / "copilot.json"


def load_market(refresh: bool = False):
    reqs = inputs.dfs_requirements(refresh)
    events = inputs.turnup_events(reqs)
    bids = inputs.dfs_utilisation(refresh)
    util = inputs.flows(refresh)[F.BOUNDARY]
    days = sorted({d for d, _ in events})
    market = C.Market(events=events, threshold=C.accepted_thresholds(bids),
                      mid=inputs.market_index(days, refresh), util=util, days=days)
    return market


def build(load: C.Load, refresh: bool = False, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    market = load_market(refresh)
    check = C.settlement_check(inputs.dfs_summary(refresh), inputs.dfs_utilisation(refresh))
    result = C.run(market, load)
    t = result["totals"]
    sens = C.sensitivity(market, load)
    ours = t["ours"]
    return {
        "meta": {
            "source": ["derived: forecast model inputs", "NESO demand-flexibility (DFS)",
                       "Elexon market index price (MID)"],
            "generated_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "retrospective": True,
            "scored_days": len(result["scored_days"]),
            "warmup_days": C.WARMUP_DAYS,
        },
        "load": {"type": load.type, "capacity_mw": load.capacity_mw, "zone": load.zone,
                 "value_gbp_per_mwh": load.value_gbp_mwh, "max_periods_per_day": load.max_periods},
        "days": result["days"],
        "summary": {
            "pct_of_oracle": C.pct_of_oracle(t),
            "gross_settlement_gbp": round(ours["gross"]),
            "energy_cost_gbp": round(ours["energy"]),
            "net_gbp": {k: round(t[k]["net"]) for k in t},
            "break_even_value_gbp_per_mwh": {k: C.break_even_value(t, k) for k in t},
            "tradable_half_hours": result["tradable_half_hours"],
            "ours_beats_naive_at_values_gbp_per_mwh": [r["value_gbp_per_mwh"] for r in sens
                                                       if r["net_gbp"]["ours"] > r["net_gbp"]["naive"]],
            "caveat": (
                f"Replay of DFS Upwards/System requests from 7 Oct 2026, {len(result['scored_days'])} scored days. "
                "Gross settlement is what NESO would pay at the bid price if the bid were accepted and delivered "
                "(pay-as-bid assumed; a bid is assumed accepted whenever it is at or below a price NESO actually "
                "accepted that half-hour). Electricity cost uses a market index price, not any site's tariff, and "
                "excludes levies. At the assumed site value the settlement "
                f"(GBP {ours['gross']:,.0f}) does not cover the electricity (GBP {ours['energy']:,.0f}) on its own; "
                "the site's value for the energy makes up the difference. See `sensitivity` for other values. "
                "Full delivery is assumed, which is optimistic: NESO's published settled cost is only "
                f"{(check['settled_to_accepted_cost_ratio_all_dfs'] or 0):.0%} of accepted cost across DFS so far. "
                f"Only {result['tradable_half_hours']} half-hours were tradable for zone {load.zone} across these days "
                "(a bid had actually been accepted there), so percentages of the oracle rest on a handful of events "
                "and 'ours matches the oracle' at low site values is a small-sample effect. "
                "Not a revenue claim. DFS zone IDs are not confirmed as Scotland."),
        },
        "assumptions": {
            "settlement": "pay-as-bid (arithmetic checked against NESO accepted cost), perfect delivery assumed",
            "acceptance": "bid price at or below the highest price NESO accepted in the load's own zone in that half-hour; none accepted in that zone = not tradable",
            "energy_price": "volume-weighted market index price per half-hour",
            "naive_rule": "bid a fixed price in the cheapest-electricity half-hours; the price is the median accepted-price ceiling in the load's zone on earlier days only (GBP 60 with no history)",
            "ours_rule": "rank half-hours by expected margin = P(accepted at price) x (price + value - electricity price) x MWh; P(accepted) is learned from earlier days by electricity-price and boundary-utilisation tercile",
            "oracle_rule": "hindsight best tradable half-hours, each bid at its accepted price ceiling",
            "window_local": "11:00 to 23:00",
        },
        "sensitivity": sens,
        "validation": check,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--type", default="electrolyser")
    ap.add_argument("--mw", type=float, default=50.0)
    ap.add_argument("--zone", default="Z1")
    ap.add_argument("--value", type=float, default=100.0, help="site value of the extra energy, GBP/MWh")
    ap.add_argument("--periods", type=int, default=12, help="max half-hours per day at full capacity")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    doc = build(C.Load(a.type, a.mw, a.zone, a.value, a.periods), refresh=a.refresh)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    s = doc["summary"]
    print(f"wrote {OUT.relative_to(ROOT)}: {len(doc['days'])} scored days")
    print("net GBP:", s["net_gbp"], "| pct_of_oracle:", s["pct_of_oracle"])
    print("break-even value GBP/MWh:", s["break_even_value_gbp_per_mwh"])
    v = doc["validation"]
    print("accepted-cost check:", v["accepted_cost_exact_within_2p"], "of", v["accepted_cost_halfhours_matched"],
          "exact | settled/accepted:", v["settled_to_accepted_cost_ratio_all_dfs"])
    for r in doc["sensitivity"]:
        print("  value", r["value_gbp_per_mwh"], r["net_gbp"], r["pct_of_oracle"])


if __name__ == "__main__":
    main()
