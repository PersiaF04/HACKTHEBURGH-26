# Whitespace pipeline

Python code for the Whitespace research-discovery pipeline (spike [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122), requirements in [`PRD.md`](../PRD.md)). This folder holds **code and tests only**. It contains no data and no results: nothing here is a measured forecast, and no claim of accuracy is made until a purged backtest has been run once, after the code freeze.

## Layout

| Path | Purpose |
| --- | --- |
| `pipeline/common.py` | Shared `Work` record, arXiv-id and date rules, origin and label windows, the purge check |
| `pipeline/graphs.py`, `labels.py`, `baselines.py` | Snapshot graphs, eligible pairs, labels, baselines (issue #140) |
| `pipeline/metrics.py` | Ranking metrics and calibration (issue #141) |
| `pipeline/code_layer.py` | Papers with Code join and coverage (issue #142) |
| `tests/` | Offline tests; no network, no downloaded data |

Heavy intermediates (raw OpenAlex pages, snapshots, embeddings) stay out of Git and are referenced by checksum in an artifact manifest. Raw abstracts are never committed or published.

## Run the tests

```sh
python -m pip install -r whitespace/requirements.txt
python -m pytest -q whitespace
```

Run both commands from the repository root.

## Concepts (`pipeline/concepts.py`, issue #148)

Concepts are normalised keyword phrases of 1 to 3 words taken from title plus abstract. `build_vocabulary(docs, origin, min_papers=30)` counts **document** frequency over papers dated on or before 31 December `origin` only; `assign_concepts(text, vocabulary)` returns the sorted tuple of vocabulary phrases in a paper. `assign_concepts_flagged(..., fallback_topic=id)` returns `topic:<id>` with `used_fallback=True` only when a paper has no vocabulary phrase.

Not implemented here: the PRD's embedding-based near-duplicate merge (cosine above 0.92) and KeyBERT. Both need an embedding model and belong to a later issue; until then only deterministic normalisation (case, hyphens, plurals) merges variants. Phrases come from text rather than OpenAlex topics because topic assignments are retroactive. No claim is made about concept quality on real papers.

### Concept selection (issue #154)

`select_vocabulary(docs, origin, max_concepts=5000)` (or `select_concepts(doc_freq, n_docs, ...)` on counts from `document_frequencies`) shrinks the vocabulary to at most 5,000 concepts, using only papers dated on or before 31 December `origin`. Rules, in order: keep phrases with at least `min_papers` papers and at most 2% of all papers at T; drop phrases that begin or end with a stop word, contain a digit-only token or repeat a word; single words need 3 times `min_papers`; drop a shorter phrase when a longer one containing it has at least 90% of its document frequency ("graph neural" goes, "graph neural network" stays); rank by document frequency (times 1.2 for 2 to 3 word phrases), ties alphabetical, and keep the top `max_concepts`. All thresholds are parameters. They are untuned defaults; concept quality on real papers has not been judged.

### Streaming exact counts (issue #157)

`streaming_document_frequencies(source, origin, min_papers=30)` counts document frequency in up to three passes over `source`, a callable returning a fresh iterator of `(date, text)` (so abstracts are never all held in memory). Apriori pruning: pass 1 counts single words, pass 2 only two-word phrases whose words reached `min_papers`, pass 3 only three-word phrases whose edge words (and, when the middle word is not a stop word, both two-word parts) reached it. The result is exact for every phrase with at least `min_papers` papers; rarer phrases are absent. `select_vocabulary` uses it and accepts either such a callable (streamed) or a plain iterable (materialised first). The unpruned `document_frequencies` stays as the in-memory reference for the equivalence tests. `python -m whitespace.tests.test_streaming_counts` prints the memory and time comparison on 100,000 synthetic abstracts.

## Shared rules

- **Origin.** `T` is a calendar year. The snapshot holds works dated on or before 31 December `T`. The outcome window is `T+1` to `T+3`, inclusive.
- **Link.** A pair is linked once it co-occurs in at least three works. Pairs with weight 0, 1 or 2 at `T` are eligible. A pair is a positive if it reaches weight 3 by the end of `T+3`.
- **Paper date.** The arXiv-id month when the paper has one; OpenAlex `publication_date` is not trusted for records merged with a journal version.
- **Purge.** `max(fit) + 3 <= min(calibration)` and `max(calibration) + 3 <= min(test)`. With a first test origin of 2020, calibrate on 2017 and fit through 2014. `assert_purged` enforces this.
- **Population.** Primary metrics use the full eligible pair universe, for the model and every baseline alike, reported separately for starting weights 0, 1 and 2.
- **Baselines.** Current weight, degree product, preferential attachment, common neighbours, Adamic-Adar and Jaccard score the same pairs with the same tie-breaking.
- **Code coverage.** A missing Papers with Code link means no linked code in that archive, never that no code exists.

## OpenAlex ingest (`pipeline/ingest.py`, issue #147)

```sh
python -m whitespace.pipeline.ingest plan                       # keyless, about 30 count requests
OPENALEX_API_KEY=... python -m whitespace.pipeline.ingest download --max-calls 9000
python -m whitespace.pipeline.ingest build                      # corpus.jsonl + manifest.json
```

- `plan` counts works per date window (one `group_by` year call, then bisection) and prints the total and the number of list calls at 100 per page. Windows still over 10,000 after the count budget are flagged "needs cursor".
- `download` needs a free key in `OPENALEX_API_KEY` (never printed, logged, stored in a URL or the manifest). It cursor-pages each window, archives raw pages under `whitespace/artifacts/raw/` (git-ignored) with URL, time, count and sha256, and resumes: finished windows (`done.json`) are skipped, an interrupted window restarts. `--max-calls` stops the run before it is exceeded; re-run to continue. 429 and 5xx are retried with backoff.
- `build` rebuilds abstracts, drops those under 50 words, dates each paper (arXiv-id month, else OpenAlex date), de-duplicates by arXiv id and writes `corpus.jsonl` (local only, not Parquet) and `manifest.json`.

## Code layer (`pipeline/code_layer.py`, issue #142)

Wording rule: a paper without a link has *no linked code in this archive* (Papers with Code, snapshot 28 Jul 2025, CC-BY-SA-4.0), never "no code". Coverage is a lower bound.

- **Loader.** `load_links(path, revision)` reads a local `.parquet` (needs `pyarrow`) or `.csv` copy of Hugging Face `pwc-archive/links-between-paper-and-code` and returns rows plus a manifest (source URL, revision SHA you pass, file sha256, row counts, distinct arXiv ids, licence, attribution). It never downloads or stores the data.
- **OpenAlex join.** `openalex_filter_urls` builds batched filters (at most 50 arXiv DOIs per call). `resolve_arxiv_ids(ids, fetch)` takes an injected `fetch(url) -> dict`. A work maps to an arXiv id only through `locations` URLs or an arXiv DOI, never a journal DOI in its own `doi`. Duplicates collapse by arXiv id (most-cited wins) and the join method is recorded. `make_polite_fetcher` is the real keyless fetcher with a request budget; CI does not call it.
- **Coverage.** `coverage_table` gives per (concept, year) linked papers, all papers, `code_rate` and a state (`ok`, `thin`, `partial`, `outside_archive_vintage`); `code_rate` is null unless `ok`. The year is the arXiv-id month for new-style ids, and the OpenAlex publication date for old-style ids (`hep-th/9901001`) and papers without an arXiv id (`date_source` recorded). The low-coverage cutoff is the first year with at least `min_linked` linked papers in the pinned file (a parameter, returned in the output); years ending after the archive date (default 2025-07-28, a parameter) are `partial` and later years `outside_archive_vintage`. Old-style ids count as arXiv papers and can match; only papers with no usable arXiv id are flagged unmatchable by construction.
- **Hand-check.** `build_frame` makes the seeded stratified 100-pair frame (year band x join method x code link present); `wilson_interval(k, n)`; `TEMPLATE_COLUMNS`. The frame measures precision, not recall. Adjudication is manual.

Manual 500-id resolution check (live requests, about 10; run from the repository root with a local copy of the links file; not part of CI):

```sh
python -m whitespace.pipeline.code_layer --links path/to/links.parquet --revision <dataset-commit-sha> --mailto you@example.org --seed 20261107 --per-band 125
```

It draws 125 distinct new-style arXiv ids per year band (<=2017, 2018-2020, 2021-2023, 2024-2025), resolves them and prints resolved counts by band. Spike #122 measured 493/500 (98.6%) with its own draw; this command re-runs the procedure, and exact ids may differ if the sampling code differs. The figure is resolution only, not join correctness.

## Coverage export (`pipeline/export_coverage.py`, issue #163)

`to_coverage_response(year, coverage_table, archive_info)` returns the frontend's `CoverageResponse` (`web/src/api.ts`): concepts, per-year cells (`paper_count`, `linked_paper_count`, `code_rate`, `state`), caveat and archive info (revision, snapshot 2025-07-28, `cc-by-sa-4.0`, row count, attribution, low-coverage cutoff year). Grey years keep their counts but have `code_rate` null (`thin` before the cutoff, `outside_archive_vintage` after 2025). Cells carry "no linked code in this archive"; non-arXiv papers stay in the denominator and are flagged `unmatchable_by_construction`. Extra keys beyond the frontend type (`row_count`, `attribution`, `low_coverage_cutoff_year`, `min_linked`, per-cell flags) are additive.

`code_link_evaluation(hand_check_rows)` computes correct matches, precision, 95% Wilson interval, sample composition and protocol text from the completed 100-pair frame (`final_label`). With no table, or any row unlabelled, every field is null and `placeholder` is true.
