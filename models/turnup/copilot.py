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
    threshold: dict                   # (date, sp) -> highest accepted price that half-hour
    mid: dict                         # (date, sp) -> market index GBP/MWh
    util: dict                        # (date, sp) -> boundary utilisation
    days: list[str] = field(default_factory=list)


def accepted_thresholds(bids: list[dict]) -> dict:
    out: dict = {}
    for b in bids:
        if (b["type"] == "Upwards" and b["tag"] == "System" and b["req_type"] == "Live"
                and b["status"] == "Accepted" and b["price"] is not None):
            k = (b["date"], b["sp"])
            out[k] = max(out.get(k, 0.0), b["price"])
    return out


def tradable(m: Market, load: Load, day: str, sp: int) -> float | None:
    """Highest price that would have been accepted in this half-hour for this load, else None."""
    ev = m.events.get((day, sp))
    if ev is None or ev["caps"].get(load.zone, 0) < load.capacity_mw:
        return None
    return m.threshold.get((day, sp))


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
    fixed_price = _median([t for t in m.threshold.values()] or [60.0])
    days_out = []
    totals = {k: {"gross": 0.0, "energy": 0.0, "value": 0.0, "net": 0.0, "mwh": 0.0, "accepted": 0}
              for k in ("naive", "ours", "oracle")}
    per_day = []
    for d in scored:
        train_days = [x for x in event_days if x < d]
        sched = {"naive": naive_schedule(m, load, d, fixed_price),
                 "ours": ours_schedule(m, load, d, train_days),
                 "oracle": oracle_schedule(m, load, d)}
        res = {k: settle(m, load, d, s) for k, s in sched.items()}
        for k, r in res.items():
            for f in totals[k]:
                totals[k][f] += r[f]
        per_day.append((d, sched, res))
        days_out.append(_day_record(d, sched["ours"], res))
    return {"days": days_out, "totals": totals, "scored_days": scored, "fixed_price": fixed_price,
            "per_day": per_day}


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
