# Whitespace pipeline

Python code for the Whitespace research-discovery pipeline (spike [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122), requirements in [`PRD.md`](../PRD.md)). This folder holds **code and tests only**. It contains no data and no results: nothing here is a measured forecast, and no claim of accuracy is made until a purged backtest has been run once, after the code freeze.

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

**No real result exists.** The model and runner have only ever seen synthetic corpora from `pipeline/synthetic.py` (a planted latent-topic signal, and a null version without it). The tests show the harness behaves; they say nothing about real literature or forecast quality.

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

`pipeline/export_backtest.py` turns the runner's `metrics` dict into the frontend's `BacktestResponse` (`web/src/api.ts`) and a `manifest.json`. `to_backtest_response(metrics, hits, misses, code_link_evaluation=None, meta=None)` copies numbers from the latest test origin and invents none: `pr_auc` and the `cosine` baseline are `null` (the runner has neither), and common neighbours and Jaccard are omitted because the frontend type does not list them. NaN and infinity become `null`; no abstract text is written. Only a run with `data_label == "real"` and no synthetic generator produces `placeholder: false`; a synthetic, unlabelled or empty run returns the placeholder shape with `synthetic` set and no numbers, hits or misses. `select_hits_misses` returns the top 20 hits and top 10 misses on a test origin; the hit year comes from work dates when works are supplied, otherwise it is `null` and `hits_note` says only annual counts exist. `write_manifest` records corpus, split, seeds, config hash, code commit, library versions and file hashes. Extra top-level keys beyond the frontend type: `synthetic`, `hits_note`, `meta`.
