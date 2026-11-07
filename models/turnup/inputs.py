"""Load the public inputs the models need, as plain dictionaries keyed by (date, sp)."""
from __future__ import annotations

from collections import defaultdict

from . import fetch
from .timeutil import sp_from_clock

BOA_YEARS = ("2025/26", "2026/27")
FLOW_GROUPS = ("SSE_SP2", "SCOTEX", "SSEN_S")


def scottish_generators(refresh: bool = False) -> set[str]:
    """Wind BMUs whose NESO ``Region`` is North or South Scotland (same key as the BOA file)."""
    def build():
        rid = fetch.resource_id("day-ahead-wind-forecast", r"Day Ahead Wind BMU Forecast")
        rows = fetch.datastore_all(rid, fields=["Generator_Name", "Region"])
        return sorted({r["Generator_Name"] for r in rows if "SCOTLAND" in (r["Region"] or "").upper()})
    return set(fetch.cached("scottish_generators", refresh, build))


def boa_rows(refresh: bool = False) -> list[list]:
    """Wind BOA rows as [date, sp, generator, MW] for the configured financial years."""
    def build():
        out = []
        for year in BOA_YEARS:
            rid = fetch.resource_id("wind-bmu-boa-volumes", rf"Wind BOA Volumes {year}")
            for r in fetch.datastore_all(rid, fields=["Date", "Settlement_Period", "Generator_Name", "BOA_Volume"]):
                out.append([str(r["Date"])[:10], int(r["Settlement_Period"]), r["Generator_Name"], r["BOA_Volume"]])
        return out
    return fetch.cached("wind_boa_rows", refresh, build)


def scottish_curtailment(refresh: bool = False) -> dict[tuple[str, int], float]:
    """Scottish BM-instructed wind turn-down, MWh per half-hour, keyed by (date, sp).

    NESO's BOA volumes are the average MW over the half-hour, so MWh = MW / 2.
    Only turn-down (negative) acceptances count; the sign is flipped to a positive MWh.
    """
    scots = scottish_generators(refresh)
    out: dict[tuple[str, int], float] = defaultdict(float)
    for date, sp, gen, mw in boa_rows(refresh):
        if gen in scots and mw is not None and mw < 0:
            out[(date, sp)] += -mw / 2.0
    return dict(out)


def flows(refresh: bool = False) -> dict[str, dict[tuple[str, int], float]]:
    """Day-ahead boundary utilisation (flow / limit) per group, keyed by (date, sp).

    The file is a day-ahead snapshot with no publication timestamp, so anything built
    from it is labelled retrospective.
    """
    def build():
        rid = fetch.resource_id("day-ahead-constraint-flows-and-limits", r"Day Ahead Constraint Flows and Limits")
        out = {}
        for g in FLOW_GROUPS:
            rows = fetch.datastore_all(rid, filters={"Constraint Group": g})
            out[g] = [[r["Date_ Time GMT_BST"], r["Limit_MW"], r["Flow_MW"]] for r in rows
                      if r["Date_ Time GMT_BST"] >= "2025-04-01"]
        return out
    raw = fetch.cached("flows", refresh, build)
    result: dict[str, dict[tuple[str, int], float]] = {}
    for g, rows in raw.items():
        d: dict[tuple[str, int], float] = {}
        for ts, limit, flow in rows:
            if limit and flow is not None and limit > 0:
                d[(ts[:10], sp_from_clock(ts[11:16]))] = flow / limit
        result[g] = d
    return result


DFS_ERA_START = "2026-10-07"   # DFS began procuring constraint turn-up actions on this date


def _parse_caps(s: str | None) -> dict[str, float]:
    caps = {}
    for part in (s or "").split(","):
        if ":" in part:
            zone, val = part.split(":", 1)
            try:
                caps[zone.strip()] = float(val)
            except ValueError:
                pass
    return caps


def dfs_requirements(refresh: bool = False) -> list[dict]:
    """NESO DFS service requirements (all event types), one row per half-hour window."""
    def build():
        rid = fetch.resource_id("demand-flexibility", r"DFS Service Requirement")
        keep = ["Event ID", "Event Type", "Event Tag", "Delivery Date", "From_Local", "DFS Submission Time_Local",
                "Service Requirement MW", "Service Requirement Type", "Guaranteed Acceptance Price GBP per MWh",
                "Zonal Cap"]
        return fetch.datastore_all(rid, fields=keep)
    out = []
    for r in fetch.cached("dfs_requirements", refresh, build):
        out.append({
            "event_id": r["Event ID"], "type": r["Event Type"], "tag": r["Event Tag"],
            "date": str(r["Delivery Date"])[:10], "sp": sp_from_clock(r["From_Local"]),
            "required_mw": r["Service Requirement MW"], "req_type": r["Service Requirement Type"],
            "gap_gbp_mwh": r["Guaranteed Acceptance Price GBP per MWh"],
            "caps": _parse_caps(r["Zonal Cap"]), "submitted_local": r["DFS Submission Time_Local"],
        })
    return out


def dfs_utilisation(refresh: bool = False) -> list[dict]:
    """NESO DFS utilisation report: every submitted bid with its zone, price and status."""
    def build():
        rid = fetch.resource_id("demand-flexibility", r"DFS Utilisation Report")
        keep = ["Event ID", "Event Type", "Event Tag", "Delivery Date", "From_Local", "Zone",
                "DFS Procured MW", "Utilisation Price GBP per MWh", "Status", "Service Requirement Type"]
        return fetch.datastore_all(rid, fields=keep)
    out = []
    for r in fetch.cached("dfs_utilisation", refresh, build):
        out.append({
            "event_id": r["Event ID"], "type": r["Event Type"], "tag": r["Event Tag"],
            "date": str(r["Delivery Date"])[:10], "sp": sp_from_clock(r["From_Local"]),
            "zone": r["Zone"], "mw": r["DFS Procured MW"], "price": r["Utilisation Price GBP per MWh"],
            "status": r["Status"], "req_type": r["Service Requirement Type"],
        })
    return out


def turnup_events(requirements: list[dict]) -> dict[tuple[str, int], dict]:
    """Live ``Upwards``/``System`` requirements since the DFS constraint era, keyed by (date, sp)."""
    out = {}
    for r in requirements:
        if (r["type"] == "Upwards" and r["tag"] == "System" and r["req_type"] == "Live"
                and r["date"] >= DFS_ERA_START and any(v > 0 for v in r["caps"].values())):
            out[(r["date"], r["sp"])] = r
    return out


def national_wind_forecast(refresh: bool = False) -> dict[tuple[str, int], float]:
    """NESO national incentive wind forecast as a load factor (forecast / capacity), keyed by (date, sp).

    For recent days the archived value is stamped 08:45 UTC on the target day itself, i.e. a
    same-morning update rather than a day-ahead vintage, so it is only used as a labelled sensitivity.
    """
    def build():
        rid = fetch.resource_id("day-ahead-wind-forecast", r"Historic Day Ahead Wind Forecasts")
        return [[r["Date"], r["Settlement_period"], r["Incentive_forecast"], r["Capacity"]]
                for r in fetch.datastore_all(rid) if str(r["Date"])[:10] >= "2025-04-01"]
    return {(str(d)[:10], int(sp)): f / c
            for d, sp, f, c in fetch.cached("national_wind_hist", refresh, build) if f is not None and c}
