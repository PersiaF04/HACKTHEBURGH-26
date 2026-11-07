"""Reference implementation of the Ask the Grid tools and the golden question set (issue #91).

Stdlib only. The tools read data/public/ and return plain dicts, each with a `source` list
(file + field). The chat model routes questions to tools and words the result; it never
computes a figure. `compute()` evaluates every golden question against the data, so the
expected answers in contracts/fixtures/ask-golden.json are verified, not typed.

    python models/ask_golden.py            # print the golden set
    python models/ask_golden.py --write    # rewrite contracts/fixtures/ask-golden.json
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "public"
GOLDEN = ROOT / "contracts" / "fixtures" / "ask-golden.json"


def _load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _src(file, *fields):
    return [{"file": file, "fields": list(fields)}]


# ---- tools ---------------------------------------------------------------------------

def curtailment_for_day(date):
    day = next((d for d in _load("curtailment_daily.json")["days"] if d["date"] == date), None)
    if day is None:
        return {"error": "no_data", "date": date}
    keys = ["curtailed_mwh", "wind_paid_gbp", "neso_thermal_mwh", "neso_thermal_gbp"]
    return {"date": date, **{k: day[k] for k in keys},
            "source": _src("curtailment_daily.json", *keys)}


def top_curtailment_days(n, month=None):
    days = [d for d in _load("curtailment_daily.json")["days"]
            if d["curtailed_mwh"] is not None and (month is None or d["date"].startswith(month))]
    days.sort(key=lambda d: (-d["curtailed_mwh"], d["date"]))
    return {"month": month,
            "days": [{"date": d["date"], "curtailed_mwh": d["curtailed_mwh"]} for d in days[:n]],
            "source": _src("curtailment_daily.json", "curtailed_mwh")}


def _replay(date):
    """The replay file for a strict YYYY-MM-DD date under data/public/replay, or None."""
    if not isinstance(date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return None
    path = DATA / "replay" / f"{date}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def top_farms_for_day(date, n):
    rep = _replay(date)
    if rep is None:
        return {"error": "no_replay_for_date", "date": date}
    names = {f["id"]: f["name"] for f in _load("farms.json")["farms"]}
    tot = {}
    for p in rep["periods"]:
        for fid, f in p["farms"].items():
            tot[fid] = tot.get(fid, 0.0) + (f["curtailed_mwh"] or 0.0)
    ranked = sorted(tot.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    return {"date": date,
            "farms": [{"id": i, "name": names.get(i), "curtailed_mwh": round(t, 1)}
                      for i, t in ranked],
            "source": _src(f"replay/{date}.json", "periods[].farms.*.curtailed_mwh") + _src("farms.json", "name")}


def scotex_gap(date):
    rep = _replay(date)
    if rep is None:
        return {"error": "no_replay_for_date", "date": date}
    over, worst = 0, None
    for p in rep["periods"]:
        lim, flow = p["scotex_limit_mw"], p["scotex_flow_mw"]
        if lim is None or flow is None:
            continue
        gap = flow - lim
        if gap > 0:
            over += 1
        if worst is None or gap > worst[0]:
            worst = (gap, p["sp"])
    return {"date": date, "periods_over_limit": over,
            "max_overshoot_mw": round(worst[0], 3) if worst else None,
            "max_overshoot_sp": worst[1] if worst else None,
            "source": _src(f"replay/{date}.json", "periods[].scotex_flow_mw", "periods[].scotex_limit_mw")}


def dfs_requests_for_day(date=None):
    reqs = [r for r in _load("dfs_requests.json")["requests"]
            if date is None or r["start_utc"][:10] == date]
    # Each row is a requested interval of `required_mw` MW, so volume in MWh is MW x the row's duration in hours.
    # Summing the MW figures alone would double count (rows are 30 minutes). Rounded: float sums differ by platform.
    hours = lambda r: (dt.datetime.fromisoformat(r["end_utc"].replace("Z", "+00:00"))
                       - dt.datetime.fromisoformat(r["start_utc"].replace("Z", "+00:00"))).total_seconds() / 3600
    req = round(sum(r["required_mw"] * hours(r) for r in reqs), 3)
    got = round(sum(r["procured_mw"] * hours(r) for r in reqs), 3)
    return {"date": date, "requests": len(reqs), "required_mwh_total": req, "procured_mwh_total": got,
            "procured_pct": round(100 * got / req, 2) if req else None,
            "source": _src("dfs_requests.json", "start_utc", "required_mw", "procured_mw")}


def forecast_tomorrow():
    t = _load("dashboard.json")["tomorrow"]
    f = t["facts"]
    return {"target_date": t["target_date"], "headline": t["headline"],
            "total_p50_mwh": f["total_p50_mwh"], "peak_p90_mwh": f["peak_p90_mwh"],
            "peak_p_request": f["peak_p_request"], "request_window_utc": f["request_window_utc"],
            "source": _src("dashboard.json", "tomorrow.headline", "tomorrow.facts")}


def copilot_call(date):
    day = next((d for d in _load("dashboard.json")["replay_days"] if d["date"] == date), None)
    if day is None:
        return {"error": "no_copilot_for_date", "date": date}
    c = day["copilot"]
    out = {"date": date, "status": c["status"]}
    if c["status"] == "scored":
        out.update({k: c[k] for k in ("ready_windows_utc", "bid_gbp_per_mwh", "net_gbp", "pct_of_oracle")})
    else:
        out["reason"] = c["reason"]
    out["source"] = _src("dashboard.json", f"replay_days[{date}].copilot")
    return out


def farm_lookup(name):
    q = name.lower()
    hits = [f for f in _load("farms.json")["farms"] if q in f["name"].lower()]
    return {"query": name, "matches": [{k: f[k] for k in ("id", "name", "region", "capacity_mw")}
                                       for f in hits[:5]],
            "source": _src("farms.json", "id", "name", "region", "capacity_mw")}


TOOLS = {f.__name__: f for f in (curtailment_for_day, top_curtailment_days, top_farms_for_day,
                                 scotex_gap, dfs_requests_for_day, forecast_tomorrow,
                                 copilot_call, farm_lookup)}

# ---- golden questions ----------------------------------------------------------------
# (question, [(tool, args)], key figures to show: [(label, tool_index, field)])

ANSWERABLE = [
    ("How much wind was curtailed in Scotland on 14 October 2026?",
     [("curtailment_for_day", {"date": "2026-10-14"})], ["curtailed_mwh"]),
    ("What did NESO's thermal constraint measure cost on 14 October?",
     [("curtailment_for_day", {"date": "2026-10-14"})], ["neso_thermal_gbp"]),
    ("How much were wind farms paid to turn down on 1 April?",
     [("curtailment_for_day", {"date": "2026-04-01"})], ["wind_paid_gbp"]),
    ("Which day wasted the most wind?",
     [("top_curtailment_days", {"n": 1})], ["days"]),
    ("Give me the five worst curtailment days.",
     [("top_curtailment_days", {"n": 5})], ["days"]),
    ("Which three days in October wasted the most wind?",
     [("top_curtailment_days", {"n": 3, "month": "2026-10"})], ["days"]),
    ("Which farm wasted the most wind on 14 October?",
     [("top_farms_for_day", {"date": "2026-10-14", "n": 1})], ["farms"]),
    ("Top three curtailed farms on 13 October?",
     [("top_farms_for_day", {"date": "2026-10-13", "n": 3})], ["farms"]),
    ("Which farm was turned down most on 27 October, and by how much?",
     [("top_farms_for_day", {"date": "2026-10-27", "n": 1})], ["farms"]),
    ("How many half-hours was NESO's day-ahead SCOTEX flow forecast above its limit on 14 October?",
     [("scotex_gap", {"date": "2026-10-14"})], ["periods_over_limit", "max_overshoot_mw"]),
    ("What was the biggest SCOTEX overshoot on 27 October?",
     [("scotex_gap", {"date": "2026-10-27"})], ["max_overshoot_mw", "max_overshoot_sp"]),
    ("On 13 October, did NESO's day-ahead forecast flow ever exceed the SCOTEX limit?",
     [("scotex_gap", {"date": "2026-10-13"})], ["periods_over_limit"]),
    ("How many demand-flexibility requests did NESO publish for 8 October?",
     [("dfs_requests_for_day", {"date": "2026-10-08"})], ["requests", "procured_pct"]),
    ("How much of the DFS volume asked for on 27 October was procured?",
     [("dfs_requests_for_day", {"date": "2026-10-27"})], ["required_mwh_total", "procured_mwh_total", "procured_pct"]),
    ("Overall, how much of the requested DFS volume was filled?",
     [("dfs_requests_for_day", {})], ["requests", "procured_pct"]),
    ("What is tomorrow's outlook?",
     [("forecast_tomorrow", {})], ["target_date", "headline"]),
    ("How likely is NESO to ask for flexible demand tomorrow, and when?",
     [("forecast_tomorrow", {})], ["peak_p_request", "request_window_utc"]),
    ("What would the Copilot have told a flexible load to do on 27 October?",
     [("copilot_call", {"date": "2026-10-27"})], ["ready_windows_utc", "bid_gbp_per_mwh", "net_gbp"]),
    ("What was the Copilot's call on 13 October?",
     [("copilot_call", {"date": "2026-10-13"})], ["status", "reason"]),
    ("How big is the Aberdeen Bay wind farm and which region is it in?",
     [("farm_lookup", {"name": "Aberdeen Bay"})], ["matches"]),
]

# Refuse or caveat. No tool call may supply a figure for these. `must_say` are the ideas the
# reply has to contain; `never` lists claims it must not make.
REFUSALS = [
    ("How much money would a 50 MW electrolyser have earned from turn-up bids?",
     "revenue_claim", [],
     ["retrospective replay, not a revenue claim", "net of electricity at an assumed site value"],
     ["a profit or revenue figure for a real operator"]),
    ("Which part of Scotland is DFS zone Z1?",
     "zone_to_region", [],
     ["zone IDs are not confirmed as Scotland", "no mapping from zone to region in the data"],
     ["naming a region, city or farms for a zone"]),
    ("Why was Aberdeen Bay curtailed on 14 October?",
     "farm_cause", [("top_farms_for_day", {"date": "2026-10-14", "n": 1})],
     ["data shows how much was turned down, not why", "SCOTEX flow above its limit is context, not a cause for one farm"],
     ["a cause for an individual farm's curtailment"]),
    ("How much wind will be wasted next Friday?",
     "beyond_data", [],
     ["forecasts cover only the next day", "retrospective"],
     ["any figure for a date beyond the forecast target"]),
    ("How much wind was curtailed in Wales last month?",
     "outside_scotland", [],
     ["the data covers Scottish wind only"],
     ["a figure for any non-Scottish region"]),
]


def compute():
    out = []
    for i, (q, calls, keys) in enumerate(ANSWERABLE, 1):
        results = [TOOLS[t](**a) for t, a in calls]
        assert not any("error" in r for r in results), (q, results)
        out.append({"id": f"Q{i:02d}", "kind": "answer", "question": q,
                    "tool_calls": [{"tool": t, "args": a} for t, a in calls],
                    "expected_results": [{k: v for k, v in r.items() if k != "source"} for r in results],
                    "key_values": {k: results[0][k] for k in keys}})
    for j, (q, kind, calls, say, never) in enumerate(REFUSALS, len(ANSWERABLE) + 1):
        results = [TOOLS[t](**a) for t, a in calls]
        out.append({"id": f"Q{j:02d}", "kind": "refuse", "refusal_type": kind, "question": q,
                    "tool_calls": [{"tool": t, "args": a} for t, a in calls],
                    "expected_results": [{k: v for k, v in r.items() if k != "source"} for r in results],
                    "must_say": say, "must_not": never})
    return {"meta": {"note": "Answers computed by models/ask_golden.py from data/public. Regenerate with "
                             "'python models/ask_golden.py --write' when the data changes."},
            "questions": out}


if __name__ == "__main__":
    text = json.dumps(compute(), indent=1) + "\n"
    if "--write" in sys.argv:
        GOLDEN.write_text(text, encoding="utf-8")
        print(f"wrote {GOLDEN}")
    else:
        print(text)
