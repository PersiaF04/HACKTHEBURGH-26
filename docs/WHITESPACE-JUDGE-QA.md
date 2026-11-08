# Whitespace judge Q&A

Issue: [#174](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/174).
Covers PRD section 23 plus harder questions. Sources are the PRD sections and
comments on [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122).
**No result exists yet**: every number is a placeholder such as `[AP model]`
or `[base rate]`. Where an answer depends on a result, it says so. Anything not
verified in #122 is marked **unverified**.

## Do not say

- Never call Whitespace "first" or "new" as a concept. Concept-pair forecasting
  is prior art (Krenn et al., arXiv:2210.00881).
- Do not say it forecasts breakthroughs, important ideas or truth. Co-occurrence
  is not importance. A forecast is a ranked guess from past publication
  patterns.
- Say "no linked code found in this archive (Papers with Code, 28 July 2025
  snapshot)". Never say a paper "has no code" or that no implementation exists.
- Do not call Whitespace grounded, validated or calibrated before a backtest
  and a calibration check exist. Do not borrow ERLA's word "grounding" for
  leakage controls.
- Never present a planned, synthetic or illustrative number as a result. Quote
  no accuracy figure without metric, base rate and test period.
- Do not quote Science4Cast AUC figures (93%, 99.5%) as our expected
  performance; they are a different metric on a different test list.
- Do not say ERLA is unreliable or that it "hallucinates"; nothing supports it.
- Do not call the HRT or G-Research track names official; they come from the
  owner's brief.
- Do not claim a probability or percentage unless calibration holds; otherwise
  show a rank.
- Do not say the demo is live or deployed. The frontend runs on mock fixtures
  until wired to exported files.

## PRD section 23 questions

| Question | Short honest answer | Source | Limit |
| --- | --- | --- | --- |
| Doesn't your concept list leak the future? | Partly, and we say so. Concepts, graphs and labels are rebuilt from papers dated by each snapshot origin, but the topic classifier that labelled old works was switched in October 2026, so labels are not what was known then. We pin one vintage and disclose it. | PRD sections 8 and 13; #122 topic vintage comments | A residual leak remains (the classifier reads title, abstract and source name, not citations). Frozen v1 assignments expire 13 Jan 2027. |
| Are probabilities meaningful after 10:1 negative sampling? | The 10:1 sample is used for training only. Calibration and all test metrics use every eligible pair. Base rate is always shown. | PRD section 13 | Calibration at the test origin is checked at one origin; if it does not hold we show a rank, not a percent. Result: [ECE] and [Brier skill] once run. |
| Why not use preferential attachment? | It is a baseline, scored on the same pairs. The model counts as an improvement only if it beats the best simple baseline. | PRD sections 13 and 19 | Result: [AP model] vs [AP best baseline]. If the baseline wins we say so. |
| What does a "link" mean? | Co-occurrence in at least three papers. It is an operational proxy for "studied together", not a statement about ideas. | PRD sections 1 and 8 | Sensitivity to other thresholds is planned, not done. |
| How was the corpus sampled? | Not by current citation count, which contains later attention. The scope and any sampling rule are recorded in the manifest. | PRD sections 8 and 23 | Final corpus size is [corpus size] from `manifest.json`. A cap of 5,000 concepts applies. |
| How is this different from MAGI/ERLA? | ERLA explores literature live and generates hypotheses with hallucination-checked summaries. Whitespace ranks concept pairs from publication patterns and, once run, tests the ranking out of sample, and adds a code-coverage view. It is a difference in emphasis. ERLA has strengths we lack: live retrieval, free-text hypotheses, per-claim grounding checks. | PRD section 17; #122 ERLA comment | ERLA's published pages document no forecast, backtest or code view; we did not watch its video or read its code. Say the Whitespace half only once the backtest exists. |
| Does a dark cell mean there is no code? | No. It means no linked code was found in the Papers with Code archive (28 July 2025 snapshot). Implementations outside the archive may exist. | PRD section 8; #122 Papers with Code comments | Coverage is a lower bound; papers after about mid-2025 look unlinked. |

## Harder questions

### Leakage

- **Q: How do you know there is no future leakage?**
  A: By design and by checks: snapshot-only inputs, a purge rule so a fit or
  calibration origin's three-year outcome window ends before the next stage,
  and tests that must pass before a metric is reported (including a poison test
  where post-origin rows are replaced by noise and predictions must not
  change). Say which of these actually ran: [purge test result], [poison test
  result].
  Source: #122 evaluation protocol v2; README. Limit: topic vintage is a
  residual leak; a passing test shows the harness catches the leaks it
  tests for, not that none remain.

- **Q: Your train and test windows overlap, don't they?**
  A: They are designed not to. Fit origins through 2014 (outcomes by 2017),
  calibration at 2017 (outcomes 2018 to 2020), test at 2020 (outcomes 2021 to
  2023). Source: PRD section 13; #122 owner decision. Limit: the manifest must
  record measured paper counts per origin; until it does, the split is a plan.

- **Q: Does your map layout leak the future?**
  A: Yes, in one respect. The layout is a deterministic SVD of the co-occurrence
  matrix computed from the final snapshot and fixed for all years, so
  positions carry `layout_year` and use later data. Every other field in a
  year's file uses only that year's snapshot. The map is a view, not part of
  the forecast features. Source: #122 PRD gaps comment. Limit: do not use
  positions as evidence of what was close in an earlier year.

### Base rate, baselines and small samples

- **Q: What is the base rate and why does it matter?**
  A: It is the share of eligible pairs that link within three years, [base
  rate]. A precision of [P@100 model] means little without it, so lift over
  base rate is reported beside precision@k. Source: PRD section 19. Limit:
  base rate differs by starting weight (0, 1, 2), so strata are reported
  separately and not pooled.

- **Q: Doesn't a popularity baseline explain all of this?**
  A: It might, and we test it: degree product, preferential attachment,
  Adamic-Adar and the current co-occurrence weight are baselines on identical
  pairs. Two large concepts can reach three papers by volume alone. Source:
  PRD section 13; #122 review comment. Limit: if the best baseline is
  competitive, "model beats popularity" is unsupported and we say so.
  A cosine baseline is not built (see below).

- **Q: Is your test sample large enough?**
  A: There is effectively one test origin, 2020. Later yearly origins share
  label years, so they are one correlated block, and the last origin may be
  undercounted because the index backfills. Uncertainty comes from resampling
  concepts within the origin, not from "spread across origins". Hub concepts
  sit in many pairs, so the effective sample size is nearer the number of
  distinct concepts than pairs. Source: #122 protocol v2. Limit: a gap of a
  few positives in the top 100 is within noise; state it.

- **Q: Why not report ROC-AUC?**
  A: It is reported but secondary. Positives are rare, so precision-recall
  measures are primary. Undersampling negatives can inflate ROC-AUC (up to 25%
  in one cited study). Source: #122 (Yang et al., arXiv:1505.04094, reported).
  Limit: that study is on different data.

### Method choices

- **Q: Why not just ask an LLM?**
  A: An LLM trained after the cut date has seen later literature, which is a
  leak we cannot audit, and its output is not testable against a dated
  outcome in the same way. We use a small model on dated counts so the test
  is reproducible. Source: #122 leakage checklist (embeddings and LLMs
  trained after T). Limit: we did not run an LLM baseline, so we cannot say how
  it would score. Temporal evaluation of LLM idea forecasting is being done by
  others (unverified: search snippets only).

- **Q: Why logistic regression, not a boosted model?**
  A: It was the dependency-free option in the time available, with Platt
  calibration on the calibration origin. Source: #122 PRD gaps comment. Limit:
  we have not compared against LightGBM.

- **Q: Is the probability calibrated?**
  A: Result: [ECE], [Brier skill], reliability bins [bin counts]. It is
  calibrated on the 2017 origin and checked at 2020; at the demo date
  calibration cannot be verified. If it does not hold, the UI shows a rank.
  Intervals are null: we do not show uncertainty bands because we did not
  validate their meaning. Source: PRD section 13; #122 protocol v2.

### Data

- **Q: Which OpenAlex topic vintage did you use, and why does it matter?**
  A: Topics did not change in October 2026; which works are assigned to them
  did, using title, abstract and source name. Old assignments were frozen on 5
  October 2026 and stay available only until 13 January 2027. Our corpus filter
  uses the current assignments, which the manifest must state. This is the
  retroactive-annotation problem HRT itself describes, so we say it before
  being asked. Source: help.openalex.org/data/topics (read in #122). Limit: we
  have not measured how much results differ between vintages.

- **Q: What does a link mean when topics are coarse?**
  A: We use deterministic phrase concepts, not OpenAlex topic IDs, as the
  vocabulary, because there are only 4,516 topics (about 10.2 million pairs)
  and a ranking of coarse pairs risks being trivial. Source: #122 protocol
  review; PRD gaps comment. Limit: phrase quality on real papers is unmeasured
  and needs a spot-check of about 50 concepts.

- **Q: How complete is your code-coverage layer?**
  A: It is a lower bound. The archive is a 28 July 2025 snapshot of 300,161
  rows that will not be updated; about 4% of rows have no arXiv id and cannot
  be joined; any paper after about June 2025 looks unlinked; coverage before
  about 2015 is very thin (2,269 linked papers for 2010 to 2014), so rates
  across years are only meaningful with the per-year denominator. Source:
  #122 Papers with Code comments. Limit: the archive's own recall is
  unmeasured.

- **Q: Is the join from archive to OpenAlex correct?**
  A: On a 500-paper sample 493 (98.6%) resolve, but that measures resolution,
  not correctness. 71% resolve to journal or conference records carrying the
  arXiv location, and about 1 to 3% may be wrong records (a hypothesis).
  Precision is measured only by the 100-pair hand-check: [hand-check correct]
  of 100, Wilson 95% interval [lo, hi], if it was run. The PRD target is at
  least 90 of 100. Source: #122 500-id test. Limit: the hand-check needs two
  people and has not run; it measures precision, not recall. Without it we
  state no precision.

- **Q: What is the Papers with Code licence and does share-alike affect you?**
  A: The archive is CC-BY-SA-4.0 (dataset card, verified). We credit Papers
  with Code and follow share-alike for redistributed derived tables. Linked
  repositories keep their own licences. Source: #122. Limit: how share-alike
  applies to a UI or model is unassessed. Human decision needed. Raw abstracts
  are not redistributed.

- **Q: Is Papers with Code really shut down?**
  A: The site redirects to Hugging Face Trending Papers (verified with curl).
  The shutdown date (24 to 25 July 2025 in secondary sources) is unverified.
  Say "the site now redirects", not a date.

### Prior art and meaning

- **Q: Isn't this just Krenn et al.?**
  A: Prior art, yes: Krenn et al. (arXiv:2210.00881; Nature Machine
  Intelligence 2023) frame AI research directions as link prediction on a
  semantic network, and Science4Cast is a benchmark for it. We do not claim to
  be first. Whitespace adds, as planned, a purged out-of-sample check against
  named simple baselines, a code-coverage lower bound and a concept map. Source:
  #122. Limit: the claim that the combination is new is unverified (search not
  exhaustive); do not make it.

- **Q: Does co-occurrence mean the combination is a good idea?**
  A: No. A pair that co-occurs is not thereby important, correct or fundable.
  A forecast is a ranked guess from past publication patterns. Source: README
  Limitations. Limit: stated authors' open problems (F6) are not built, so
  nothing in the product checks whether a gap is worth pursuing.

- **Q: What does "not yet linked" mean, given the three-paper rule?**
  A: A pair with fewer than three joint papers (0, 1 or 2) counts as "not yet
  established", not "never studied". Strata by starting weight are reported
  separately because a pair already at weight 2 needs only one more paper.
  Source: PRD section 13. Limit: annual counts only, so we cannot name the one
  paper that caused a crossing.

- **Q: Why would a finance firm care about a research tool?**
  A: Only the discipline transfers: point-in-time data, strong baselines,
  out-of-sample testing, base rates. We do not present this as a trading idea.
  Source: #122 track audit. Limit: no judging rubric was found; this is
  inference from HRT's public writing, not their criteria.

## What we did not build and why

These are departures from the PRD text, forced by time, dependency approval and
data. Say them before a judge finds them.

| PRD text | What we did | Why | Consequence |
| --- | --- | --- | --- |
| Embeddings (MiniLM), FAISS, KeyBERT, UMAP, BART-MNLI | None built | The PRD requires approval for new dependencies; time | No cosine baseline (the PRD lists one), no 0.92 near-duplicate merge, no nearest-neighbour candidate generator, search is not semantic. Candidate-generator recall is not reported because the evaluation uses the full eligible universe. The gap score omits the `(1 - cosine)` term and says so. |
| UMAP layout | Deterministic truncated SVD of the positive-PMI co-occurrence matrix (numpy), fixed from the final snapshot for all years | Reproducibility without a new dependency | Layout uses later data, so positions are a view, not point-in-time. |
| LightGBM | Regularised logistic regression (numpy), Platt calibration on the calibration origin | Same | Not compared against boosting. |
| p_lo and p_hi bootstrap intervals | Null | The PRD allows null unless validated | No uncertainty bands shown. |
| KeyBERT keyword concepts | Deterministic phrases of 1 to 3 words from title and abstract, 5,000-concept cap, subsumption and a generic ceiling | Same | Quality on real papers is unmeasured. |
| Hybrid search (F3) | Not built | Cut order | No search; the demo navigates by map and lists only. |
| FastAPI and DuckDB server | Static JSON exports | Time | Frontend needs a static route adapter; until then it runs on mock fixtures. |
| Paper titles in gap detail | Not carried in the pipeline | Time | Gap detail shows ids and links, not titles. |
| Open-problems explorer (F6) and gap-rate term | Not started | Needs a measured sentence-level precision and recall first | No stated-gap signal in the score. |
| Stretch features (F8, F9, F10, F12) | Not built | First in the PRD cut order | Not shown, not promised. |
| 100-pair code-link hand-check | Not run unless two people ran it | Needs two people | State no link precision unless it ran. |
