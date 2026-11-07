"""Lane B, issue #29: next-day Scottish wind curtailment forecast and its backtest.

Target: Scottish BM-instructed wind turn-down, MWh per half-hour (zero when nothing was
instructed). Feature: day-ahead utilisation (flow / limit) of the SSE_SP2 boundary, plus
curtailment in the same period two days earlier (a safe lag for a forecast issued the
afternoon before). The model is a transparent lookup table of empirical quantiles.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import stats
from .timeutil import iso_z, parse_date, shift, sp_start_utc

HEAVY_MWH = 1000.0      # "heavy" curtailment: more than 1,000 MWh in a half-hour
PERSIST_LAG_DAYS = 2    # forecast is issued the afternoon before; D-1 is not complete yet
MIN_CELL = 30           # smallest cell trusted on its own; otherwise fall back
UTIL_BINS = 8
PERS_BINS = 4
TEST_START = "2026-09-01"
FOLD_DAYS = 7
MIN_TRAIN_DAYS = 120
BOUNDARY = "SSE_SP2"


@dataclass
class Row:
    date: str
    sp: int
    util: float
    pers: float | None
    y: float | None


def build_rows(curtail: dict, util: dict, last_target_date: str) -> list[Row]:
    """One row per (date, sp). A missing curtailment key means nothing was instructed (0)."""
    rows: list[Row] = []
    for (date, sp), u in sorted(util.items()):
        lag = shift(date, -PERSIST_LAG_DAYS)
        pers = curtail.get((lag, sp), 0.0) if lag <= last_target_date else None
        y = curtail.get((date, sp), 0.0) if date <= last_target_date else None
        rows.append(Row(date, sp, u, pers, y))
    return rows


def _edges(values: list[float], n: int) -> list[float]:
    s = sorted(values)
    return [s[int(len(s) * i / n)] for i in range(1, n)]


def _bin(x: float, edges: list[float]) -> int:
    for i, e in enumerate(edges):
        if x < e:
            return i
    return len(edges)


class QuantileLookup:
    """Empirical quantiles by (utilisation bin, lagged-curtailment bin), with fallbacks."""

    def __init__(self, train: list[Row]):
        self.u_edges = _edges([r.util for r in train], UTIL_BINS)
        self.p_edges = _edges([r.pers for r in train if r.pers is not None], PERS_BINS)
        self.cell: dict[tuple[int, int], list[float]] = {}
        self.ubin: dict[int, list[float]] = {}
        self.all: list[float] = sorted(r.y for r in train)
        for r in train:
            ub = _bin(r.util, self.u_edges)
            self.ubin.setdefault(ub, []).append(r.y)
            if r.pers is not None:
                self.cell.setdefault((ub, _bin(r.pers, self.p_edges)), []).append(r.y)
        for d in (self.cell, self.ubin):
            for k in d:
                d[k].sort()

    def sample(self, util: float, pers: float | None) -> list[float]:
        ub = _bin(util, self.u_edges)
        if pers is not None:
            c = self.cell.get((ub, _bin(pers, self.p_edges)))
            if c and len(c) >= MIN_CELL:
                return c
        c = self.ubin.get(ub)
        return c if c and len(c) >= MIN_CELL else self.all

    def predict(self, util: float, pers: float | None) -> dict:
        s = self.sample(util, pers)
        return {
            "p10": stats.quantile(s, 0.10), "p50": stats.quantile(s, 0.50),
            "p90": stats.quantile(s, 0.90), "mean": stats.mean(s),
            "p_heavy": sum(1 for v in s if v > HEAVY_MWH) / len(s),
        }


class HeadroomRule:
    """Baseline: two cells, boundary flow above or below its limit."""

    def __init__(self, train: list[Row]):
        self.cells: dict[bool, list[float]] = {True: [], False: []}
        for r in train:
            self.cells[r.util > 1.0].append(r.y)
        self.fallback = [r.y for r in train]

    def predict(self, util: float) -> dict:
        s = self.cells[util > 1.0] or self.fallback
        return {"mean": stats.mean(s), "p_heavy": sum(1 for v in s if v > HEAVY_MWH) / len(s)}


def usable(rows: list[Row]) -> list[Row]:
    return [r for r in rows if r.y is not None]


def backtest_predictions(rows: list[Row], test_start: str = TEST_START) -> list[dict]:
    """Rolling-origin, expanding-window predictions in weekly folds.

    Each fold trains only on rows dated before the fold, then predicts the fold. All baselines
    are scored on the same rows.
    """
    data = usable(rows)
    last = max(r.date for r in data)
    preds: list[dict] = []
    start = test_start
    while start <= last:
        end = shift(start, FOLD_DAYS)
        train = [r for r in data if r.date < start]
        test = [r for r in data if start <= r.date < end and r.pers is not None]
        if test and len({r.date for r in train}) >= MIN_TRAIN_DAYS:
            model, head = QuantileLookup(train), HeadroomRule(train)
            mean_y = stats.mean([r.y for r in train])
            prior = sum(1 for r in train if r.y > HEAVY_MWH) / len(train)
            for r in test:
                m, h = model.predict(r.util, r.pers), head.predict(r.util)
                preds.append({"date": r.date, "sp": r.sp, "y": r.y, "heavy": r.y > HEAVY_MWH,
                              "p50": m["p50"], "p10": m["p10"], "p90": m["p90"], "p_heavy": m["p_heavy"],
                              "util": r.util, "persist": r.pers, "train_mean": mean_y, "prior": prior,
                              "head_mean": h["mean"], "head_p": h["p_heavy"]})
        start = end
    if not preds:
        raise RuntimeError("no backtest predictions: not enough history")
    return preds


def backtest(rows: list[Row], test_start: str = TEST_START) -> dict:
    return summarise(backtest_predictions(rows, test_start))


def _r(v):
    return None if v is None else round(v, 3)


def summarise(preds: list[dict]) -> dict:
    y = [p["y"] for p in preds]
    heavy = [p["heavy"] for p in preds]
    persist_heavy = [1.0 if p["persist"] > HEAVY_MWH else 0.0 for p in preds]
    return {
        "test_window": [min(p["date"] for p in preds), max(p["date"] for p in preds)],
        "n_periods": len(preds),
        "heavy_threshold_mwh": HEAVY_MWH,
        "heavy_share_in_test": round(sum(heavy) / len(heavy), 3),
        "mae_mwh": {
            "model": round(stats.mae([p["p50"] for p in preds], y), 1),
            "persistence": round(stats.mae([p["persist"] for p in preds], y), 1),
            "training_mean": round(stats.mae([p["train_mean"] for p in preds], y), 1),
            "headroom_rule": round(stats.mae([p["head_mean"] for p in preds], y), 1),
        },
        "brier_heavy": {
            "model": round(stats.brier([p["p_heavy"] for p in preds], heavy), 3),
            "persistence": round(stats.brier(persist_heavy, heavy), 3),
            "prior": round(stats.brier([p["prior"] for p in preds], heavy), 3),
            "headroom_rule": round(stats.brier([p["head_p"] for p in preds], heavy), 3),
        },
        "auc_heavy": {
            "model": _r(stats.auc([p["p_heavy"] for p in preds], heavy)),
            "persistence": _r(stats.auc([p["persist"] for p in preds], heavy)),
            "headroom_rule": _r(stats.auc([p["head_p"] for p in preds], heavy)),
        },
        "interval_coverage_p10_p90": round(
            sum(1 for p in preds if p["p10"] <= p["y"] <= p["p90"]) / len(preds), 3),
        "reliability": stats.reliability([p["p_heavy"] for p in preds], heavy),
        "by_month": _by_month(preds),
        "method": ("Rolling-origin, expanding window, weekly folds; each fold trains only on earlier "
                   "dates. The point forecast for MAE is the median (p50). Persistence is the same "
                   f"half-hour {PERSIST_LAG_DAYS} days earlier."),
    }


def _by_month(preds: list[dict]) -> list[dict]:
    months: dict[str, list[dict]] = {}
    for p in preds:
        months.setdefault(p["date"][:7], []).append(p)
    out = []
    for m in sorted(months):
        ps = months[m]
        y = [p["y"] for p in ps]
        out.append({"month": m, "n_periods": len(ps),
                    "mae_model": round(stats.mae([p["p50"] for p in ps], y), 1),
                    "mae_persistence": round(stats.mae([p["persist"] for p in ps], y), 1),
                    "heavy_share": round(sum(1 for p in ps if p["heavy"]) / len(ps), 3)})
    return out


def forecast_day(rows: list[Row], target_date: str) -> list[dict]:
    """Forecast every half-hour of ``target_date`` using only rows dated before it."""
    train = [r for r in usable(rows) if r.date < target_date]
    model = QuantileLookup(train)
    out = []
    for r in rows:
        if r.date == target_date:
            out.append({"sp": r.sp, "util": r.util, **model.predict(r.util, r.pers)})
    return out


def latest_target_date(util: dict, fallback: str) -> str:
    """The day to forecast: the latest day with a near-complete day-ahead flows snapshot."""
    counts: dict[str, int] = {}
    for (d, _sp) in util:
        counts[d] = counts.get(d, 0) + 1
    complete = [d for d, n in counts.items() if n >= 46]
    return max(complete) if complete else fallback


def period_record(date: str, sp: int, m: dict, p_request: float | None) -> dict:
    return {
        "start_utc": iso_z(sp_start_utc(parse_date(date), sp)),
        "curtailed_mwh_p10": round(m["p10"]), "curtailed_mwh_p50": round(m["p50"]),
        "curtailed_mwh_p90": round(m["p90"]), "p_heavy": round(m["p_heavy"], 3),
        "p_turnup_request": None if p_request is None else round(p_request, 3),
    }


MORNING_FIRST_SP = 19   # 09:00 local: the same-morning update is issued at 08:45 UTC


def morning_update_backtest(rows: list[Row], wind: dict, test_start: str = TEST_START) -> dict:
    """Sensitivity: what if NESO's same-morning national wind forecast were available?

    Scored only on half-hours from 09:00 local, on exactly the same rows for both models. The archived
    wind forecast is stamped on the target day (not a day-ahead vintage), so this is NOT the "tomorrow"
    model and is reported separately.
    """
    keep = {(r.date, r.sp) for r in rows if r.sp >= MORNING_FIRST_SP and (r.date, r.sp) in wind}
    main_rows = [r for r in rows if (r.date, r.sp) in keep or r.date < test_start]
    wind_rows = [Row(r.date, r.sp, r.util, wind[(r.date, r.sp)] * 10000.0 if (r.date, r.sp) in wind else None, r.y)
                 for r in main_rows]
    main = {(p["date"], p["sp"]): p for p in backtest_predictions(main_rows, test_start) if (p["date"], p["sp"]) in keep}
    withw = {(p["date"], p["sp"]): p for p in backtest_predictions(wind_rows, test_start) if (p["date"], p["sp"]) in keep}
    common = sorted(set(main) & set(withw))
    if not common:
        return {"available": False}
    a, b = [main[k] for k in common], [withw[k] for k in common]
    y = [p["y"] for p in a]
    heavy = [p["heavy"] for p in a]
    return {
        "available": True,
        "test_window": [min(k[0] for k in common), max(k[0] for k in common)],
        "n_periods": len(common),
        "mae_mwh": {"with_wind_forecast": round(stats.mae([p["p50"] for p in b], y), 1),
                    "main_model": round(stats.mae([p["p50"] for p in a], y), 1),
                    "persistence": round(stats.mae([p["persist"] for p in a], y), 1)},
        "brier_heavy": {"with_wind_forecast": round(stats.brier([p["p_heavy"] for p in b], heavy), 3),
                        "main_model": round(stats.brier([p["p_heavy"] for p in a], heavy), 3)},
        "auc_heavy": {"with_wind_forecast": _r(stats.auc([p["p_heavy"] for p in b], heavy)),
                      "main_model": _r(stats.auc([p["p_heavy"] for p in a], heavy))},
        "note": ("Sensitivity, not the tomorrow model. Uses NESO's national incentive wind forecast as archived, "
                 "stamped 08:45 UTC on the target day, so it is a same-morning update and scored only from "
                 "09:00 local. A day-ahead vintage would help less. Retrospective."),
    }
