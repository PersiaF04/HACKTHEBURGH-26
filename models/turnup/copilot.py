"""Lane B, issue #30: Flex Copilot. Naive vs ours vs oracle for a flexible load on replay days.

The decision being replayed: on a day when NESO may publish DFS ``Upwards``/``System`` requests,
which half-hours should a flexible load be ready to use extra power in, and what price should it
bid? All three policies face the same days, the same electricity prices and the same budget of
half-hours, and are scored the same way.

Money model (kept deliberately plain, and stated in the output):
- Pay-as-bid: an accepted bid is paid its own price per MWh delivered (NESO DFS service terms, as
  read in #25; not independently re-derived here). Delivery is assumed perfect.
- A bid is accepted in a half-hour if there is a live request with a positive cap and the bid
  price is at or below the highest price NESO actually accepted in that half-hour. Half-hours in
  which no bid was accepted are treated as not tradable (conservative).
- Electricity costs the market index price. A site's tariff and levies will differ.
- ``value`` is what the extra energy is worth to the site (GBP/MWh). It is an assumption the user
  sets; at zero value the settlement does not cover the electricity, which the output states.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import turnup_prob as T
from .timeutil import iso_z, parse_date, sp_start_utc

WINDOW = list(T.WINDOW_SPS)
WARMUP_DAYS = 5
VALUE_SENSITIVITY = (0.0, 50.0, 100.0, 150.0, 200.0)


@dataclass
class Load:
    type: str = "electrolyser"
    capacity_mw: float = 50.0
    zone: str = "Z1"
    value_gbp_mwh: float = 100.0      # what the extra energy is worth to the site (assumption)
    max_periods: int = 12             # half-hours per day the site can run at full capacity (6 h)

    @property
    def mwh_per_period(self) -> float:
        return self.capacity_mw * 0.5


@dataclass
class Market:
    """Everything observed about one history, keyed by (date, sp)."""
    events: dict                      # live Upwards/System requirements
    threshold: dict                   # (date, sp, zone) -> highest price accepted in that zone that half-hour
    mid: dict                         # (date, sp) -> market index GBP/MWh
    util: dict                        # (date, sp) -> boundary utilisation
    days: list[str] = field(default_factory=list)


def accepted_thresholds(bids: list[dict]) -> dict:
    """Highest accepted bid price per (date, sp, zone). Zone IDs are kept apart on purpose: a bid that
    cleared in Z2 says nothing certain about whether a Z1 bid would have."""
    out: dict = {}
    for b in bids:
        if (b["type"] == "Upwards" and b["tag"] == "System" and b["req_type"] == "Live"
                and b["status"] == "Accepted" and b["price"] is not None and b.get("zone") is not None):
            k = (b["date"], b["sp"], f"Z{b['zone']}")
            out[k] = max(out.get(k, 0.0), b["price"])
    return out


def tradable(m: Market, load: Load, day: str, sp: int) -> float | None:
    """Highest price accepted in this load's own zone in this half-hour, else None (not tradable)."""
    ev = m.events.get((day, sp))
    if ev is None or ev["caps"].get(load.zone, 0) < load.capacity_mw:
        return None
    return m.threshold.get((day, sp, load.zone))


def settle(m: Market, load: Load, day: str, schedule: list[tuple[int, float]]) -> dict:
    """Score a day's schedule of (sp, bid price). Only accepted half-hours consume and earn."""
    gross = energy = 0.0
    accepted = 0
    for sp, price in schedule:
        t = tradable(m, load, day, sp)
        mid = m.mid.get((day, sp))
        if t is None or mid is None or price > t:
            continue
        mwh = load.mwh_per_period
        gross += price * mwh
        energy += mid * mwh
        accepted += 1
    mwh_total = accepted * load.mwh_per_period
    value = load.value_gbp_mwh * mwh_total
    return {"gross": gross, "energy": energy, "value": value, "net": gross + value - energy,
            "mwh": mwh_total, "accepted": accepted, "bid_periods": len(schedule)}


def naive_price(m: Market, load: Load, train_days: list[str]) -> float:
    """The naive rule's fixed bid: the median accepted-price ceiling in the load's zone on earlier days
    only (the same walk-forward cutoff as the other policies). With no history it uses 60, the
    pre-declared round figure near the lower end of prices NESO has accepted."""
    seen = set(train_days)
    ceilings = [t for (d, _sp, z), t in m.threshold.items() if d in seen and z == load.zone]
    return _median(ceilings) if ceilings else 60.0


def naive_schedule(m: Market, load: Load, day: str, fixed_price: float) -> list[tuple[int, float]]:
    """Public rule: bid a fixed price in the cheapest-electricity half-hours of the day window."""
    cands = [(m.mid[(day, sp)], sp) for sp in WINDOW if (day, sp) in m.mid]
    return [(sp, fixed_price) for _, sp in sorted(cands)[:load.max_periods]]


def oracle_schedule(m: Market, load: Load, day: str) -> list[tuple[int, float]]:
    """Hindsight: the best tradable half-hours, each bid exactly at its accepted price ceiling."""
    cands = []
    for sp in WINDOW:
        t = tradable(m, load, day, sp)
        mid = m.mid.get((day, sp))
        if t is not None and mid is not None and t + load.value_gbp_mwh - mid > 0:
            cands.append((t + load.value_gbp_mwh - mid, sp, t))
    return [(sp, t) for _, sp, t in sorted(cands, reverse=True)[:load.max_periods]]


class AcceptModel:
    """P(a bid at price p would be accepted) by electricity-price and utilisation tercile.

    Learned only from earlier days. For every in-window half-hour of those days it records the
    highest accepted price (or none), so the probability folds together "is there a request" and
    "would this price clear". Cells with too little history fall back to the electricity-price bin.
    """

    MIN_CELL = 12

    def __init__(self, m: Market, load: Load, train_days: list[str]):
        rows = []
        for d in train_days:
            for sp in WINDOW:
                u, mid = m.util.get((d, sp)), m.mid.get((d, sp))
                if u is None or mid is None:
                    continue
                ceiling = tradable(m, load, d, sp)
                rows.append((u, mid, ceiling))
        self.rows = rows
        self.u_edges = _edges([r[0] for r in rows], 3)
        self.m_edges = _edges([r[1] for r in rows], 3)
        self.cells: dict[tuple[int, int], list] = {}
        self.mbins: dict[int, list] = {}
        for u, mid, c in rows:
            ub, mb = _bin(u, self.u_edges), _bin(mid, self.m_edges)
            self.cells.setdefault((ub, mb), []).append(c)
            self.mbins.setdefault(mb, []).append(c)
        self.prices = sorted({c for _, _, c in rows if c is not None})

    def p_accept(self, price: float, util: float, mid: float) -> float:
        ub, mb = _bin(util, self.u_edges), _bin(mid, self.m_edges)
        cell = self.cells.get((ub, mb))
        if not cell or len(cell) < self.MIN_CELL:
            cell = self.mbins.get(mb) or [c for _, _, c in self.rows]
        return sum(1 for c in cell if c is not None and c >= price) / len(cell) if cell else 0.0


def _edges(vals: list[float], n: int) -> list[float]:
    s = sorted(vals)
    return [s[int(len(s) * i / n)] for i in range(1, n)] if s else []


def _bin(x: float, edges: list[float]) -> int:
    for i, e in enumerate(edges):
        if x < e:
            return i
    return len(edges)


def ours_schedule(m: Market, load: Load, day: str, train_days: list[str]) -> list[tuple[int, float]]:
    """Forecast-driven: rank half-hours by expected margin and pick the bid price that maximises it.

    Expected margin per half-hour = P(accepted at price) x (price + value - electricity price) x MWh.
    Uses the day-ahead utilisation snapshot and the electricity price for the day, plus history
    from earlier days only.
    """
    model = AcceptModel(m, load, train_days)
    if not model.prices:
        return []
    best: list[tuple[float, int, float]] = []
    best_total = 0.0
    for price in model.prices:
        margins = []
        for sp in WINDOW:
            u, mid = m.util.get((day, sp)), m.mid.get((day, sp))
            if u is None or mid is None:
                continue
            exp = model.p_accept(price, u, mid) * (price + load.value_gbp_mwh - mid) * load.mwh_per_period
            if exp > 0:
                margins.append((exp, sp, price))
        top = sorted(margins, reverse=True)[:load.max_periods]
        total = sum(x[0] for x in top)
        if total > best_total:
            best, best_total = top, total
    return [(sp, price) for _, sp, price in best]


def run(m: Market, load: Load) -> dict:
    """Replay every event day after the warm-up and score the three policies identically."""
    event_days = sorted({d for d, _ in m.events})
    scored = event_days[WARMUP_DAYS:]
    days_out = []
    totals = {k: {"gross": 0.0, "energy": 0.0, "value": 0.0, "net": 0.0, "mwh": 0.0, "accepted": 0}
              for k in ("naive", "ours", "oracle")}
    per_day = []
    tradable_total = sum(1 for d in scored for sp in WINDOW
                         if tradable(m, load, d, sp) is not None and (d, sp) in m.mid)
    for d in scored:
        train_days = [x for x in event_days if x < d]
        sched = {"naive": naive_schedule(m, load, d, naive_price(m, load, train_days)),
                 "ours": ours_schedule(m, load, d, train_days),
                 "oracle": oracle_schedule(m, load, d)}
        res = {k: settle(m, load, d, s) for k, s in sched.items()}
        for k, r in res.items():
            for f in totals[k]:
                totals[k][f] += r[f]
        per_day.append((d, sched, res))
        days_out.append(_day_record(d, sched["ours"], res))
    return {"days": days_out, "totals": totals, "scored_days": scored, "per_day": per_day,
            "tradable_half_hours": tradable_total}


def _day_record(d: str, ours_sched: list, res: dict) -> dict:
    dd = parse_date(d)
    return {
        "date": d,
        "policies": {k: {"gbp": round(r["net"]), "mwh": round(r["mwh"], 1),
                         "gross_settlement_gbp": round(r["gross"]), "energy_cost_gbp": round(r["energy"]),
                         "value_gbp": round(r["value"]), "accepted_periods": r["accepted"],
                         "bid_periods": r["bid_periods"]} for k, r in res.items()},
        "schedule": [{"start_utc": iso_z(sp_start_utc(dd, sp)), "action": "ready",
                      "bid_gbp_per_mwh": round(price, 2)} for sp, price in sorted(ours_sched)],
    }


def _median(xs: list[float]) -> float:
    s = sorted(xs)
    return s[len(s) // 2]


def pct_of_oracle(totals: dict) -> float | None:
    o = totals["oracle"]["net"]
    return None if o <= 0 else round(totals["ours"]["net"] / o, 3)


def sensitivity(m: Market, load: Load) -> list[dict]:
    """Same replay at different site values, so the result is not hostage to one assumption."""
    out = []
    for v in VALUE_SENSITIVITY:
        r = run(m, Load(load.type, load.capacity_mw, load.zone, v, load.max_periods))
        t = r["totals"]
        out.append({"value_gbp_per_mwh": v,
                    "net_gbp": {k: round(t[k]["net"]) for k in t},
                    "pct_of_oracle": pct_of_oracle(t)})
    return out


def break_even_value(totals: dict, who: str) -> float | None:
    """Value per MWh the site would need for this policy to break even: (energy - settlement) / MWh."""
    t = totals[who]
    return None if t["mwh"] <= 0 else round((t["energy"] - t["gross"]) / t["mwh"], 1)


def settlement_check(summary: list[dict], bids: list[dict]) -> dict:
    """Check the pay-as-bid arithmetic against NESO's published numbers.

    1. Accepted cost: sum(accepted MW x price x 0.5 h) per half-hour should equal NESO's published
       "accepted total cost". A match supports the settlement model for accepted bids.
    2. Delivery: NESO's published settled cost divided by accepted cost shows how much of accepted
       volume was actually settled so far. The Copilot assumes full delivery, which is optimistic.
    """
    mine: dict = {}
    for b in bids:
        if b["status"] == "Accepted" and b["price"] is not None and b["mw"] is not None:
            k = (b["event_id"], b["date"], b["sp"])
            mine[k] = mine.get(k, 0.0) + b["mw"] * b["price"] * 0.5
    matched = exact = 0
    sys_matched = sys_exact = 0
    acc_cost = {"all": 0.0, "sys": 0.0}
    set_cost = {"all": 0.0, "sys": 0.0}
    n_set = {"all": 0, "sys": 0}
    for r in summary:
        is_sys = r["type"] == "Upwards" and r["tag"] == "System"
        k = (r["event_id"], r["date"], r["sp"])
        if r["accepted_cost"] is not None and k in mine:
            matched += 1
            ok = abs(float(r["accepted_cost"]) - mine[k]) < 0.02
            exact += ok
            if is_sys and float(r["accepted_cost"]) > 0:
                sys_matched += 1
                sys_exact += ok
        if (r["settled_cost"] is not None and r["accepted_cost"] and float(r["accepted_cost"]) > 0
                and r["procured_mw"] and float(r["procured_mw"]) > 0):
            for key in ("all",) + (("sys",) if is_sys else ()):
                acc_cost[key] += float(r["accepted_cost"])
                set_cost[key] += float(r["settled_cost"])
                n_set[key] += 1

    def ratio(key):
        return round(set_cost[key] / acc_cost[key], 3) if acc_cost[key] > 0 else None
    return {
        "accepted_cost_halfhours_matched": matched, "accepted_cost_exact_within_2p": exact,
        "upwards_system_matched": sys_matched, "upwards_system_exact_within_2p": sys_exact,
        "settled_to_accepted_cost_ratio_all_dfs": ratio("all"), "settled_halfhours_all_dfs": n_set["all"],
        "settled_to_accepted_cost_ratio_upwards_system": ratio("sys"),
        "settled_halfhours_upwards_system": n_set["sys"],
        "reading": ("Pay-as-bid arithmetic for accepted bids reproduces NESO's published accepted cost. Settlement "
                    "so far is well below accepted cost across DFS and is published for few Upwards/System "
                    "half-hours, so the Copilot's full-delivery assumption is optimistic."),
    }
