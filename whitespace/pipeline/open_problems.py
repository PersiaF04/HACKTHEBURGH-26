"""Author-stated open problems from abstracts (issue #270, PRD F5/F6, section 13).

One streaming pass over the corpus: split each abstract into sentences, keep the sentences that match a
conservative regex prefilter (future work, remains unclear/open/unexplored, has not been studied, little is
known, limitation, open problem/question, we leave ...), classify each as ``future_work``, ``limitation`` or
``open_problem`` with a rough confidence, and attach it to the target phrase concepts it mentions.

Honesty rules
-------------
* A sentence is quoted whole or not at all (never truncated): sentences longer than ``MAX_SENTENCE`` are dropped.
* The classification is a regex heuristic. Its precision has NOT been measured until a human hand-labels a
  sample (``label_frame``); until then every consumer must say "extraction quality unmeasured".
* ``gap_rate`` (the share of a concept's papers with a stated open problem) is for DISPLAY only. It must not feed
  the scored gap model or the backtest, so the frozen test stays valid.
* Pure functions here; the corpus pass reads one file and writes a cache outside Git. No network, no keys.
"""
from __future__ import annotations

import json
import multiprocessing as mp
import random
import re
import time
from collections import Counter, defaultdict
from collections.abc import Iterable, Iterator
from pathlib import Path

from .concepts import extract_phrases

MIN_SENTENCE, MAX_SENTENCE = 40, 400  # characters; a quote outside this range is not kept
TYPES = ("open_problem", "future_work", "limitation")

_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\[\"'])")
_ABBREV_END = re.compile(r"(?:\b(?:e\.g|i\.e|et al|vs|etc|fig|eq|no|approx|cf)\.|\b[A-Z]\.)$")

# (type, confidence, pattern): checked in this order, the first match decides the type.
_RULES: tuple[tuple[str, float, re.Pattern[str]], ...] = tuple(
    (t, c, re.compile(p, re.I))
    for t, c, p in (
        ("open_problem", 0.8, r"\bopen (?:problems?|questions?|challenges?|issues?)\b"),
        ("open_problem", 0.8, r"\b(?:remains?|remained|still|yet)\s+(?:an?\s+)?(?:largely\s+|still\s+|very\s+|relatively\s+)?"
                              r"(?:unclear|open|unexplored|unknown|unresolved|understudied|poorly understood)\b|\bit is (?:still |largely )?(?:unclear|unknown)\b"),
        ("open_problem", 0.8, r"\blittle (?:is|has been) (?:known|understood|explored|studied)\b"),
        ("open_problem", 0.5, r"\b(?:has|have) (?:not|yet to) (?:yet )?been (?:studied|explored|addressed|investigated|"
                              r"examined|characteri[sz]ed|determined|established|fully understood)\b"),
        ("open_problem", 0.5, r"\bremains? (?:a |an )?(?:challenge|challenging|difficult|poorly|elusive)\b"),
        ("future_work", 0.8, r"\bfuture (?:work|research|studies|investigations?|directions?)\b"),
        ("future_work", 0.8, r"\bwe leave\b"),
        ("future_work", 0.8, r"\bleft (?:for|to) (?:future|later)\b"),
        ("future_work", 0.5, r"\bremains? to be (?:explored|investigated|addressed|studied|examined|tested|done|seen)\b"),
        ("limitation", 0.5, r"\b(?:a|one|main|key|major|important|notable|current|remaining|primary) limitations?\b"
                            r"|\blimitations? (?:is|are|include[sd]?|remains?|of (?:this|our|the present|the proposed)\b)"
                            r"|\b(?:our|this|the present|the proposed)\s+\w+\s+(?:has|have) (?:some |several )?limitations?\b"),
    )
)
# "limitations of existing methods" / "overcome the limitations" talk about OTHER work, not the author's own.
_NOT_OWN_LIMIT = re.compile(
    r"\b(?:overcom\w*|address\w*|alleviat\w*|mitigat\w*|resolv\w*|remov\w*|bypass\w*|beyond|without|"
    r"circumvent\w*|surpass\w*|tackl\w*)\b(?:\s+\w+){0,4}?\s+limitations?\b"
    r"|\blimitations?\s+of\s+(?:the\s+)?(?:existing|previous|current|prior|traditional|conventional|state)\b"
    r"|\b(?:existing|previous|current|prior|traditional|conventional)\s+\w*\s*limitations?\b",
    re.I,
)
_NOT_A_GAP = re.compile(r"\b(?:can|could|may|might) (?:also )?be (?:used|useful|applied|reused|built on)\b[^.]*\bfuture\b"
                        r"|\bfuture (?:work|research|studies)\b[^.]*\b(?:is|are) (?:planned|presented)\b"
                        r"|\bchallenges and limitations\b", re.I)
_HEDGE_ONLY = re.compile(r"\b(?:no|without any|not a|not an)\s+(?:open|limitations?)\b", re.I)


def split_sentences(text: str) -> list[str]:
    """Crude sentence split on end punctuation followed by a capital; merges splits after common abbreviations."""
    out: list[str] = []
    for part in _SPLIT.split(" ".join(text.split())):
        if out and _ABBREV_END.search(out[-1]):
            out[-1] = f"{out[-1]} {part}"
        else:
            out.append(part)
    return out


def classify(sentence: str) -> tuple[str, float] | None:
    """``(type, confidence)`` for an author-stated open problem sentence, or None. Conservative by design."""
    if not MIN_SENTENCE <= len(sentence) <= MAX_SENTENCE:
        return None
    if _HEDGE_ONLY.search(sentence) or _NOT_A_GAP.search(sentence):
        return None
    for kind, conf, pat in _RULES:
        if pat.search(sentence):
            if kind == "limitation" and _NOT_OWN_LIMIT.search(sentence):
                return None
            return kind, conf
    return None


def hits_in(abstract: str) -> list[tuple[str, str, float]]:
    """``(sentence, type, confidence)`` for each matching sentence of one abstract."""
    found = []
    whole = " ".join(abstract.split())
    for s in split_sentences(abstract):
        if s == whole:  # a one-sentence abstract would be the whole abstract: never quote it
            continue
        c = classify(s)
        if c:
            found.append((s, c[0], c[1]))
    return found


# ------------------------------------------------------------------ corpus pass

_VOCAB: frozenset[str] = frozenset()


def _init(vocab: frozenset[str]) -> None:
    global _VOCAB
    _VOCAB = vocab


def process_line(line: str, vocab: frozenset[str]) -> tuple[dict, list[dict]] | None:
    """Per-paper result: ``({id, year, concepts, has_hit}, hits)``; None for an unusable record."""
    try:
        rec = json.loads(line)
    except ValueError:
        return None
    abstract, year = rec.get("abstract") or "", rec.get("year")
    if not isinstance(year, int) or not abstract:
        return None
    title = rec.get("title") or ""
    concepts = sorted(extract_phrases(f"{title}. {abstract}") & vocab) if vocab else []
    hits = []
    for sentence, kind, conf in hits_in(abstract):
        own = sorted(extract_phrases(sentence) & vocab) if vocab else []
        hits.append({
            "sentence": sentence, "type": kind, "confidence": conf,
            "paper": {"id": rec.get("id"), "title": title[:300], "year": year},
            "concept_ids": own or concepts,  # sentence-level concepts first, else the paper's own
            "sentence_level": bool(own),
        })
    return {"id": rec.get("id"), "year": year, "concepts": concepts, "has_hit": bool(hits)}, hits


def _work(lines: list[str]) -> tuple[Counter, Counter, list[dict]]:
    papers: Counter = Counter()  # (concept, year) -> papers mentioning the concept
    with_hit: Counter = Counter()  # (concept, year) -> of those, papers with a stated open problem
    hits: list[dict] = []
    for line in lines:
        r = process_line(line, _VOCAB)
        if r is None:
            continue
        meta, h = r
        papers[("", meta["year"])] += 1
        if meta["has_hit"]:
            with_hit[("", meta["year"])] += 1
        for c in meta["concepts"]:
            papers[(c, meta["year"])] += 1
            if meta["has_hit"]:
                with_hit[(c, meta["year"])] += 1
        hits.extend(h)
    return papers, with_hit, hits


def _chunks(path: Path, size: int) -> Iterator[list[str]]:
    buf: list[str] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            buf.append(line)
            if len(buf) >= size:
                yield buf
                buf = []
    if buf:
        yield buf


def run_corpus(corpus: Path, vocab: Iterable[str], workers: int = 14, chunk: int = 2000) -> dict:
    """One pass over ``corpus.jsonl``. Returns counts per (concept, year) and every hit (with concept ids)."""
    t0 = time.time()
    papers: Counter = Counter()
    with_hit: Counter = Counter()
    hits: list[dict] = []
    n = 0
    with mp.Pool(workers, initializer=_init, initargs=(frozenset(vocab),)) as pool:
        for p, w, h in pool.imap_unordered(_work, _chunks(corpus, chunk)):
            papers.update(p)
            with_hit.update(w)
            hits.extend(h)
            n += 1
            if n % 50 == 0:
                print(f"  {n * chunk:,} lines, {len(hits):,} hits, {time.time() - t0:.0f}s", flush=True)
    return {"papers": papers, "with_hit": with_hit, "hits": hits, "seconds": time.time() - t0}


def rates(papers: Counter, with_hit: Counter, concept: str = "") -> list[dict]:
    """Per-year share of papers with a stated open problem (``concept=""``: all papers). DISPLAY ONLY."""
    years = sorted({y for (c, y) in papers if c == concept})
    return [{"year": y, "papers": papers[(concept, y)], "with_open_problem": with_hit[(concept, y)],
             "gap_rate": round(with_hit[(concept, y)] / papers[(concept, y)], 6)} for y in years]


def select_for_concepts(hits: list[dict], concept_ids: Iterable[str], per_concept: int = 5) -> dict[str, list[dict]]:
    """Up to ``per_concept`` hits per concept: highest confidence first, sentence-level first, newest first."""
    wanted = set(concept_ids)
    by_c: dict[str, list[dict]] = defaultdict(list)
    for h in hits:
        for c in h["concept_ids"]:
            if c in wanted:
                by_c[c].append(h)
    key = lambda h: (-h["confidence"], not h["sentence_level"], -h["paper"]["year"], h["paper"]["id"] or "", h["sentence"])  # noqa: E731
    return {c: sorted(v, key=key)[:per_concept] for c, v in by_c.items()}


def label_frame(hits: list[dict], n: int = 100, seed: int = 270, stratify: bool = True) -> list[dict]:
    """A reproducible sample of hits for a human or AI reviewer to label (precision of the extractor).

    Stratified by type (as equal as the data allows: 34/33/33 for n=100) so every type gets a measurable sample;
    a type with fewer hits than its quota gives what it has and the rest goes to the other types.
    """
    rng = random.Random(seed)
    if not stratify:
        picked = rng.sample(hits, min(n, len(hits)))
    else:
        pools = {t: [h for h in hits if h["type"] == t] for t in TYPES}
        quota = {t: n // len(TYPES) + (1 if k < n % len(TYPES) else 0) for k, t in enumerate(("open_problem", "future_work", "limitation"))}
        take = {t: min(quota[t], len(pools[t])) for t in TYPES}
        spare = n - sum(take.values())
        for t in TYPES:
            extra = min(spare, len(pools[t]) - take[t])
            take[t] += extra
            spare -= extra
        picked = [h for t in TYPES for h in rng.sample(pools[t], take[t])]
        rng.shuffle(picked)
    return [{"i": i + 1, "type": h["type"], "confidence": h["confidence"], "paper_id": h["paper"]["id"],
             "year": h["paper"]["year"], "title": h["paper"].get("title") or "", "url": h["paper"]["id"],
             "sentence": h["sentence"]} for i, h in enumerate(picked)]


def wilson(k: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    """95% Wilson score interval for k correct out of n."""
    if n == 0:
        return 0.0, 1.0
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return max(0.0, centre - half), min(1.0, centre + half)


def label_stats(frame: list[dict], labels: dict, who: str = "AI") -> dict:
    """Precision of the extractor from a labelled frame. ``labels`` = {"correct": [i..], "incorrect": [i..], "unsure": [i..]}.

    Unsure and unlabelled items count as NOT correct (the conservative reading), so ``X/N`` never overstates.
    """
    ids = {f["i"] for f in frame}
    right = set(labels.get("correct", [])) & ids
    n = len(frame)

    def part(items: list[dict]) -> dict:
        k = sum(1 for f in items if f["i"] in right)
        lo, hi = wilson(k, len(items))
        return {"correct": k, "n": len(items), "precision": round(k / len(items), 4) if items else None,
                "ci95": [round(lo, 4), round(hi, 4)]}

    out = {"overall": part(frame), "by_type": {t: part([f for f in frame if f["type"] == t]) for t in TYPES},
           "unsure": len(set(labels.get("unsure", [])) & ids), "labeller": who}
    k = out["overall"]["correct"]
    out["wording"] = f"{who}-labelled precision {k}/{n} (not human-validated)" if who == "AI" else \
        f"Human-labelled precision {k}/{n}"
    return out


# ------------------------------------------------------------------ export (reduced version)

TOP_CONCEPTS, PER_CONCEPT, PER_GAP, MAX_ITEMS = 200, 5, 5, 1200
QUALITY_NOTE = ("Extraction quality is unmeasured: sentences were picked by a regex prefilter and have not been "
                "hand-labelled, so some are not real author-stated open problems.")
ATTRIBUTION = ("Short excerpts quoted from abstracts indexed by OpenAlex; copyright remains with the "
               "publishers/authors. OpenAlex metadata is CC0. No full abstracts are included.")


def load_cache(cache_dir: Path) -> tuple[list[dict], dict]:
    """``(hits, papers_counter_inputs)`` written by ``main``: every hit and the (concept, year) counts."""
    hits = [json.loads(line) for line in (cache_dir / "hits.jsonl").read_text(encoding="utf-8").splitlines() if line]
    hits.sort(key=lambda h: (h["paper"]["id"] or "", h["sentence"]))  # the pass writes hits in worker order
    doc = json.loads((cache_dir / "counts.json").read_text(encoding="utf-8"))
    return hits, {(c, y): (n, w) for c, y, n, w in doc["rows"]}


def _item(h: dict, url, keep: set[str]) -> dict:
    p = h["paper"]
    return {"sentence": h["sentence"], "type": h["type"], "confidence": h["confidence"],
            "paper": {"id": p["id"], "title": p.get("title") or p["id"], "year": p["year"], "url": url(p["id"])},
            "concept_ids": [c for c in h["concept_ids"] if c in keep]}


def build_export(hits: list[dict], counts: dict, gap_pairs: list[tuple[str, str]], concept_pool: list[str],
                 url, final_year: int, exclude: frozenset[str] = frozenset()) -> dict:
    """Reduced open-problems payloads: ``gap_details`` {a|b: items}, ``concepts`` {id: items}, ``file`` (open-problems.json).

    ``concept_pool`` are the concepts that exist in the export; the top ``TOP_CONCEPTS`` of them by papers in the
    last year plus every gap concept get sentences. Rates are display only and never feed the gap score.
    """
    pool = set(concept_pool)
    gap_concepts = {c for pair in gap_pairs for c in pair} & pool
    by_papers = sorted(pool - exclude, key=lambda c: (-counts.get((c, final_year), (0, 0))[0], c))
    chosen = set(by_papers[:TOP_CONCEPTS]) | gap_concepts
    keep = chosen | pool  # item concept ids stay within concepts that exist in the export
    per = select_for_concepts(hits, chosen, per_concept=PER_CONCEPT)
    gap_details: dict[str, list[dict]] = {}
    for a, b in gap_pairs:
        merged = {id(h): h for c in (a, b) for h in select_for_concepts(hits, {c}, 50).get(c, [])}.values()
        both = lambda h: -(a in h["concept_ids"] and b in h["concept_ids"])  # noqa: E731
        ranked = sorted(merged, key=lambda h: (both(h), -h["confidence"], not h["sentence_level"], -h["paper"]["year"],
                                               h["paper"]["id"] or "", h["sentence"]))
        gap_details[f"{a}|{b}"] = [_item(h, url, keep) for h in ranked[:PER_GAP]]
    concepts = {c: [_item(h, url, keep) for h in v] for c, v in per.items()}
    seen, items = set(), []
    for src in (list(gap_details.values()), list(concepts.values())):
        for lst in src:
            for it in lst:
                key = (it["paper"]["id"], it["sentence"])
                if key not in seen and len(items) < MAX_ITEMS:
                    seen.add(key)
                    items.append(it)
    rate_years = sorted({y for (c, y) in counts if c == "" and y <= final_year})
    rates_by_year = [{"year": y, "concept_rate": None,
                      "ai_ml_rate": round(counts[("", y)][1] / counts[("", y)][0], 6)} for y in rate_years]
    rates_by_concept = {c: [{"year": y, "papers": counts[(c, y)][0], "with_open_problem": counts[(c, y)][1],
                             "rate": round(counts[(c, y)][1] / counts[(c, y)][0], 6)}
                            for y in rate_years if (c, y) in counts and counts[(c, y)][0]]
                        for c in sorted(chosen)}
    return {
        "gap_details": gap_details, "concepts": concepts, "gap_rates": rates_by_concept,
        "file": {"placeholder": False, "synthetic": False, "items": items,
                 "concept_options": [{"id": c, "label": c} for c in sorted(chosen) if c in per],
                 "rates_by_year": rates_by_year, "rates_by_concept": rates_by_concept,
                 "quality": "unmeasured", "note": QUALITY_NOTE, "attribution": ATTRIBUTION,
                 "rate_note": "ai_ml_rate is the share of all corpus papers with a stated open problem; "
                              "concept_rate is not exported (see rates_by_concept). Display only: not used in any "
                              "gap score or backtest."},
    }


# ------------------------------------------------------------------ attach to an existing export


class AttachError(RuntimeError):
    """The export folder cannot take open problems, or the result does not validate."""


def _sha256(path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _tool_commit() -> str | None:
    import subprocess

    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True,
                             cwd=Path(__file__).parent)
        return out.stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def attach(export_dir: Path, cache_dir: Path, out_dir: Path | None = None, *, frame: Path | None = None,
           labels: Path | None = None, labeller: str = "AI") -> dict:
    """Add open problems to an already exported folder (the same selection as ``export_all --open-problems``).

    Reads gaps/concepts/gap-details/meta/manifest/routes, runs ``export_all.attach_open_problems`` (no second
    copy of the selection logic), rewrites the changed files, recomputes their sha256 in the manifest, records the
    step under ``manifest.export.open_problems`` and validates the result. Raises ``AttachError`` if it is invalid.
    """
    import shutil

    from . import export_all as E  # imported here: export_all imports this module

    export_dir = Path(export_dir)
    if out_dir is not None and Path(out_dir).resolve() != export_dir.resolve():
        shutil.copytree(export_dir, out_dir, dirs_exist_ok=True)
        export_dir = Path(out_dir)
    names = ("gaps.json", "concepts.json", "gap-details.json", "open-problems.json", "meta.json", "routes.json",
             "manifest.json")
    missing = [n for n in names if not (export_dir / n).is_file()]
    if missing:
        raise AttachError(f"not an export folder, missing {missing}")
    files = {n: json.loads((export_dir / n).read_text(encoding="utf-8")) for n in names}
    if files["meta.json"].get("placeholder") or files["gaps.json"].get("placeholder"):
        raise AttachError("the export is a placeholder/synthetic export; refusing to attach quotes")
    final = files["meta.json"]["year_range"]["max"]
    info = E.attach_open_problems(files, Path(cache_dir), final)
    info.update({"post_process": "open_problems attach", "tool_commit": _tool_commit(),
                 "cache_sha256": {n: _sha256(Path(cache_dir) / n) for n in ("hits.jsonl", "counts.json")}})
    files["open-problems.json"]["data_label"] = files["gaps.json"].get("data_label")
    quality, note, measured = "unmeasured", QUALITY_NOTE, None
    if labels is not None:
        if frame is None:
            raise AttachError("--labels needs --frame (the label frame the labels refer to)")
        measured = label_stats(json.loads(Path(frame).read_text(encoding="utf-8")),
                               json.loads(Path(labels).read_text(encoding="utf-8")), labeller)
        o = measured["overall"]
        quality = "ai_labelled" if labeller == "AI" else "human_labelled"
        note = (f"{measured['wording']}: {o['correct']} of {o['n']} sampled sentences judged to be a real author-stated open "
                f"problem, future work or limitation (95% interval {o['ci95'][0]:.2f} to {o['ci95'][1]:.2f}). "
                "The sample is stratified by type; the rest of the corpus was not labelled.")
        files["open-problems.json"]["quality_measurement"] = measured
        info["quality_measurement"] = measured["wording"]
    files["open-problems.json"]["quality"] = quality
    files["open-problems.json"]["note"] = note
    files["meta.json"]["open_problems"] = {"quality": quality, "items": info["items"], "attribution": ATTRIBUTION,
                                           "note": note}
    for r in files["routes.json"]["routes"]:
        if r["file"] == "open-problems.json":
            r["status"] = "real"
            r["note"] = "query ignored here; the client filters. Reduced first version (top gaps and concepts)."
    changed = ("concepts.json", "gap-details.json", "open-problems.json", "meta.json", "routes.json")
    for n in changed:
        E.write_payload(export_dir, n, files[n], synthetic=False)
    man = files["manifest.json"]
    for n in changed:
        man.setdefault("files", {})[n] = _sha256(export_dir / n)
    man.setdefault("export", {})["open_problems"] = info
    E.write_json(export_dir / "manifest.json", man)
    problems = E.validate_export(export_dir)
    if problems:
        raise AttachError("the result does not validate: " + "; ".join(problems[:5]))
    return {"out": str(export_dir), "items": info["items"],
            "sizes": {n: (export_dir / n).stat().st_size for n in changed}, "problems": problems}


# ------------------------------------------------------------------ command line


def _by_key(hits: list[dict]) -> list[dict]:
    return sorted(hits, key=lambda h: (h["paper"]["id"] or "", h["sentence"]))


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(description="Open problems: extract from the corpus (cache only), or attach to an export.")
    sub = ap.add_subparsers(dest="cmd")
    ex = sub.add_parser("extract", help="one pass over corpus.jsonl; writes hits.jsonl, counts.json, label_frame.json")
    ex.add_argument("corpus", type=Path, help="corpus.jsonl")
    ex.add_argument("--vocabulary", type=Path, required=True, help="JSON list of phrase concepts to attach hits to")
    ex.add_argument("--out", type=Path, required=True, help="cache directory (keep it outside Git)")
    ex.add_argument("--workers", type=int, default=14)
    at = sub.add_parser("attach", help="add open problems to an already exported folder, then validate it")
    at.add_argument("--export-dir", type=Path, required=True)
    at.add_argument("--cache", type=Path, required=True, help="the extract cache directory")
    at.add_argument("--out", type=Path, help="write to a copy of the export instead of in place")
    at.add_argument("--frame", type=Path, help="label_frame.json the labels refer to")
    at.add_argument("--labels", type=Path, help='JSON {"correct": [i..], "incorrect": [i..], "unsure": [i..]}')
    at.add_argument("--labeller", choices=("AI", "human"), default="AI")
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] not in ("extract", "attach", "-h", "--help"):
        argv = ["extract", *argv]  # the first version took the corpus path directly
    a = ap.parse_args(argv)
    if a.cmd == "attach":
        try:
            res = attach(a.export_dir, a.cache, a.out, frame=a.frame, labels=a.labels, labeller=a.labeller)
        except AttachError as exc:
            print(f"attach failed: {exc}", file=sys.stderr)
            return 1
        print(f"open problems attached: {res['items']} items -> {res['out']}; validation OK")
        for n, size in sorted(res["sizes"].items()):
            print(f"  {n}: {size / 1024:.0f} KB")
        return 0
    if a.cmd != "extract":
        ap.print_help()
        return 2
    vocab = json.loads(a.vocabulary.read_text(encoding="utf-8"))
    res = run_corpus(a.corpus, vocab, workers=a.workers)
    hits = _by_key(res["hits"])
    a.out.mkdir(parents=True, exist_ok=True)
    with open(a.out / "hits.jsonl", "w", encoding="utf-8") as fh:
        for h in hits:
            fh.write(json.dumps(h, ensure_ascii=False) + "\n")
    counts = [[c, y, res["papers"][(c, y)], res["with_hit"][(c, y)]] for (c, y) in sorted(res["papers"])]
    (a.out / "counts.json").write_text(json.dumps({"columns": ["concept", "year", "papers", "with_open_problem"],
                                                   "rows": counts}), encoding="utf-8")
    (a.out / "label_frame.json").write_text(json.dumps(label_frame(hits), ensure_ascii=False, indent=1),
                                            encoding="utf-8")
    print(f"hits {len(hits):,}  by type {dict(Counter(h['type'] for h in hits))}  {res['seconds']:.0f}s  -> {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
