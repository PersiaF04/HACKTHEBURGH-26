"""Lane B: probability that NESO publishes a DFS ``Upwards``/``System`` requirement (issue #30a).

Honest scope: DFS constraint turn-up requests have only existed since 7 Oct 2026 (about 18 event
days), so this is a deliberately simple, provisional model. Every request seen so far falls
between 11:00 and 23:00 local (settlement periods 23 to 46), so the probability outside that window
is reported as zero and flagged as an observation, not a law.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import stats
from .timeutil import shift

WINDOW_SPS = range(23, 47)     # 11:00 to 23:00 local, the only periods with requests so far
BINS = 3
MIN_TRAIN_DAYS = 5


@dataclass
class Obs:
    date: str
    sp: int
    util: float
    event: bool


def build_obs(events: dict, util: dict, era_start: str, last_date: str) -> list[Obs]:
    """One observation per in-window half-hour on each day the DFS requirement data covers."""
    out = []
    d = era_start
    while d <= last_date:
        for sp in WINDOW_SPS:
            u = util.get((d, sp))
            if u is not None:
                out.append(Obs(d, sp, u, (d, sp) in events))
        d = shift(d, 1)
    return out


def _edges(vals: list[float], n: int) -> list[float]:
    s = sorted(vals)
    return [s[int(len(s) * i / n)] for i in range(1, n)]


def _bin(x: float, edges: list[float]) -> int:
    for i, e in enumerate(edges):
        if x < e:
            return i
    return len(edges)


class TurnupModel:
    """Event rate by tercile of boundary utilisation, Laplace-smoothed."""

    def __init__(self, train: list[Obs]):
        self.edges = _edges([o.util for o in train], BINS)
        counts: dict[int, list[int]] = {}
        for o in train:
            c = counts.setdefault(_bin(o.util, self.edges), [0, 0])
            c[0] += 1 if o.event else 0
            c[1] += 1
        self.rate = {b: (c[0] + 1) / (c[1] + 2) for b, c in counts.items()}
        self.base = sum(1 for o in train if o.event) / len(train)

    def prob(self, util: float, sp: int) -> float:
        if sp not in WINDOW_SPS:
            return 0.0
        return self.rate.get(_bin(util, self.edges), self.base)


def evaluate(obs: list[Obs]) -> dict:
    """Day-by-day rolling-origin check: train on earlier days only, predict the next day."""
    days = sorted({o.date for o in obs})
    probs, base, outcome, rows = [], [], [], []
    for i, d in enumerate(days):
        train = [o for o in obs if o.date < d]
        if i < MIN_TRAIN_DAYS or not train:
            continue
        model = TurnupModel(train)
        for o in (x for x in obs if x.date == d):
            probs.append(model.prob(o.util, o.sp))
            base.append(model.base)
            outcome.append(o.event)
            rows.append(o)
    if not probs:
        return {"available": False, "reason": "fewer than 6 DFS days"}
    return {
        "available": True,
        "era_start": days[0],
        "scored_days": len({o.date for o in rows}),
        "n_periods_in_window": len(probs),
        "event_share_in_window": round(sum(outcome) / len(outcome), 3),
        "brier": {"model": round(stats.brier(probs, outcome), 3),
                  "base_rate": round(stats.brier(base, outcome), 3)},
        "auc": {"model": _r(stats.auc(probs, outcome))},
        "reliability": stats.reliability(probs, outcome, bins=5),
        "caveat": ("Provisional: about one month and 30 events since DFS began procuring constraint "
                   "turn-up on 7 Oct 2026. Periods are clustered by event, not independent. "
                   "Zones Z1 to Z3 are zone IDs; their mapping to regions is unconfirmed."),
    }


def _r(v):
    return None if v is None else round(v, 3)


def zone_share_given_event(events: dict) -> dict[str, float]:
    """Share of event half-hours in which each zone had a positive cap."""
    zones: dict[str, int] = {}
    for r in events.values():
        for z, v in r["caps"].items():
            if v > 0:
                zones[z] = zones.get(z, 0) + 1
    return {z: round(n / len(events), 3) for z, n in sorted(zones.items())} if events else {}
