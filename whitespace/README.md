# Whitespace pipeline

Python code for the Whitespace research-discovery pipeline (spike [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122), requirements in [`PRD.md`](../PRD.md)). This folder holds **code and tests only**. It contains no data and no results: nothing here is a measured forecast, and the only real result is one purged backtest on the 2020 test origin (see Backtest runner below).

## Layout

| Path | Purpose |
| --- | --- |
| `pipeline/common.py` | Shared `Work` record, arXiv-id and date rules, origin and label windows, the purge check |
| `pipeline/graphs.py`, `labels.py`, `baselines.py` | Snapshot graphs, eligible pairs, labels, baselines (issue #140) |
| `pipeline/metrics.py` | Ranking metrics and calibration (issue #141) |
| `pipeline/features.py`, `model.py`, `backtest.py`, `synthetic.py` | Pair features, numpy logistic regression with Platt calibration, purged one-shot backtest runner, synthetic test corpora (issue #151) |
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

## Backtest runner and `metrics.json` (issue #151)

**Unit tests use synthetic corpora only** (`pipeline/synthetic.py`: a planted latent-topic signal, and a null version without it). They show the harness behaves; they say nothing about real literature or forecast quality.

**One real run exists.** The 2020 test origin was scored once at frozen commit SHA 93448d2; the result is recorded on spike [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122). The production model (trained through 2020 by default, see the export section) has no held-out test of its own. `p_link` is Platt-scaled and its calibration is imperfect: on the 2020 test ECE was 0.143, and the top decile was predicted at 0.53 against 0.78 observed, so read `p_link` as a ranking score first and a probability only roughly. The topic filter uses OpenAlex topic assignments made after October 2026, so topics are not as they were known at each origin year.

`backtest.run_backtest(works, BacktestConfig(fit_origins, calibration_origins, test_origins, ...))`:

1. `assert_purged` on the origins (raises `ValueError`).
2. Train on the fit origins: features from works dated on or before 31 Dec `T` only, negatives subsampled 10:1 **for training only**, L2 logistic regression by damped Newton (convergence flag and iteration count reported).
3. Fit Platt calibration on the calibration origin's full universe only; apply it unchanged at test.
4. Choose the best baseline by average precision on the calibration origin (never on test).
5. Claim the one-shot guard, then score each test origin once on its **full** eligible universe, the model and every baseline on identical pairs. A repeat for the same configuration (config plus corpus fingerprint) raises `OneShotError` unless `override_one_shot=True`, which is logged and recorded in `one_shot_override_used`. `OneShotGuard(path)` keeps the ledger on disk.

The pre-registered headline is fixed in code (`HEADLINE`): average precision on all strata, with precision@100 alongside, model minus best baseline, 95% concept-block bootstrap interval. Everything else is exploratory. The runner states the verdict plainly: `model beats best baseline`, `inconclusive`, or `no improvement`.

Shape of the returned dict (written as `metrics.json`; `<m>` is a metric block):

```text
manifest: config_hash, seed, config{...}, fit/calibration/test_origins, n_works, link_threshold,
          data_label, generator, generator_size
one_shot_override_used: bool
training: fit_origins{T: {universe, positives, train_rows}}, model_converged, model_iterations,
          platt_converged, platt_a, platt_b, coefficients{feature: value},
          negatives_per_positive, subsampling: "training only"
best_baseline: name, chosen_on, average_precision{baseline: value}
headline: metric, stratum, also
test: {"<T>": {
    eligible_universe, subsampled: false,
    strata_base_rates: {"0"|"1"|"2"|"all": {pairs, positives, base_rate}},
    model: {"0"|"1"|"2"|"all": <m>},
    baselines: {baseline: {"0"|"1"|"2"|"all": <m>}},     # same pairs as the model
    calibration: {bin_count, mean_predicted, observed_rate, brier, brier_skill, ece},
    headline: {best_baseline, paired_difference{average_precision|precision_at_100:
               {observed, ci_low, ci_high, n_boot, n_used}}, verdict} }}
<m> = {pairs, positives, base_rate, precision_at_<k>, recall_at_<k>, lift_at_<k>, k_used_<k>,
       average_precision, roc_auc}   # or {pairs, positives, undefined: reason}
```

Ranking uses the model's log-odds (Platt is monotone, so ranks are unchanged); calibration uses the Platt probabilities. Rows are permuted with a seeded permutation before ranking so exact ties (common for integer baselines) do not follow canonical pair order. Features: current weight, the six baseline scores (log1p), log paper counts, three-year paper-count growth and concept age (min/max of the two concepts). Embedding and cosine features are out of scope until the embedding model exists.

## OpenAlex ingest (`pipeline/ingest.py`, issue #147)

```sh
python -m whitespace.pipeline.ingest plan                       # keyless, about 30 count requests
OPENALEX_API_KEY=... python -m whitespace.pipeline.ingest download --max-calls 9000
python -m whitespace.pipeline.ingest build                      # corpus.jsonl + manifest.json
```

- `plan` counts works per date window (one `group_by` year call, then bisection) and prints the total and the number of list calls at 100 per page. Windows still over 10,000 after the count budget are flagged "needs cursor".
- `download` needs a free key in `OPENALEX_API_KEY` (never printed, logged, stored in a URL or the manifest). It cursor-pages each window, archives raw pages under `whitespace/artifacts/raw/` (git-ignored) with URL, time, count and sha256, and resumes: finished windows (`done.json`) are skipped, an interrupted window restarts. `--max-calls` stops the run before it is exceeded; re-run to continue. 429 and 5xx are retried with backoff.
- `build` rebuilds abstracts, drops those under 50 words, dates each paper (arXiv-id month, else OpenAlex date), de-duplicates by arXiv id and writes `corpus.jsonl` (local only, not Parquet) and `manifest.json`.

## Real-data run (`pipeline/run_real.py`, issue #164)

```sh
python -m whitespace.pipeline.run_real --corpus <ingest out>/corpus.jsonl --out ~/whitespace-run
python -m whitespace.pipeline.run_real --dry-run --out /tmp/ws-dry          # tiny synthetic corpus, not data
python -m whitespace.pipeline.run_real --corpus ... --caches-only --origins 2010 2011   # speed/sanity, no scoring
```

- Streams `corpus.jsonl` (the `ingest build` format) and never loads it whole. Defaults: fit 2010 to 2014, calibration 2017, test 2020, `n_min` 30, `max_concepts` 5000, horizon 3, link threshold 3 (fixed in `common.py`), `--seed`.
- Per origin T: `select_vocabulary` (streaming counts) on works dated <= 31 Dec T; every work dated <= 31 Dec T+3 is assigned concepts from vocabulary T. Cached in `<out>/cache/origin_<T>/` (`vocabulary.json`, `works.jsonl` with ids, dates and concepts only, `meta.json`); a rerun with the same corpus hash and settings recounts nothing.
- `backtest.run_backtest` accepts a `works_for_origin(T)` callable in place of a list; `return_test_artifacts=True` adds an `artifacts` dict (PairSet, calibrated scores, labels, starting weights per test origin, numpy, read inside the one-shot guard).
- Fails early (no counting) when a year from the first origin to the last test origin + horizon has no works, when `assert_purged` fails, or when an origin has too few works or an empty vocabulary; the manifest records the failure. The one-shot ledger is `<out>/one_shot.json`; `--override-one-shot` is logged and recorded.
- Writes `metrics.json`, `run_manifest.json` (corpus sha256 and counts per year, vocabulary size per origin, config hash, seeds, code commit, library versions, stage times, peak memory). No abstract text is printed or written.

## Backtest export (issue #161)

`pipeline/export_backtest.py` turns the runner's `metrics` dict into the frontend's `BacktestResponse` (`web/src/api.ts`) and a `manifest.json`. `to_backtest_response(metrics, hits, misses, code_link_evaluation=None, meta=None)` copies numbers from the latest test origin and invents none: `pr_auc` and the `cosine` baseline are `null` (the runner has neither), and common neighbours and Jaccard are omitted because the frontend type does not list them. NaN and infinity become `null`; no abstract text is written. Only a run with `data_label == "real"` and no synthetic generator produces `placeholder: false`; a synthetic, unlabelled or empty run returns the placeholder shape with `synthetic` set and no numbers, hits or misses. `select_hits_misses` returns the top 20 hits and top 10 misses on a test origin; the hit year comes from work dates when works are supplied, otherwise it is `null` and `hits_note` says only annual counts exist. `write_manifest` records corpus, split, seeds, config hash, code commit, library versions and file hashes. Extra top-level keys beyond the frontend type: `synthetic`, `hits_note`, `meta`. The real-run check is `backtest.is_real_run`; a non-real response carries `data_label` in `meta` (`synthetic` or `unlabelled`).

**Data label.** `run_backtest(..., data_label=...)` accepts exactly `real`, `synthetic` or `unlabelled` (free text is rejected). Only `is_real_run(manifest)` (label `real` and no generator) may be treated as a real result by the run script and every exporter; synthetic and unlabelled runs stay placeholders. **Model ranking.** Model metrics rank by the calibrated logit `a*d + b`, the ordering of the deployed probability; a non-positive fitted slope adds a `warning` and the reported slope.

## Map, gaps and meta export (issue #162)

`pipeline/export_map_gaps.py` turns pipeline objects into the frontend's files (`map-<year>.json`, `gaps.json`, `gap-details.json`, `concepts.json`, `meta.json`), shaped like the types in `whitespace/web/src/api.ts`. `build_export(works, years, predictor, ...)` returns them; `write_export` writes them. `trained_predictor(train(...))` supplies calibrated `p_link` from works dated on or before each year only.

- **Layout** is a projection, not a similarity measure: truncated SVD (numpy, fixed seed) of the positive-PMI co-occurrence matrix at the final snapshot, scaled to [-1, 1]. One layout serves every year, so each map file carries `layout_year`; counts, growth and edges use only that year's snapshot, but x/y do come from the final snapshot.
- **Gap score** is `p_link * sigmoid(2.0 * min(growth_a, growth_b)) * (1 - max(cosine, neighbour_overlap)) * (1 + gap_rate_a + gap_rate_b)`. Momentum uses the weaker partner's growth (`MOMENTUM_K = 2.0`), so both topics must be growing; `gaps.json` records it as `momentum_formula`. Cosine (no embeddings) and gap rate (no open-problem mining) are omitted while missing, `meta` and `gaps.json` state the formula used, and the score is not a probability. Gaps rank the top pairs by `p_link` (default pool 2000).
- **Papers** are exported as id, year and link only. No abstract text. `meta` headline numbers are copied from a real backtest dict, otherwise null; NaN becomes null.

`pipeline/export_backtest.py` turns the runner's `metrics` dict into the frontend's `BacktestResponse` (`web/src/api.ts`) and a `manifest.json`. `to_backtest_response(metrics, hits, misses, code_link_evaluation=None, meta=None)` copies numbers from the latest test origin and invents none: `pr_auc` and the `cosine` baseline are `null` (the runner has neither), and common neighbours and Jaccard are omitted because the frontend type does not list them. NaN and infinity become `null`; no abstract text is written. Only a run with `data_label == "real"` and no synthetic generator produces `placeholder: false`; a synthetic, unlabelled or empty run returns the placeholder shape with `synthetic` set and no numbers, hits or misses. `select_hits_misses` returns the top 20 hits and top 10 misses on a test origin; the hit year comes from work dates when works are supplied, otherwise it is `null` and `hits_note` says only annual counts exist. `write_manifest` records corpus, split, seeds, config hash, code commit, library versions and file hashes. Extra top-level keys beyond the frontend type: `synthetic`, `hits_note`, `meta`. The real-run check is `backtest.is_real_run`; a non-real response carries `data_label` in `meta` (`synthetic` or `unlabelled`).

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

## Coverage export (`pipeline/export_coverage.py`, issue #163)

`to_coverage_response(year, coverage_table, archive_info)` returns the frontend's `CoverageResponse` (`web/src/api.ts`): concepts, per-year cells (`paper_count`, `linked_paper_count`, `code_rate`, `state`), caveat and archive info (revision, snapshot 2025-07-28, `cc-by-sa-4.0`, row count, attribution, low-coverage cutoff year). Grey years keep their counts but have `code_rate` null (`thin` before the cutoff, `outside_archive_vintage` after 2025). Cells carry "no linked code in this archive"; non-arXiv papers stay in the denominator and are flagged `unmatchable_by_construction`. Extra keys beyond the frontend type (`row_count`, `attribution`, `low_coverage_cutoff_year`, `min_linked`, per-cell flags) are additive.

`code_link_evaluation(hand_check_rows)` computes correct matches, precision, 95% Wilson interval, sample composition and protocol text from the completed 100-pair frame (`final_label`). With no table, or any row unlabelled, every field is null and `placeholder` is true.

## Export for the frontend (`pipeline/export_all.py`, issue #175)

```sh
python -m whitespace.pipeline.run_real --corpus <corpus.jsonl> --out ~/whitespace-run        # the run
python -m whitespace.pipeline.code_join_local ... --out ~/whitespace-join                    # optional (#173)
python -m whitespace.pipeline.export_all ~/whitespace-run --out ~/whitespace-export --join-dir ~/whitespace-join
```

`--last-year N` stops the export at year N (default: the corpus end): later records are excluded and `meta.json` counts them in `corpus.records_after_last_year_excluded`; N below the first year or, for `through-2020`, below 2023 is refused.

One flat directory: `routes.json` (every frontend route to its file, key, and `real` or `placeholder`), `manifest.json`, `meta.json`, `backtest.json` (`/api/backtest`), `map-<Y>.json` (`/api/map?year=Y`, Y from 2015 to the last corpus year), `gaps.json` (`/api/gaps`), `gap-details.json` (`/api/gap/{a}/{b}`, entry `"a|b"`, top gaps only), `concepts.json` (`/api/concept/{id}`, entry `id`), `coverage-<Y>.json` (`/api/coverage?year=Y`), `search.json` and `open-problems.json` (always placeholders). `gap-details.json` and `concepts.json` wrap their payloads in `entries`. Query parameters other than `year` are not applied. The CLI runs `validate_export` and exits 1 on any problem, 2 if the export could not run. `--out` must be new, empty, or a previous export (it holds `routes.json`); then the known export files are removed before writing so no stale `map-<Y>.json` survives, and any other non-empty directory is refused (exit 2). A synthetic export always carries `data_label: synthetic`.

- **Held-out versus production.** `backtest.json` is the held-out test (metrics plus hits and misses that `run_real` picked from the runner's guarded artifacts into `backtest_examples.json`; the export never reads test labels). It scores the backtest model: fit on 2010-14, Platt-calibrated at 2017, tested once at 2020. `gaps.json` is labelled a production forecast scored at the last corpus year; its outcomes are unknown and nothing in it was evaluated. Which model produced it is chosen by `--production-model`:
  - `through-2020` (default): fit on origins 2010-14 and 2017, Platt-calibrated (a logistic fit of the decision value) on the full pair universe at origin 2020 (purge rule: 2017 + 3 <= 2020). It is trained after the held-out test was scored and uses the 2020 outcomes (2021 to 2023) for calibration, so it has no held-out test of its own. The held-out numbers describe the backtest model, not this one, and the production probabilities are not shown to be better calibrated than the backtest's. The 2020 test is not re-scored. `manifest.json` records `production_model_equals_backtest_model: false`; `gaps.json` (`label`, `trained_on`) and `meta.json` (`production_forecast.model`) state the origins, the calibration method and `held_out_tested: false`.
  - `frozen` (fallback): the backtest model itself, re-trained deterministically from the fit and calibration origins only and compared with the run's recorded coefficients (`production_model_equals_backtest_model: true`).
- **No later knowledge.** Each `map-<Y>.json` uses the origin-Y vocabulary and works dated up to 31 Dec Y, and a layout of that year (points can move between years). Missing origin caches are built from the corpus (`--corpus`, sha256 checked). `meta.json` states the corpus end; later years are absent, not zero.
- **Paper titles.** With `--corpus corpus.jsonl` the export streams the corpus once and gives every paper that appears in the outputs (gap-detail supporting papers, coverage examples) its real title and link (arXiv abstract link when the record has an arXiv id, else the OpenAlex id). Only the title is read; abstract text is never written. Without it the id is the title and `meta.json` says `titles_available: false`. Hits and misses are concept pairs and carry no paper.
- **Coverage on the map's concepts.** With `--join-dir` (needs `papers.csv`, `coverage.json`, optional `report.json` and `handcheck_frame.csv` from `code_join_local`), each `coverage-<Y>.json` has cells per phrase concept (`concept_kind: "phrase"`, the `--coverage-top` concepts with most papers, default 200, chosen once by paper totals up to the last corpus year, so every year's file lists the same concepts and an early year can include concepts that were still small then) and year, from the final-year cache joined to the per-work `has_linked_code` flag. Cells keep denominators, grey states and the unmatchable flags; `available` cells also carry `papers_without_linked_code` (at most 10 `{id, title, year, url}`, id order). Without `--join-dir` coverage is a placeholder.
- **Gap stoplist (issues #255, #266).** A short, curated display filter, `GENERIC_PHRASES` in `pipeline/export_map_gaps.py` (about 530 generic fillers: English adverbs, participles and scaffolding phrases such as "address this problem", plus non-English function words and boilerplate phrases such as Indonesian "adalah" or "menggunakan metode"; bare technical concept words in any language, such as algorithm, model, problem, system, method or data, are deliberately not listed; each entry is matched as a whole lowercase concept string), hides candidate pairs from the production gap list `gaps.json` only. `build_gaps` drops a pair when either concept is listed, before the top-N cut, so the list is still filled to `--gap-limit` from the `--gap-pool` candidates. The vocabulary, features, model, backtest (including its hits and misses) and map concept points are unchanged. `gaps.json` carries `stoplist: {applied, phrases, hidden_candidates, note}` and `meta.json` repeats it under `production_forecast.stoplist`; the note reads "N generic phrases hidden from this list; vocabulary and backtest unchanged". On by default; `--no-stoplist` writes the unfiltered list (no `stoplist` key). It is a judgement-based filter, not a model output.
- **Gap diversity (issue #287).** The model gives hub concepts such as "covid" or "pretrained language model" a very high p_link with almost everything, so a global top-`--gap-pool` by p_link is mostly hub pairs (seven of the top ten pairs in the first live export). `build_gaps` therefore (1) builds the candidate pool per concept: each concept contributes at most its top `POOL_PER_CONCEPT` (10) pairs by p_link, merged, de-duplicated and cut to the pool size; and (2) after ranking by gap score, skips a pair when either concept already appears `MAX_GAPS_PER_CONCEPT` (3) times in the list. If the pool runs out the skipped pairs are re-admitted in rank order and counted as `relaxed_slots`. Scores of the pairs that remain are unchanged; the vocabulary, model, backtest and map files are unchanged. `gaps.json` carries `diversity: {applied, max_gaps_per_concept, pool_per_concept, skipped_by_cap, relaxed_slots, note}` (the note reads "max N gaps per concept; candidate pool built per concept; vocabulary, model and backtest unchanged") and `meta.json` repeats it under `production_forecast.diversity`. On by default; `--no-diversity` writes the old list (no `diversity` key). It is a curated presentation choice, not a model output; a hub can still appear up to 3 times.
- **`meta.json`** always carries `year_range {min, max}` equal to the `routes.json` map years, also in placeholder exports. `open-problems.json` stays a placeholder with no items; its `item_shape` documents that every future item has `concept_ids` (`[]` until mining exists).
- **Real or placeholder.** Only `backtest.is_real_run` on the run's metrics manifest (label `real`, no generator) makes a real export; a dry run, synthetic or unlabelled run writes every file as `placeholder: true` and `synthetic: true` with no numbers except years, and the writer raises otherwise. Coverage is a placeholder without `--join-dir`.
- **Validator.** `validate_export(dir)` checks routes resolve to files and keys, strict JSON without NaN, the key sets and value types of the frontend fixtures (copied to `pipeline/frontend_contract/` from PR #159) and `api.ts`, no abstract keys or pasted text, the production label, and placeholder/synthetic consistency.

## Open problems (`pipeline/open_problems.py`, issues #270 and #278)

Author-stated open problems, future work and limitations are extracted from abstracts by a regex prefilter (PRD section 13), one streaming pass over `corpus.jsonl`. Sentences are quoted whole (40 to 400 characters, never a whole abstract), attributed to and linked to their paper. Extraction quality is **unmeasured** until a labelled sample is reported in `meta.json`. Rates are display only and never feed the gap score or the backtest.

```sh
python -m whitespace.pipeline.open_problems extract <corpus.jsonl> --vocabulary <vocabulary.json> --out <cache dir>   # about 40 s on 16 cores; the cache stays out of Git
python -m whitespace.pipeline.open_problems attach --export-dir <export> --cache <cache dir> [--out <copy>]          # seconds; validates and fails if not OK
python -m whitespace.pipeline.export_all <run> --out <export> --open-problems <cache dir> ...                       # the same selection inside a full export
```

`attach` fills `open-problems.json` and the `open_problems` fields (top 50 gaps and top 200 concepts plus every gap concept, 5 sentences each), updates `meta.json`, `routes.json` and the `manifest.json` hashes, records the step under `manifest.export.open_problems` (cache hashes, tool commit) and runs `validate_export`. Output is deterministic.

**`routes.json` shape.** `{layout_version, synthetic, data_label, corpus_last_year, map_years: [..], note, routes: [...]}`. `map_years` lists the years that have a `map-<Y>.json` and a `coverage-<Y>.json`; any year outside it (for the real corpus, everything after 2023) has no file and the frontend should show "no data for this year" (absent, not zero). Each route is `{route, file, kind, status, [year], [key], [note]}`:

| route pattern | file | selection | status |
| --- | --- | --- | --- |
| `/api/meta` | `meta.json` | none | real or placeholder |
| `/api/backtest` | `backtest.json` | none | real or placeholder |
| `/api/map?year=Y` | `map-Y.json` | `year` selects the file (`kind: by_year`) | real or placeholder |
| `/api/coverage?year=Y` | `coverage-Y.json` | `year` selects the file | real or placeholder |
| `/api/gaps` | `gaps.json` | none; `concepts`, `min_p`, `sort`, `limit` are filtered client-side | real or placeholder |
| `/api/gap/{a}/{b}` | `gap-details.json` | `entries["a\|b"]` (`kind: keyed`, `key` template); missing key means no detail | real or placeholder |
| `/api/concept/{id}` | `concepts.json` | `entries[id]` (`kind: keyed`) | real or placeholder |
| `/api/search?q=&k=` | `search.json` | none; query ignored | always placeholder |
| `/api/open-problems` | `open-problems.json` | none; query ignored | always placeholder |

**Sample export.** `whitespace/tests/fixtures/export_sample/` is a small export of the SYNTHETIC dry run (made-up words) for the frontend to copy into `whitespace/web/public/data/` and test against. Every file is `placeholder: true` and `synthetic: true`. It contains NO real results.
