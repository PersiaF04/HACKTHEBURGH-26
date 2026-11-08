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

## Shared rules

- **Origin.** `T` is a calendar year. The snapshot holds works dated on or before 31 December `T`. The outcome window is `T+1` to `T+3`, inclusive.
- **Link.** A pair is linked once it co-occurs in at least three works. Pairs with weight 0, 1 or 2 at `T` are eligible. A pair is a positive if it reaches weight 3 by the end of `T+3`.
- **Paper date.** The arXiv-id month when the paper has one; OpenAlex `publication_date` is not trusted for records merged with a journal version.
- **Purge.** `max(fit) + 3 <= min(calibration)` and `max(calibration) + 3 <= min(test)`. With a first test origin of 2020, calibrate on 2017 and fit through 2014. `assert_purged` enforces this.
- **Population.** Primary metrics use the full eligible pair universe, for the model and every baseline alike, reported separately for starting weights 0, 1 and 2.
- **Baselines.** Current weight, degree product, preferential attachment, common neighbours, Adamic-Adar and Jaccard score the same pairs with the same tie-breaking.
- **Code coverage.** A missing Papers with Code link means no linked code in that archive, never that no code exists.

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

## Local code join (`pipeline/code_join_local.py`, issue #173)

Joins the ingest `corpus.jsonl` to the pinned Papers with Code links file by versionless arXiv id, with **no API calls**. The corpus is streamed; the links file is read from a local `.parquet` (needs `pyarrow`) or `.csv`. Papers with no usable arXiv id get join method `unmatchable_by_construction`.

```sh
python -m whitespace.pipeline.code_join_local --corpus corpus.jsonl --links links.parquet --revision <dataset-sha> --out <dir outside Git>
```

Writes `papers.csv` (per work: `has_linked_code`, `has_official_code`, `match_key`, `join_method`, `date_source`, topic), `coverage.json` (`code_layer.coverage_table`), `report.json` (counts: works with an arXiv id by year, archive ids present or absent in the corpus, linked papers by year) and `handcheck_frame.csv` (seeded 100 matched pairs, stratified by year band, official or not, own or merged record; title and the arXiv abstract link; no abstracts). Archive ids missing from the corpus are expected: the corpus is one OpenAlex subfield. `join_method` comes from the corpus field `arxiv_id_source` (`doi`/`both` = own arXiv-DOI record, `location` = merged record found through a location URL); an older corpus without the field gives `unknown_source`. **First author is not in the frame** (the download did not select authorships and re-fetching is out of budget); the column `arxiv_abs_url` replaces it so the checker reads authors on the arXiv abstract page.

## OpenAlex ingest (`pipeline/ingest.py`, issue #147)

```sh
python -m whitespace.pipeline.ingest plan                       # keyless, about 30 count requests
OPENALEX_API_KEY=... python -m whitespace.pipeline.ingest download --max-calls 9000
python -m whitespace.pipeline.ingest build                      # corpus.jsonl + manifest.json
```

- `plan` counts works per date window (one `group_by` year call, then bisection) and prints the total and the number of list calls at 100 per page. Windows still over 10,000 after the count budget are flagged "needs cursor".
- `download` needs a free key in `OPENALEX_API_KEY` (never printed, logged, stored in a URL or the manifest). It cursor-pages each window, archives raw pages under `whitespace/artifacts/raw/` (git-ignored) with URL, time, count and sha256, and resumes: finished windows (`done.json`) are skipped, an interrupted window restarts. `--max-calls` stops the run before it is exceeded; re-run to continue. 429 and 5xx are retried with backoff.
- `build` rebuilds abstracts, drops those under 50 words, dates each paper (arXiv-id month, else OpenAlex date), de-duplicates by arXiv id and writes `corpus.jsonl` (local only, not Parquet) and `manifest.json`.
