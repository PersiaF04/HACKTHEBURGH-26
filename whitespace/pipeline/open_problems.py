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
    for s in split_sentences(abstract):
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
    key = lambda h: (-h["confidence"], not h["sentence_level"], -h["paper"]["year"], h["paper"]["id"] or "")  # noqa: E731
    return {c: sorted(v, key=key)[:per_concept] for c, v in by_c.items()}


def label_frame(hits: list[dict], n: int = 100, seed: int = 270) -> list[dict]:
    """A reproducible random sample of hits for a human to label (precision of the extractor)."""
    rng = random.Random(seed)
    sample = rng.sample(hits, min(n, len(hits)))
    return [{"i": i, "type": h["type"], "confidence": h["confidence"], "paper_id": h["paper"]["id"],
             "year": h["paper"]["year"], "sentence": h["sentence"], "correct": ""} for i, h in enumerate(sample)]


# ------------------------------------------------------------------ command line


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Extract author-stated open problems from the corpus (cache only).")
    ap.add_argument("corpus", type=Path, help="corpus.jsonl")
    ap.add_argument("--vocabulary", type=Path, required=True, help="JSON list of phrase concepts to attach hits to")
    ap.add_argument("--out", type=Path, required=True, help="cache directory (keep it outside Git)")
    ap.add_argument("--workers", type=int, default=14)
    a = ap.parse_args(argv)
    vocab = json.loads(a.vocabulary.read_text(encoding="utf-8"))
    res = run_corpus(a.corpus, vocab, workers=a.workers)
    a.out.mkdir(parents=True, exist_ok=True)
    with open(a.out / "hits.jsonl", "w", encoding="utf-8") as fh:
        for h in res["hits"]:
            fh.write(json.dumps(h, ensure_ascii=False) + "\n")
    counts = [[c, y, res["papers"][(c, y)], res["with_hit"][(c, y)]] for (c, y) in sorted(res["papers"])]
    (a.out / "counts.json").write_text(json.dumps({"columns": ["concept", "year", "papers", "with_open_problem"],
                                                   "rows": counts}), encoding="utf-8")
    (a.out / "label_frame.json").write_text(json.dumps(label_frame(res["hits"]), ensure_ascii=False, indent=1),
                                            encoding="utf-8")
    print(f"hits {len(res['hits']):,}  by type {dict(Counter(h['type'] for h in res['hits']))}  "
          f"{res['seconds']:.0f}s  -> {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
