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

**Data label.** `run_backtest(..., data_label=...)` accepts exactly `real`, `synthetic` or `unlabelled` (free text is rejected). Only `is_real_run(manifest)` (label `real` and no generator) may be treated as a real result by the run script and every exporter; synthetic and unlabelled runs stay placeholders. **Model ranking.** Model metrics rank by the calibrated logit `a*d + b`, the ordering of the deployed probability; a non-positive fitted slope adds a `warning` and the reported slope.

## Backtest export (issue #161)

`pipeline/export_backtest.py` turns the runner's `metrics` dict into the frontend's `BacktestResponse` (`web/src/api.ts`) and a `manifest.json`. `to_backtest_response(metrics, hits, misses, code_link_evaluation=None, meta=None)` copies numbers from the latest test origin and invents none: `pr_auc` and the `cosine` baseline are `null` (the runner has neither), and common neighbours and Jaccard are omitted because the frontend type does not list them. NaN and infinity become `null`; no abstract text is written. Only a run with `data_label == "real"` and no synthetic generator produces `placeholder: false`; a synthetic, unlabelled or empty run returns the placeholder shape with `synthetic` set and no numbers, hits or misses. `select_hits_misses` returns the top 20 hits and top 10 misses on a test origin; the hit year comes from work dates when works are supplied, otherwise it is `null` and `hits_note` says only annual counts exist. `write_manifest` records corpus, split, seeds, config hash, code commit, library versions and file hashes. Extra top-level keys beyond the frontend type: `synthetic`, `hits_note`, `meta`. The real-run check is `backtest.is_real_run`; a non-real response carries `data_label` in `meta` (`synthetic` or `unlabelled`).
