"""Export the map, concept, gaps, gap-detail and meta files for the frontend (issue #162).

The output shapes are the frontend's own (``whitespace/web/src/api.ts``: ``MapResponse``,
``ConceptResponse``, ``GapListResponse``, ``GapDetail``, ``MetaResponse``); extra keys are
additions the frontend ignores. Pure functions apart from ``write_export``.

Honesty rules:

* A year-Y map file is built from the year-Y snapshot only (works dated on or before
  31 December Y): concepts, counts, growth and predicted edges. The ONE exception is the
  x/y position, which comes from a single layout computed at the final exported snapshot and
  reused for every year (so the slider moves points by size and colour only). Each map file
  states ``layout_year``.
* The layout is a projection (truncated SVD of the positive-PMI matrix of the co-occurrence
  graph). Distance on the map is not a measure of research similarity.
* The combined gap score is not a probability. Inputs that do not exist yet are omitted,
  never guessed: no embeddings means no cosine term; no open-problem mining means no
  gap-rate term. ``meta`` states the formula actually used.
* Papers are exported as id, year and link only. No abstract text is ever read or written
  (``Work`` carries none).
* Headline numbers are copied from a real backtest ``metrics`` dict, otherwise null.
* NaN and infinity become null.
"""
from __future__ import annotations

import json
import math
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path

import numpy as np

from .backtest import DATA_LABELS, is_real_run
from .common import LINK_THRESHOLD, MIN_PAPERS, Work, normalise_arxiv_id, snapshot_end
from .graphs import PairSet, Snapshot, build_snapshot, vocabulary

COORD_RANGE = 1.0  # layout coordinates lie in [-COORD_RANGE, COORD_RANGE] (the frontend rescales)
LAYOUT_SEED = 0
GAP_FORMULA_FULL = (
    "p_link * sigmoid(growth_a + growth_b) * (1 - max(cosine, neighbour_overlap)) "
    "* (1 + gap_rate_a + gap_rate_b)"
)
GAP_NOTE = (
    "The combined gap score is a ranking heuristic, not a probability. Read the components "
    "(p_link, momentum, novelty, ...) next to it."
)
LAYOUT_NOTE = (
    "Positions are a 2D projection (truncated SVD of the positive-PMI co-occurrence matrix at the "
    "final snapshot), not a measure of research similarity. Every year shares one layout."
)
HEADLINE_KEYS = (
    "backtest_data_label", "verdict", "best_baseline", "test_origin",
    "average_precision_difference", "average_precision_ci_low", "average_precision_ci_high",
    "precision_at_100_difference", "precision_at_100_ci_low", "precision_at_100_ci_high",
)

# Display-level stoplist for the PRODUCTION GAP LIST ONLY (issue #255). Generic filler phrases that
# the title/abstract phrase extractor keeps as "concepts" and that otherwise crowd the top gaps. Exact,
# whole-phrase, lowercase match on the concept string. The vocabulary, features, model, backtest and
# map are NOT filtered. Conservative on purpose: fillers only, no domain terms.
GENERIC_PHRASES = frozenset({
    # owner's list
    "vice versa", "located", "many area", "already", "today", "achieving", "un", "abc", "able to achieve",
    # participles and light verbs
    "met", "prepared", "projected", "contributing", "discussing", "delayed", "formalized", "compromising",
    "executing", "merge", "elaborate", "indirect", "thing", "something",
    # discourse phrases and fillers
    "taking into account", "freely available", "difficult problem",
    # adverbs
    "formally", "autonomously", "actually", "basically", "currently", "generally", "firstly", "secondly",
    "lastly", "ultimately", "eventually", "previously", "obviously", "essentially", "indeed", "really",
    "simply", "merely", "truly", "unfortunately", "interestingly", "surprisingly", "importantly",
    "consequently", "accordingly", "subsequently", "briefly", "clearly",
    # determiner and quantity bigrams
    "many field", "many problem", "many case", "many study", "small number", "large amount",
    # extraction fragments and non-English remnants
    "ing", "penting", "sering", "aforementioned", "regarding", "concerning",
})
STOPLIST_NOTE = ("{n} generic phrases hidden from this list; vocabulary and backtest unchanged")

Predictor = Callable[[Sequence[Work], int], "tuple[PairSet, np.ndarray]"]


# ------------------------------------------------------------------ helpers

def clean(obj):
    """JSON-safe copy: numpy scalars/arrays to Python, NaN and infinity to None."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return clean(obj.tolist())
    if isinstance(obj, np.generic):
        return clean(obj.item())
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    return obj


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z)) if z >= 0 else math.exp(z) / (1.0 + math.exp(z))


def visible_works(works: Iterable[Work], year: int) -> list[Work]:
    """Distinct works dated on or before 31 Dec ``year`` (first occurrence of an id wins)."""
    end, seen, out = snapshot_end(year), set(), []
    for w in works:
        if w.date <= end and w.id not in seen:
            seen.add(w.id)
            out.append(w)
    return out


def paper_ref(work: Work) -> dict:
    """Id, year and link only. The title is the id because ``Work`` holds no title."""
    pid = normalise_arxiv_id(work.id)
    if pid and len(pid) >= 9 and pid[4] == ".":
        url = f"https://arxiv.org/abs/{pid}"
    elif work.id.startswith("W") and work.id[1:].isdigit():
        url = f"https://openalex.org/{work.id}"
    else:
        url = ""
    return {"id": work.id, "title": work.id, "year": work.date.year, "url": url}


def concept_series(visible: Sequence[Work], year: int) -> dict[str, dict[int, int]]:
    """Papers per concept per calendar year, from ``visible`` works only."""
    out: dict[str, dict[int, int]] = {}
    for w in visible:
        for c in set(w.concepts):
            row = out.setdefault(c, {})
            row[w.date.year] = row.get(w.date.year, 0) + 1
    return out


def growth(series: dict[int, int], year: int) -> float:
    """log(papers in Y-2..Y + 1) - log(papers in Y-5..Y-3 + 1); same definition as features.py."""
    recent = sum(n for y, n in series.items() if year - 2 <= y <= year)
    previous = sum(n for y, n in series.items() if year - 5 <= y < year - 2)
    return math.log(recent + 1.0) - math.log(previous + 1.0)


# ------------------------------------------------------------------ layout

def compute_layout(snapshot: Snapshot, names: Sequence[str], rank: int = 2, seed: int = LAYOUT_SEED) -> np.ndarray:
    """Deterministic 2D positions, shape ``(len(names), 2)``, in ``[-COORD_RANGE, COORD_RANGE]``.

    Truncated SVD (randomised subspace iteration with a fixed seed, numpy only) of the
    positive-PMI matrix of the co-occurrence graph: ``PPMI_ij = max(0, log(w_ij * W / (s_i * s_j)))``
    with ``s_i`` the row sums and ``W`` their total. Coordinates are ``U * S`` of the top two
    components. Signs are fixed (largest-magnitude entry of each axis positive) and both axes
    share one scale, so the aspect ratio is kept. Concepts with no co-occurrence sit at the origin.
    """
    n = len(names)
    if n == 0:
        return np.zeros((0, rank))
    index = {name: k for k, name in enumerate(names)}
    rows, cols, vals = [], [], []
    for (a, b), w in snapshot.weights.items():
        if a in index and b in index:
            rows.append(index[a]); cols.append(index[b]); vals.append(w)
    pmi = np.zeros((n, n), dtype=np.float32)
    if vals:
        r, c, v = np.array(rows), np.array(cols), np.array(vals, dtype=np.float32)
        pmi[r, c] = v
        pmi[c, r] = v
        s = pmi.sum(axis=1)
        total = float(s.sum())
        nz_r, nz_c = np.nonzero(pmi)
        ratio = pmi[nz_r, nz_c] * total / (s[nz_r] * s[nz_c])
        pmi[nz_r, nz_c] = np.maximum(np.log(ratio), 0.0)
    if not pmi.any():
        return np.zeros((n, rank))
    k = min(n, rank + 10)
    rng = np.random.default_rng(seed)
    q, _ = np.linalg.qr(pmi @ rng.standard_normal((n, k)).astype(np.float32))
    for _ in range(4):  # power iterations sharpen the leading subspace
        q, _ = np.linalg.qr(pmi @ q)
    small = q.T @ pmi
    ub, sv, _ = np.linalg.svd(small, full_matrices=False)
    xy = (q @ ub[:, :rank]) * sv[:rank]
    xy = xy.astype(np.float64)
    if xy.shape[1] < rank:
        xy = np.hstack([xy, np.zeros((n, rank - xy.shape[1]))])
    for d in range(rank):
        if xy[np.argmax(np.abs(xy[:, d])), d] < 0:
            xy[:, d] = -xy[:, d]
    peak = np.abs(xy).max()
    return np.round(xy / peak * COORD_RANGE, 4) if peak > 0 else xy


# ------------------------------------------------------------------ predictor

def trained_predictor(trained, n_min: int = MIN_PAPERS) -> Predictor:
    """Wrap a ``backtest.Trained`` as ``predict(works, year) -> (PairSet, calibrated p_link)``.

    Features come from works dated on or before 31 Dec ``year`` only (``backtest.score_origin``).
    """
    from .backtest import score_origin

    def predict(works: Sequence[Work], year: int):
        pairs, _ctx, _decision, prob = score_origin(list(works), trained, year, n_min)
        return pairs, prob

    return predict


# ------------------------------------------------------------------ per-file builders

def build_map(
    works: Sequence[Work], year: int, layout: dict[str, tuple[float, float]], layout_year: int,
    predictor: Predictor, *, n_min: int, edge_threshold: float, max_edges: int,
    labels: dict[str, str] | None = None,
) -> dict:
    """``MapResponse`` for ``year``. Everything but x/y uses the year-``year`` snapshot only."""
    visible = visible_works(works, year)
    snap = build_snapshot(visible, year)
    series = concept_series(visible, year)
    concepts = []
    for name in vocabulary(snap, n_min):
        x, y = layout.get(name, (0.0, 0.0))
        s = series.get(name, {})
        concepts.append({
            "id": name, "label": (labels or {}).get(name, name),
            "paper_count": snap.counts[name], "papers_year": s.get(year, 0),
            "papers_cumulative": snap.counts[name],
            "x": x, "y": y, "growth": growth(s, year),
        })
    pairs, prob = predictor(visible, year)
    edges = []
    if len(pairs):
        keep = np.flatnonzero(prob >= edge_threshold)
        keep = keep[np.argsort(-prob[keep], kind="stable")][:max_edges]
        edges = [
            {"source": pairs.names[pairs.i[k]], "target": pairs.names[pairs.j[k]], "p_link": float(prob[k])}
            for k in keep
        ]
    return {
        "placeholder": False, "year": year, "concepts": concepts, "edges": edges, "focus": None,
        "layout_year": layout_year, "layout_note": LAYOUT_NOTE,
        "edge_note": f"Predicted new links (not yet co-occurring {LINK_THRESHOLD}+ times) with calibrated "
                     f"p_link >= {edge_threshold}, at most {max_edges}, from the {year} snapshot only.",
    }


def _linked_adjacency(snap: Snapshot, names: Sequence[str]) -> np.ndarray:
    index = {n: k for k, n in enumerate(names)}
    adj = np.zeros((len(names), len(names)), dtype=bool)
    for (a, b), w in snap.weights.items():
        if w >= LINK_THRESHOLD and a in index and b in index:
            adj[index[a], index[b]] = adj[index[b], index[a]] = True
    return adj


def gap_score_parts(
    p_link: float, growth_a: float, growth_b: float, neighbour_overlap: float,
    cosine: float | None = None, gap_rate_a: float | None = None, gap_rate_b: float | None = None,
) -> dict:
    """Score factors as documented. A missing input omits its factor (it is 1), never a guess.

    ``score = p_link * momentum * novelty * gap_factor`` where ``momentum = sigmoid(growth_a +
    growth_b)``, ``novelty = 1 - max(cosine, neighbour_overlap)`` (cosine dropped if None) and
    ``gap_factor = 1 + gap_rate_a + gap_rate_b`` (1 if either rate is None).
    """
    momentum = sigmoid(growth_a + growth_b)
    novelty = 1.0 - (neighbour_overlap if cosine is None else max(cosine, neighbour_overlap))
    have_rates = gap_rate_a is not None and gap_rate_b is not None
    gap_factor = 1.0 + gap_rate_a + gap_rate_b if have_rates else 1.0
    return {
        "momentum": momentum, "novelty": novelty, "gap_factor": gap_factor,
        "gap_rate": gap_rate_a + gap_rate_b if have_rates else None,
        "gap_score": p_link * momentum * novelty * gap_factor,
    }


def build_gaps(
    works: Sequence[Work], year: int, predictor: Predictor, *, n_min: int, pool: int, limit: int,
    labels: dict[str, str] | None = None, gap_rates: dict[str, float] | None = None,
    stoplist: frozenset[str] | None = None,
) -> tuple[dict, dict]:
    """Ranked gaps at ``year`` (``GapListResponse``) and the context needed for gap details.

    ``stoplist`` (default None: off) drops pool candidates where either concept is in it, BEFORE the
    top-``limit`` cut, so the list is still filled from the pool. gaps then carry a ``stoplist`` record.

    The ranking is over the ``pool`` eligible pairs with the highest p_link (the full universe
    can be ~12M pairs), sorted by gap score then p_link then pair order.
    """
    visible = visible_works(works, year)
    snap = build_snapshot(visible, year)
    series = concept_series(visible, year)
    pairs, prob = predictor(visible, year)
    names = pairs.names
    adj = _linked_adjacency(snap, names)
    top = np.argsort(-prob, kind="stable")[:pool]
    items = []
    hidden = 0
    for k in top:
        i, j = int(pairs.i[k]), int(pairs.j[k])
        a, b = names[i], names[j]
        if stoplist and (a in stoplist or b in stoplist):
            hidden += 1
            continue
        ga, gb = growth(series.get(a, {}), year), growth(series.get(b, {}), year)
        union = int((adj[i] | adj[j]).sum())
        overlap = int((adj[i] & adj[j]).sum()) / union if union else 0.0
        ra = gap_rates.get(a) if gap_rates else None
        rb = gap_rates.get(b) if gap_rates else None
        parts = gap_score_parts(float(prob[k]), ga, gb, overlap, None, ra, rb)
        items.append({
            "a": a, "b": b, "a_label": (labels or {}).get(a, a), "b_label": (labels or {}).get(b, b),
            "p_link": float(prob[k]), "p_lo": None, "p_hi": None,
            "momentum": parts["momentum"], "novelty": parts["novelty"], "gap_rate": parts["gap_rate"],
            "gap_score": parts["gap_score"], "starting_weight": int(pairs.weight[k]),
            "growth_a": ga, "growth_b": gb, "cosine": None, "neighbour_overlap": overlap,
            "gap_rate_a": ra, "gap_rate_b": rb,
            "interval_validation": {"validated": False, "interpretation": None, "coverage": None},
            "factors": {"p_link": float(prob[k]), "momentum": parts["momentum"], "novelty": parts["novelty"],
                        "gap_factor": parts["gap_factor"]},
        })
    items.sort(key=lambda r: (-r["gap_score"], -r["p_link"], r["a"], r["b"]))
    items = items[:limit]
    for rank, row in enumerate(items, 1):
        row["rank"] = rank
    omitted = ["cosine (no embeddings yet)"]
    if not gap_rates:
        omitted.append("gap_rate (open problems not mined)")
    gaps = {
        "placeholder": False, "year": year, "items": items, "note": GAP_NOTE,
        "formula_used": gap_formula(bool(gap_rates)), "omitted_components": omitted,
        "ranking_pool": f"top {pool} eligible pairs by p_link",
    }
    if stoplist:
        gaps["stoplist"] = stoplist_record(stoplist, hidden)
    return gaps, {"visible": visible, "adj": adj, "names": names}


def stoplist_record(stoplist: frozenset[str], hidden: int) -> dict:
    return {"applied": True, "phrases": sorted(stoplist), "hidden_candidates": hidden,
            "note": STOPLIST_NOTE.format(n=len(stoplist))}


def gap_formula(has_gap_rates: bool) -> str:
    base = "p_link * sigmoid(growth_a + growth_b) * (1 - neighbour_overlap)"
    return base + (" * (1 + gap_rate_a + gap_rate_b)" if has_gap_rates else "")


def build_gap_detail(item: dict, context: dict, year: int, papers: int = 5) -> dict:
    """``GapDetail``: breakdown, shared linked neighbours, supporting papers by id and link only.

    Supporting papers contain the concept and at least one shared neighbour (most shared first,
    then newest); they are not embedding-closest papers. Open problems are not mined: empty.
    """
    names, adj, visible = context["names"], context["adj"], context["visible"]
    index = {n: k for k, n in enumerate(names)}
    shared = [names[k] for k in np.flatnonzero(adj[index[item["a"]]] & adj[index[item["b"]]])]
    shared_set = set(shared)

    def closest(concept: str) -> list[dict]:
        scored = []
        for w in visible:
            cs = set(w.concepts)
            if concept in cs and cs & shared_set:
                scored.append((-len(cs & shared_set), -w.date.toordinal(), w.id, w))
        scored.sort(key=lambda t: t[:3])
        return [paper_ref(t[3]) for t in scored[:papers]]

    return {
        "summary": item, "closest_a": closest(item["a"]), "closest_b": closest(item["b"]),
        "shared_neighbours": [{"id": n, "label": n} for n in shared], "open_problems": [],
        "year": year,
    }


def build_concept(visible: Sequence[Work], year: int, name: str, adj_names: Sequence[str],
                  adj: np.ndarray, top_papers: int = 5) -> dict:
    """``ConceptResponse`` at ``year``: counts by year, latest papers (id and link), linked neighbours."""
    series = concept_series(visible, year).get(name, {})
    latest = sorted((w for w in visible if name in w.concepts), key=lambda w: (-w.date.toordinal(), w.id))
    k = list(adj_names).index(name) if name in adj_names else None
    neighbours = [{"id": adj_names[n], "label": adj_names[n]} for n in np.flatnonzero(adj[k])] if k is not None else []
    return {
        "placeholder": False,
        "counts_by_year": [{"year": y, "count": c} for y, c in sorted(series.items())],
        "forecast": None, "top_papers": [paper_ref(w) for w in latest[:top_papers]],
        "open_problems": [], "neighbours": neighbours,
    }


def headline_from_backtest(backtest: dict | None) -> dict:
    """Headline numbers copied from a real ``run_backtest`` metrics dict; null for everything else.

    Uses the latest test origin that has a defined paired difference. Nothing is computed here.
    """
    out: dict = dict.fromkeys(HEADLINE_KEYS)
    if not backtest or not isinstance(backtest.get("test"), dict):
        return out
    manifest = backtest.get("manifest")
    label = manifest.get("data_label") if isinstance(manifest, dict) else None
    out["backtest_data_label"] = label if label in DATA_LABELS else "unlabelled"
    if not is_real_run(manifest):  # synthetic, unlabelled, dry-run or missing manifest: numbers stay null
        return out
    for origin in sorted(backtest["test"], key=int, reverse=True):
        head = backtest["test"][origin].get("headline", {})
        diff = head.get("paired_difference")
        if not diff:
            continue
        out.update(test_origin=int(origin), verdict=head.get("verdict"), best_baseline=head.get("best_baseline"))
        for key, short in (("average_precision", "average_precision"), ("precision_at_100", "precision_at_100")):
            d = diff.get(key, {})
            out[f"{short}_difference"] = d.get("observed")
            out[f"{short}_ci_low"] = d.get("ci_low")
            out[f"{short}_ci_high"] = d.get("ci_high")
        break
    return out


# ------------------------------------------------------------------ whole export

def build_export(
    works: Iterable[Work], years: Sequence[int], predictor: Predictor, *,
    n_min: int = MIN_PAPERS, edge_threshold: float = 0.5, max_edges: int = 500,
    gap_pool: int = 2000, gap_limit: int = 50, detail_limit: int = 20,
    backtest: dict | None = None, labels: dict[str, str] | None = None,
    gap_rates: dict[str, float] | None = None,
) -> dict[str, dict]:
    """All export files as ``{filename: json-safe dict}`` for the given snapshot ``years``.

    Files: ``map-<year>.json`` per year, ``gaps.json``, ``gap-details.json`` (keyed ``"a|b"``),
    ``concepts.json`` (keyed by concept id, final year) and ``meta.json``. Gaps, details and
    concepts describe the final year. ``backtest`` is a real metrics dict or None.
    """
    works = list(works)
    years = sorted(set(years))
    final = years[-1]
    final_visible = visible_works(works, final)
    final_snap = build_snapshot(final_visible, final)
    names = vocabulary(final_snap, n_min)
    xy = compute_layout(final_snap, names)
    layout = {n: (float(xy[k, 0]), float(xy[k, 1])) for k, n in enumerate(names)}

    files: dict[str, dict] = {}
    for y in years:
        files[f"map-{y}.json"] = build_map(works, y, layout, final, predictor, n_min=n_min,
                                           edge_threshold=edge_threshold, max_edges=max_edges, labels=labels)
    gaps, ctx = build_gaps(works, final, predictor, n_min=n_min, pool=gap_pool, limit=gap_limit,
                           labels=labels, gap_rates=gap_rates)
    files["gaps.json"] = gaps
    files["gap-details.json"] = {
        f"{it['a']}|{it['b']}": build_gap_detail(it, ctx, final) for it in gaps["items"][:detail_limit]
    }
    files["concepts.json"] = {
        n: build_concept(final_visible, final, n, ctx["names"], ctx["adj"]) for n in names
    }
    headline = headline_from_backtest(backtest)
    files["meta.json"] = {
        "placeholder": False,
        "year_range": {"min": years[0], "max": final},
        "counts": {
            "works": len(final_visible), "concepts": len(names), "map_years": len(years),
            "predicted_edges_final_year": len(files[f"map-{final}.json"]["edges"]),
            "ranked_gaps": len(gaps["items"]),
        },
        "headline_metrics": headline,
        "gap_score": {
            "formula_used": gaps["formula_used"], "formula_full": GAP_FORMULA_FULL,
            "omitted_components": gaps["omitted_components"], "note": GAP_NOTE,
        },
        "layout": {"method": "truncated SVD of positive-PMI co-occurrence matrix", "layout_year": final,
                   "note": LAYOUT_NOTE},
        "backtest_available": bool(backtest) and is_real_run(backtest.get("manifest")),
        "backtest_data_label": headline["backtest_data_label"],
    }
    return clean(files)


def write_export(out_dir: str | Path, files: dict[str, dict]) -> list[Path]:
    """Write each file as UTF-8 JSON (NaN is rejected, not written)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, payload in sorted(files.items()):
        path = out / name
        path.write_text(json.dumps(payload, indent=2, sort_keys=True, allow_nan=False), encoding="utf-8")
        paths.append(path)
    return paths
