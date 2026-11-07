"""Backfill pipeline (#27): regenerate every lane A contract file in ``data/public/``.

Run from ``pipeline/``:  ``python -m turnup.backfill``  (``--only farms,dfs`` for a subset).
Raw responses are cached in ``data/cache/`` (gitignored); warm the slow Elexon cache first
with ``python -m turnup.prefetch``.

Outputs (see contracts/README.md): farms.json, curtailment_daily.json, iceberg.json,
dfs_requests.json, replay/<date>.json.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import logging
import math
import os
import re
import statistics
from pathlib import Path
from zoneinfo import ZoneInfo

from . import cache, fetch, geo
from .backfill_config import REPLAY_EXTRA_DAYS, REPLAY_FIXED_DAYS, WINDOW_END, WINDOW_START

log = logging.getLogger("turnup.backfill")
REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC = REPO_ROOT / "data" / "public"
LONDON = ZoneInfo("Europe/London")
SCOTTISH_REGIONS = {"North Scotland", "South Scotland"}
WIND_FORECAST_RESOURCE = "90e581e9-2d7f-4eaa-8fe0-6e323ee0f5f7"
REPD_URL = "https://assets.publishing.service.gov.uk/media/6a6cbdc00c36759b5ccaa305/REPD_Publication_Q2_2026.csv"

# ---------------------------------------------------------------- helpers


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def meta(sources: list[str], **extra) -> dict:
    return {"source": sources, "generated_utc": utc_now_iso(), "retrospective": True, **extra}


def write_json(rel: str, obj, compact: bool = False) -> Path:
    path = PUBLIC / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    text = (json.dumps(obj, separators=(",", ":"), ensure_ascii=False) if compact
            else json.dumps(obj, indent=1, ensure_ascii=False))
    tmp.write_text(text + "\n", encoding="utf-8")
    os.replace(tmp, path)
    log.info("wrote %s", path.relative_to(REPO_ROOT))
    return path


def sp_start_utc(date: str, sp: int) -> dt.datetime:
    """Start of settlement period ``sp`` on GB local ``date`` (handles clock-change days)."""
    local_midnight = dt.datetime.combine(dt.date.fromisoformat(date), dt.time(0), tzinfo=LONDON)
    return local_midnight.astimezone(dt.timezone.utc) + dt.timedelta(minutes=30 * (sp - 1))


def periods_in_day(date: str) -> int:
    d = dt.date.fromisoformat(date)
    start = dt.datetime.combine(d, dt.time(0), tzinfo=LONDON).astimezone(dt.timezone.utc)
    end = dt.datetime.combine(d + dt.timedelta(days=1), dt.time(0), tzinfo=LONDON).astimezone(dt.timezone.utc)
    return int((end - start).total_seconds() // 1800)


def iso_z(ts: dt.datetime) -> str:
    return ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return None if sxx == 0 or syy == 0 else sxy / math.sqrt(sxx * syy)


def fnum(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def title_region(region: str) -> str:
    return " ".join(w.capitalize() if w != "&" else w for w in region.strip().lower().split())


# ---------------------------------------------------------------- reference data


def wind_bmu_reference() -> dict[str, dict]:
    """NESO Day Ahead Wind BMU Forecast: Generator_Name -> region, full name, capacity."""
    rows = fetch.neso_resource("day-ahead-wind-forecast", resource_id=WIND_FORECAST_RESOURCE)
    ref: dict[str, dict] = {}
    for r in rows:
        ref[r["Generator_Name"]] = {"name": r["Generator_Full_Name"].strip(),
                                    "region": title_region(r["Region"]),
                                    "capacity_mw": fnum(r["Capacity"])}
    return ref


def ng_to_elexon() -> dict[str, str]:
    """National Grid BMU id (e.g. SGRWO-1) -> Elexon BMU id (e.g. T_SGRWO-1)."""
    out = {}
    for b in fetch.elexon_bmunits():
        if b.get("nationalGridBmUnit") and b.get("elexonBmUnit"):
            out.setdefault(b["nationalGridBmUnit"], b["elexonBmUnit"])
    return out


def bmu_fuel() -> dict[str, str]:
    return {b["elexonBmUnit"]: (b.get("fuelType") or "") for b in fetch.elexon_bmunits()}


def scottish_wind_ids(ref: dict[str, dict], ng2e: dict[str, str]) -> dict[str, str]:
    """Elexon id -> NG id for wind BMUs NESO places in North or South Scotland."""
    return {ng2e.get(ng, f"T_{ng}"): ng for ng, info in ref.items() if info["region"] in SCOTTISH_REGIONS}


# ---------------------------------------------------------------- farms.json

# Names NESO and REPD spell differently (checked by hand against REPD Q2 2026).
REPD_ALIASES = {"moray firth eastern": "moray east", "pauls hill": "paul's hill and extension"}
# NESO BMU prefix -> REPD Ref ID, checked by hand where automatic matching fails or is wrong.
REPD_OVERRIDES = {"HOWAO": "2525", "HOWBO": "2502", "ABRBO": "2505", "HYWDW": "2479", "LNCSO": "2513",
                  "RSHLW": "4051", "ACHRW": "4331", "TACHW": None}
_STOP = r"\b(wind ?farm|windfarm|offshore|onshore|wind|farm|phase|stage|extension|ext|repower(?:ing)?|project|energy|[ivx]+|\d+[a-z]?)\b"
_STATUS_RANK = {"Operational": 0, "Under Construction": 1, "Awaiting Construction": 2}


def _norm_tokens(name: str) -> set[str]:
    s = name.lower()
    s = re.sub(r"\(.*?\)", " ", s)
    for k, v in REPD_ALIASES.items():
        s = s.replace(k, v)
    s = s.replace("'", "")
    s = re.sub(_STOP, " ", s)
    return set(re.findall(r"[a-z]+", s))


def load_repd() -> list[dict]:
    body = cache.cached_bytes("repd/REPD_Publication_Q2_2026.csv",
                              lambda: __import__("turnup.http", fromlist=["get_bytes"]).get_bytes(REPD_URL))
    lines = body.decode("cp1252").splitlines()
    header = next(i for i, line in enumerate(lines[:30]) if "Site Name" in line)
    import csv
    return [r for r in csv.DictReader(lines[header:]) if "Wind" in (r.get("Technology Type") or "")]


def match_repd(full_name: str, repd: list[dict], scottish: bool) -> tuple[dict | None, float]:
    tokens = _norm_tokens(full_name)
    if not tokens:
        return None, 0.0
    best, best_key = None, None
    for r in repd:
        if scottish and r.get("Country") != "Scotland":
            continue
        rt = _norm_tokens(r["Site Name"])
        if not rt:
            continue
        jac = len(tokens & rt) / len(tokens | rt)
        if jac < 0.5:
            continue
        status = _STATUS_RANK.get((r.get("Development Status (short)") or "").strip(), 9)
        key = (-jac, status, -(fnum(r.get("Installed Capacity (MWelec)")) or 0))
        if best_key is None or key < best_key:
            best, best_key = r, key
    return best, (-best_key[0] if best_key else 0.0)


def build_farms() -> dict:
    ref = wind_bmu_reference()
    ng2e = ng_to_elexon()
    repd = load_repd()
    by_ref = {r["Ref ID"]: r for r in repd}
    farms, matched = [], 0
    for ng, info in sorted(ref.items()):
        lat = lon = None
        prefix = ng.split("-")[0]
        if prefix in REPD_OVERRIDES:
            rid = REPD_OVERRIDES[prefix]
            hit = by_ref.get(rid) if rid else None
        else:
            hit, _ = match_repd(info["name"], repd, info["region"] in SCOTTISH_REGIONS)
        if hit:
            x, y = fnum(hit.get("X-coordinate")), fnum(hit.get("Y-coordinate"))
            if x and y:
                lat, lon = geo.osgb_to_wgs84(x, y)
                matched += 1
        farms.append({"id": ng2e.get(ng, f"T_{ng}"), "name": info["name"], "region": info["region"],
                      "lat": lat, "lon": lon, "capacity_mw": info["capacity_mw"]})
    log.info("farms: %d BMUs, %d geocoded from REPD", len(farms), matched)
    return {"meta": meta(["NESO Day Ahead Wind BMU Forecast (Region)",
                          "DESNZ Renewable Energy Planning Database Q2 2026 (coordinates, name-matched)"],
                         geocoded=matched, total=len(farms)),
            "farms": farms}


# ---------------------------------------------------------------- daily totals


def scottish_boa_daily(scot_ng: set[str]) -> dict[str, float]:
    """NESO Wind BOA Volumes (average MW per period) -> curtailed MWh per day, Scottish BMUs."""
    rows = fetch.neso_resource("wind-bmu-boa-volumes", name="Wind BOA Volumes 2026/27")
    daily: dict[str, float] = collections.defaultdict(float)
    for r in rows:
        v = fnum(r["BOA_Volume"])
        if v is not None and v < 0 and r["Generator_Name"] in scot_ng:
            daily[r["Date"]] += -v / 2.0
    return daily


def neso_thermal_daily() -> dict[str, tuple[float | None, float | None]]:
    rows = fetch.neso_resource("constraint-breakdown", name="Constraint Breakdown 2026-2027", refresh=False)
    out = {}
    for r in rows:
        vol, cost = fnum(r.get("Thermal constraints volume")), fnum(r.get("Thermal constraints cost"))
        out[r["Date"][:10]] = (abs(vol) if vol is not None else None, cost)
    return out


def cashflow_daily(day: str, scot_ids: set[str], fuel: dict[str, str]) -> tuple[float | None, float | None]:
    """(net £ paid to Scottish wind on bids, £ paid to CCGT on offers) for one day, None if unavailable."""
    try:
        bids = fetch.elexon_cashflows("bid", day)
    except Exception as exc:  # noqa: BLE001
        log.warning("bid cashflows %s unavailable: %s", day, exc)
        bids = None
    try:
        offers = fetch.elexon_cashflows("offer", day)
    except Exception as exc:  # noqa: BLE001
        log.warning("offer cashflows %s unavailable: %s", day, exc)
        offers = None
    wind = None if not bids else sum((r.get("totalCashflow") or 0) for r in bids if r["bmUnit"] in scot_ids)
    ccgt = None if not offers else sum((r.get("totalCashflow") or 0) for r in offers if fuel.get(r["bmUnit"]) == "CCGT")
    return wind, ccgt


def build_daily_and_iceberg(start: str = WINDOW_START, end: str = WINDOW_END) -> tuple[dict, dict]:
    ref = wind_bmu_reference()
    ng2e = ng_to_elexon()
    scot = scottish_wind_ids(ref, ng2e)
    fuel = bmu_fuel()
    boa = scottish_boa_daily(set(scot.values()))
    thermal = neso_thermal_daily()
    days, ice_rows = [], []
    for day in fetch.daterange(start, end):
        wind_gbp, ccgt_gbp = cashflow_daily(day, set(scot), fuel)
        t_mwh, t_gbp = thermal.get(day, (None, None))
        curtailed = boa.get(day)
        days.append({"date": day,
                     "curtailed_mwh": round(curtailed) if curtailed is not None else None,
                     "wind_paid_gbp": round(wind_gbp) if wind_gbp is not None else None,
                     "neso_thermal_mwh": round(t_mwh) if t_mwh is not None else None,
                     "neso_thermal_gbp": round(t_gbp) if t_gbp is not None else None})
        ice_rows.append((day, wind_gbp, ccgt_gbp, t_gbp))

    both = [d for d in days if d["curtailed_mwh"] is not None and d["neso_thermal_mwh"]]
    window = [both[0]["date"], both[-1]["date"]] if both else [start, end]
    ratio = (sum(d["curtailed_mwh"] for d in both) / sum(d["neso_thermal_mwh"] for d in both)) if both else None
    corr = pearson([d["curtailed_mwh"] for d in both], [d["neso_thermal_mwh"] for d in both])
    daily = {
        "meta": meta(["NESO Wind BOA Volumes 2026/27 (MW/2 = MWh; Scottish BMUs by NESO Region)",
                      "Elexon indicative cashflows (bids, Scottish wind BMUs, net)",
                      "NESO Constraint Breakdown 2026-2027 (thermal)"]),
        "days": days,
        "validation": {"window": window, "n_days": len(both),
                       "volume_ratio": round(ratio, 3) if ratio is not None else None,
                       "volume_corr_daily": round(corr, 3) if corr is not None else None},
    }

    full = [r for r in ice_rows if None not in r[1:]]
    iceberg = {
        "meta": meta(["Elexon indicative cashflows by fuel (bids: Scottish wind; offers: CCGT; CCGT offers include energy balancing as well as constraint actions)",
                      "NESO Constraint Breakdown 2026-2027 (thermal)"]),
        "window": [full[0][0], full[-1][0]] if full else [start, end],
        "days": len(full),
        "wind_bids_gbp": round(sum(r[1] for r in full)),
        "ccgt_offers_gbp": round(sum(r[2] for r in full)),
        "neso_thermal_gbp": round(sum(r[3] for r in full)),
        "ccgt_vs_neso_corr_daily": (round(c, 3) if (c := pearson([r[2] for r in full], [r[3] for r in full])) is not None else None),
        "note": "Magnitude comparison, not additive",
    }
    return daily, iceberg


# ---------------------------------------------------------------- dfs_requests.json


def _local_to_utc(date_ddmmyyyy: str, hhmm: str) -> dt.datetime:
    d = dt.datetime.strptime(f"{date_ddmmyyyy} {hhmm}", "%d/%m/%Y %H:%M").replace(tzinfo=LONDON)
    return d.astimezone(dt.timezone.utc)


def _zone_caps(text: str) -> dict[str, float]:
    caps = {}
    for part in (text or "").split(","):
        if ":" in part:
            k, v = part.split(":", 1)
            val = fnum(v)
            if val:
                caps[k.strip()] = val
    return caps


def build_dfs(requirement: list[dict] | None = None, utilisation: list[dict] | None = None) -> dict:
    requirement = requirement if requirement is not None else fetch.neso_resource(
        "demand-flexibility", name="DFS Service Requirement", refresh=True)
    utilisation = utilisation if utilisation is not None else fetch.neso_resource(
        "demand-flexibility", name="DFS Utilisation Report", refresh=True)
    accepted = collections.defaultdict(list)
    for u in utilisation:
        if u.get("Status") == "Accepted" and u.get("Service Requirement Type") == "Live":
            accepted[(u["Event ID"], u["Delivery Date"], u["From_Local"])].append(u)
    out = []
    for r in requirement:
        if r.get("Event Type") != "Upwards" or r.get("Event Tag") != "System":
            continue
        if r.get("Service Requirement Type") != "Live":
            continue
        start = _local_to_utc(r["Delivery Date"], r["From_Local"])
        end = _local_to_utc(r["Delivery Date"], r["To_Local"])
        if end <= start:
            end += dt.timedelta(days=1)
        sub_date, sub_time = r["DFS Submission Time_Local"].split(" ")
        close = _local_to_utc(sub_date, sub_time)
        acc = accepted.get((r["Event ID"], r["Delivery Date"], r["From_Local"]), [])
        prices = [p for p in (fnum(a.get("Utilisation Price GBP per MWh")) for a in acc) if p is not None]
        local_date = dt.datetime.strptime(r["Delivery Date"], "%d/%m/%Y").date().isoformat()
        out.append({
            "event_id": f"DFS-{local_date}-{r['Event ID']}",
            "start_utc": iso_z(start), "end_utc": iso_z(end),
            "direction": "Upwards", "tag": "System",
            "required_mw": fnum(r["Service Requirement MW"]),
            "zone_caps_mw": _zone_caps(r.get("Zonal Cap", "")),
            "procured_mw": round(sum(fnum(a.get("DFS Procured MW")) or 0 for a in acc), 3),
            "accepted_price_median_gbp_per_mwh": statistics.median(prices) if prices else None,
            "auction_close_utc": iso_z(close),
        })
    out.sort(key=lambda x: x["start_utc"])
    return {"meta": meta(["NESO demand-flexibility: DFS Service Requirement, DFS Utilisation Report (Live, Accepted)"],
                         note="auction_close_utc is the DFS submission time NESO publishes for the requirement"),
            "requests": out}


# ---------------------------------------------------------------- replay/<date>.json


def _avg_level(segments: list[dict], start: dt.datetime, end: dt.datetime) -> float | None:
    """Time-weighted average of linear levelFrom->levelTo segments over [start, end)."""
    total, covered = 0.0, 0.0
    for s in segments:
        a = dt.datetime.fromisoformat(s["timeFrom"].replace("Z", "+00:00"))
        b = dt.datetime.fromisoformat(s["timeTo"].replace("Z", "+00:00"))
        lo, hi = max(a, start), min(b, end)
        if hi <= lo or b <= a:
            continue
        span = (b - a).total_seconds()
        f0 = (lo - a).total_seconds() / span
        f1 = (hi - a).total_seconds() / span
        v0 = s["levelFrom"] + (s["levelTo"] - s["levelFrom"]) * f0
        v1 = s["levelFrom"] + (s["levelTo"] - s["levelFrom"]) * f1
        dur = (hi - lo).total_seconds()
        total += (v0 + v1) / 2 * dur
        covered += dur
    return None if covered == 0 else total / covered


def classify(pn: float | None, mel: float | None, curtailed_mwh: float) -> str:
    if curtailed_mwh > 0.05:
        return "instructed"
    if pn is None:
        return "unknown"
    if mel is not None and pn - mel > max(1.0, 0.05 * pn):
        return "unavailable"
    if pn < 1.0:
        # Zero planned output with no BM instruction: a declared outage if MEL is also ~0,
        # otherwise the farm chose not to run before gate closure (not visible as a paid action).
        return "unavailable" if (mel is not None and mel < 1.0) else "unknown"
    return "generating"


def build_replay(day: str, farm_ids: set[str]) -> dict:
    vols = collections.defaultdict(float)
    for r in fetch.elexon_volumes("bid", day):
        if r["bmUnit"] in farm_ids:
            vols[(r["bmUnit"], r["settlementPeriod"])] += r.get("totalVolumeAccepted") or 0
    cash = collections.defaultdict(float)
    for r in fetch.elexon_cashflows("bid", day):
        if r["bmUnit"] in farm_ids:
            cash[(r["bmUnit"], r["settlementPeriod"])] += r.get("totalCashflow") or 0
    periods = []
    for sp in range(1, periods_in_day(day) + 1):
        start = sp_start_utc(day, sp)
        end = start + dt.timedelta(minutes=30)
        seg = {"PN": collections.defaultdict(list), "MELS": collections.defaultdict(list)}
        for ds in seg:
            for r in fetch.elexon_physical(ds, day, sp):
                if r["bmUnit"] in farm_ids:
                    seg[ds][r["bmUnit"]].append(r)
        farms = {}
        for fid in sorted(farm_ids):
            pn = _avg_level(seg["PN"].get(fid, []), start, end)
            mel = _avg_level(seg["MELS"].get(fid, []), start, end)
            curtailed = max(0.0, -vols.get((fid, sp), 0.0))
            if pn is None and curtailed == 0:
                continue
            level = None if pn is None else max(0.0, pn - 2 * curtailed)
            farms[fid] = {"pn_mw": None if pn is None else round(pn, 1),
                          "level_mw": None if level is None else round(level, 1),
                          "curtailed_mwh": round(curtailed, 2),
                          "paid_gbp": round(cash.get((fid, sp), 0.0), 2),
                          "state": classify(pn, mel, curtailed)}
        periods.append({"sp": sp, "start_utc": iso_z(start), "farms": farms})
    return {"meta": meta(["Elexon PN", "Elexon MELS", "Elexon indicative volumes (bids)",
                          "Elexon indicative cashflows (bids)"],
                         method="curtailed_mwh = accepted bid volume; level_mw = pn_mw - 2 x curtailed_mwh; "
                                "state: instructed if curtailed; unavailable if PN exceeds MEL by >max(1 MW, 5%) "
                                "or PN and MEL are both ~0; unknown if PN ~0 while MEL > 0 (farm planned "
                                "no output before gate closure, not a paid BM action) or PN missing"),
            "date": day, "periods": periods}


def write_replay_index() -> Path:
    """replay/index.json: the replay days on disk, so the map's day picker can list them."""
    days = sorted(p.stem for p in (PUBLIC / "replay").glob("*.json") if p.stem not in ("index", "live"))
    return write_json("replay/index.json", {"meta": meta(["data/public/replay/*.json"]),
                                            "days": days, "live": "live.json"})


# ---------------------------------------------------------------- entry point

STEPS = ("farms", "daily", "dfs", "replay", "index")


def run(only: set[str]) -> None:
    farms_obj = None
    if "farms" in only:
        farms_obj = build_farms()
        write_json("farms.json", farms_obj)
    daily = None
    if "daily" in only or "replay" in only:
        daily, iceberg = build_daily_and_iceberg()
        if "daily" in only:
            write_json("curtailment_daily.json", daily)
            write_json("iceberg.json", iceberg)
    if "index" in only and "replay" not in only:
        write_replay_index()
    if "dfs" in only:
        write_json("dfs_requests.json", build_dfs())
    if "replay" in only:
        ref = wind_bmu_reference()
        scot_ids = set(scottish_wind_ids(ref, ng_to_elexon()))
        ranked = sorted((d for d in daily["days"] if d["curtailed_mwh"] is not None),
                        key=lambda d: -d["curtailed_mwh"])
        days = list(REPLAY_FIXED_DAYS)
        days += [d["date"] for d in ranked if d["date"] not in days][:REPLAY_EXTRA_DAYS]
        for day in days:
            write_json(f"replay/{day}.json", build_replay(day, scot_ids), compact=True)
        write_replay_index()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Regenerate lane A contract files in data/public/")
    parser.add_argument("--only", default=",".join(STEPS), help=f"comma list of {STEPS}")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run({s.strip() for s in args.only.split(",") if s.strip()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
