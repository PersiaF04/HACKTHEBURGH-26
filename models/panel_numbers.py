"""Every number quoted in docs/PANEL-COPY.md, computed from data/public.

Run `python models/panel_numbers.py` to print them. The test in
models/tests/test_panel_numbers.py checks the values and that the doc quotes them.
Standard library only.
"""
import json
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "data" / "public"
DAY = "2026-10-27"
KWH_PER_HOME_YEAR = 2700  # approximate assumption
CABLE_STEPS_MW = (1000, 5000)


def _load(*parts):
    return json.loads(PUBLIC.joinpath(*parts).read_text(encoding="utf-8"))


def cable_whatif(periods, extra_mw):
    """avoided = min(curtailed, reduction in max(0, flow - limit)) per half-hour.

    The reduction in excess is MW, so it is multiplied by 0.5 h to give MWh.
    """
    total = 0.0
    for p in periods:
        curtailed = sum(f["curtailed_mwh"] for f in p["farms"].values())
        base = max(0.0, p["scotex_flow_mw"] - p["scotex_limit_mw"])
        after = max(0.0, p["scotex_flow_mw"] - (p["scotex_limit_mw"] + extra_mw))
        total += min(curtailed, (base - after) * 0.5)
    return total


def compute():
    daily = _load("curtailment_daily.json")
    ice = _load("iceberg.json")
    dfs = _load("dfs_requests.json")["requests"]
    fc = _load("forecast.json")["backtest"]
    cp = _load("copilot.json")["summary"]
    sb = _load("sandbox.json")
    dash = _load("dashboard.json")["tomorrow"]["facts"]
    replay = _load("replay", f"{DAY}.json")["periods"]
    n = {}

    days = daily["days"]
    n["days_total_mwh"] = sum(d["curtailed_mwh"] or 0 for d in days)
    n["days_count"] = len(days)
    n["days_last"] = days[-1]["date"]
    d27 = next(d for d in days if d["date"] == DAY)
    n["daily_27oct_mwh"] = d27["curtailed_mwh"]
    n["daily_27oct_paid_gbp"] = d27["wind_paid_gbp"]
    n["daily_27oct_homes"] = d27["curtailed_mwh"] * 1000 / KWH_PER_HOME_YEAR
    n["total_homes"] = n["days_total_mwh"] * 1000 / KWH_PER_HOME_YEAR
    n["validation_corr"] = daily["validation"]["volume_corr_daily"]
    n["validation_days"] = daily["validation"]["n_days"]

    n["ice_wind_gbp"] = ice["wind_bids_gbp"]
    n["ice_ccgt_gbp"] = ice["ccgt_offers_gbp"]
    n["ice_neso_gbp"] = ice["neso_thermal_gbp"]
    n["ice_days"] = ice["days"]

    n["dfs_requested_mwh"] = sum(r["required_mw"] for r in dfs) / 2
    n["dfs_procured_mwh"] = sum(r["procured_mw"] for r in dfs) / 2
    n["dfs_fill_pct"] = 100 * n["dfs_procured_mwh"] / n["dfs_requested_mwh"]
    d27r = [r for r in dfs if r["start_utc"].startswith(DAY)]
    n["dfs_27oct_mw"] = max(r["required_mw"] for r in d27r)
    n["dfs_27oct_procured_mwh"] = sum(r["procured_mw"] for r in d27r) / 2

    n["replay_27oct_mwh"] = sum(f["curtailed_mwh"] for p in replay for f in p["farms"].values())
    n["replay_vs_daily_pct"] = 100 * abs(n["replay_27oct_mwh"] - n["daily_27oct_mwh"]) / n["daily_27oct_mwh"]
    flows = [p["scotex_flow_mw"] for p in replay]
    n["flow_min_mw"], n["flow_max_mw"] = min(flows), max(flows)
    n["limit_early_mw"] = replay[0]["scotex_limit_mw"]
    n["limit_late_mw"] = replay[-1]["scotex_limit_mw"]
    n["half_hours_over_limit"] = sum(p["scotex_flow_mw"] > p["scotex_limit_mw"] for p in replay)

    for mw in CABLE_STEPS_MW:
        a = cable_whatif(replay, mw)
        n[f"cable_{mw // 1000}gw_avoided_mwh"] = a
        n[f"cable_{mw // 1000}gw_avoided_pct"] = 100 * a / n["replay_27oct_mwh"]

    v = next(t for t in sb["test_vectors"] if t["id"] == "ours-2026-10-27-Z1-100")["expected"]
    n["wi_mwh"], n["wi_wind_matched_mwh"] = v["mwh"], v["wind_matched_mwh"]
    n["wi_half_hours"] = v["accepted_half_hours"]
    n["wi_gross_gbp"], n["wi_energy_cost_gbp"], n["wi_net_gbp"] = v["gross_gbp"], v["energy_cost_gbp"], v["net_gbp"]
    n["cp_oracle_net_gbp"] = cp["net_gbp"]["oracle"]
    n["cp_pct_of_oracle"] = 100 * cp["pct_of_oracle"]
    n["cp_break_even_gbp_mwh"] = cp["break_even_value_gbp_per_mwh"]["ours"]
    n["cp_tradable_half_hours"] = cp["tradable_half_hours"]

    n["bt_n"] = fc["n_periods"]
    n["bt_mae_model"], n["bt_mae_persistence"] = fc["mae_mwh"]["model"], fc["mae_mwh"]["persistence"]
    n["bt_coverage_pct"] = 100 * fc["interval_coverage_p10_p90"]
    n["tomorrow_peak_request_pct"] = 100 * dash["peak_p_request"]
    return n


def fmt(n):
    """The exact strings the doc quotes."""
    return {
        "days_total_twh": f"{n['days_total_mwh'] / 1e6:.2f} TWh",
        "daily_27oct": f"{n['daily_27oct_mwh']:,} MWh",
        "daily_27oct_homes": f"{round(n['daily_27oct_homes'], -3):,.0f} homes",
        "total_homes": f"{n['total_homes'] / 1e6:.1f} million homes",
        "paid_27oct": f"£{n['daily_27oct_paid_gbp'] / 1e6:.1f}m",
        "wind": f"£{n['ice_wind_gbp'] / 1e6:.0f}m",
        "ccgt": f"£{n['ice_ccgt_gbp'] / 1e9:.2f}bn",
        "neso": f"£{n['ice_neso_gbp'] / 1e9:.2f}bn",
        "requested": f"{n['dfs_requested_mwh']:,.0f} MWh",
        "procured": f"{n['dfs_procured_mwh']:.2f} MWh",
        "fill": f"{n['dfs_fill_pct']:.3f}%",
        "dfs_27oct": f"{n['dfs_27oct_mw']:.0f} MW",
        "dfs_27oct_procured": f"{n['dfs_27oct_procured_mwh']:.1f} MWh",
        "replay_27oct": f"{n['replay_27oct_mwh']:,.0f} MWh",
        "flow_range": f"{n['flow_min_mw']:,.0f} to {n['flow_max_mw']:,.0f} MW",
        "limits": f"{n['limit_early_mw']:,.0f} MW until 04:30 UTC, then {n['limit_late_mw']:,.0f} MW",
        "over_limit": f"{n['half_hours_over_limit']} of 48",
        "cable1": f"{n['cable_1gw_avoided_mwh']:,.0f} MWh ({n['cable_1gw_avoided_pct']:.0f}%)",
        "cable5": f"{n['cable_5gw_avoided_mwh']:,.0f} MWh ({n['cable_5gw_avoided_pct']:.0f}%)",
        "wi_mwh": f"{n['wi_mwh']:.0f} MWh",
        "wi_gross": f"£{n['wi_gross_gbp']:,.0f}",
        "wi_cost": f"£{n['wi_energy_cost_gbp']:,.0f}",
        "wi_net": f"£{n['wi_net_gbp']:,.0f}",
        "oracle_net": f"£{n['cp_oracle_net_gbp']:,.0f}",
        "pct_oracle": f"{n['cp_pct_of_oracle']:.1f}%",
        "break_even": f"£{n['cp_break_even_gbp_mwh']:.0f}/MWh",
        "corr": f"{n['validation_corr']:.3f}",
        "mae": f"{n['bt_mae_model']:.0f} MWh",
        "mae_persist": f"{n['bt_mae_persistence']:,.0f} MWh",
        "coverage": f"{n['bt_coverage_pct']:.0f}%",
    }


if __name__ == "__main__":
    nums = compute()
    for k, v in nums.items():
        print(f"{k} = {v}")
    print()
    for k, v in fmt(nums).items():
        print(f"{k}: {v}")
