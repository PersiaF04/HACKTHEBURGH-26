# Whitespace: Find research gaps worth a closer look

## In short

Whitespace is a research-discovery tool for AI literature. It turns 730,671 OpenAlex papers in AI (subfield 1702) into a 3D map of concepts, then ranks pairs of topics that are not yet studied together but look likely to connect within three years. Each ranked gap comes with its supporting papers, how fast both topics are growing, and short author-stated open problems quoted from related abstracts. We built it in 24 hours at HackTheBurgh XIII with a Python pipeline (phrase extraction, co-occurrence graphs, a logistic link model) and a static React and Three.js site deployed on Vercel. We evaluated the forecast with a purged, pre-registered temporal backtest scored once on held-out 2021–2023 outcomes: it beats the pre-registered baseline on aggregate average precision (0.6876 vs 0.5984, +0.0892, 95% interval [0.0845, 0.0945]), though simpler graph baselines are stronger within each stratum, and we report that openly. The team worked with AI coding agents: Claude Code agents implemented features and Codex agents reviewed pull requests, under the team's decisions on scope and merging.

## Inspiration

Research moves faster than people can read it. Search finds work that already exists, but it does not rank combinations that have not yet become connected in published literature. Authors' open problems are scattered across papers, and paper-to-code links are incomplete and difficult to compare. We built Whitespace to help people explore research directions and inspect the evidence behind them.

## What it does

Whitespace maps AI research concepts from OpenAlex and ranks concept pairs that have not yet met the project's three-paper co-occurrence rule. The 3D-only map shows the 2023 snapshot of 730,671 works; its header badge reads **Real data · 731k papers · 2023**. The header has three tabs: Research map, Gap finder and Open problems. Evidence and Code coverage are in the footer and at `/evidence` and `/coverage`.

The Research map is a branch → concept → hypothesis graph; selecting a concept shows its papers, growth and linked open-problem excerpts. Gap Finder presents ranked pairs and supporting evidence, with an at-a-glance overview and sorting from the table headers. Its labels are Likelihood (%), Strength (Strong/Moderate/Weak), and a “How this is measured” toggle; the gap and hypothesis panels show linked open-problem excerpts. The gap score's momentum is `sigmoid(2·min(growth_a, growth_b))`, so both topics must be growing. A generic-phrase stoplist hides filler phrases, and no concept appears in more than three listed gaps (the candidate pool is built per concept), so one hub topic cannot fill the list. Both apply to the displayed gap list only; they do not change the underlying scores or evaluation. A Stated gaps column shows, for context only, the share of each topic's papers that state an open problem (open-problem statements only); it is not part of the gap score. A production model fitted on origins 2010–2014 and 2017, then Platt-calibrated on 2020, supplies the live gap scores. Because 2020 is also the held-out backtest origin, this production model has no held-out test of its own and is not shown to be better calibrated than the backtest model. Read Likelihood (%) as a ranking, not a real chance; the combined gap score is a ranking heuristic, not a probability.

Open Problems displays short attributed excerpts of the `open_problem` type only, quoted from abstracts indexed by OpenAlex and capped at 400 characters. Copyright remains with publishers and authors. On this type, the AI-labelled precision sample was 24/34 (71%). It is not human-validated: the same AI system that built the extractor labelled the sample, so this is not independent validation. Overall extraction quality has not been independently evaluated. The excerpts are prompts for checking source papers, not verified labels.

Evidence exposes the held-out temporal backtest, declared baselines and calibration. The unchanged headline is aggregate average precision 0.6876 versus 0.5984, a difference of +0.0892 with 95% concept-block bootstrap interval [0.0845, 0.0945]. This is aggregate-only: within each starting-weight stratum, the model is below the structural baselines on AP and AUC. ECE is 0.143 (top-decile prediction 0.53 versus 0.78 observed). P@100 is indicative only: 1.00 versus 0.66 for `current_weight`, with difference interval [0.11, 0.62]; other baselines reach 0.91–1.00. This held-out result describes the backtest model, not the live production model. Code Coverage shows links found in the Papers with Code archive; this is a lower bound, and a missing archive link does not establish that no implementation exists.

## How we built it

The Python pipeline collects OpenAlex works in AI subfield 1702, extracts deterministic one-to-three-word phrases per snapshot year, builds concept co-occurrence graphs, ranks eligible pairs with a logistic regression model, evaluates the full eligible pair population, joins paper records to the Papers with Code archive, and exports static JSON artifacts. The temporal backtest has a single 2020 test origin: it fits through 2014, calibrates on 2017, and evaluates outcomes from 2021 to 2023. Purging keeps the three-year outcome windows separated. Its headline comparison is the pre-registered `current_weight` baseline, selected on the 2017 calibration origin.

The frontend is a static Vite, React and TypeScript app. The results are precomputed, so the demo makes no live external calls. GitHub Actions deploys the site to Vercel from `main`. The team also built with AI coding agents: Claude Code implemented, and Codex reviewed.

## Challenges we ran into

The central challenge was evaluating a forecast without letting later information leak into its historical inputs. We used a purged temporal split and report that topic assignments come from a post-October-2026 snapshot, a residual limitation. We also had to keep the aggregate result in perspective: stronger structural baselines outperform the model within every starting-weight stratum. Deterministic phrase concepts have unmeasured quality, calibration is imperfect, and the code archive is incomplete and historical. The open-problem sample's AI-labelled precision is 24/34 (71%); the AI system that labelled it also built the extractor, so this result is neither independent nor human-validated. Overall extraction quality has not been independently evaluated.

## Accomplishments that we're proud of

We completed the real backtest once at the 2020 test origin (outcomes 2021–2023) on frozen commit `93448d2`. Under the pre-registered rule, the model beats the `current_weight` baseline (selected on the 2017 calibration origin) on aggregate average precision: 0.6876 versus 0.5984, difference +0.0892 (95% concept-block bootstrap interval [0.0845, 0.0945]). This result is aggregate-only; within every starting-weight stratum, the model is below the five structural baselines (common neighbours, Adamic–Adar, Jaccard, degree product and preferential attachment) on AP and AUC. ECE is 0.143. P@100 is indicative, not distinctive: other baselines reach 0.91–1.00. The result does not establish that the production model's likelihoods are real chances or that any predicted pairing is important.

Forecasting concept pairs has prior art: Krenn et al. (arXiv:2210.00881) frame AI research directions as link prediction on a semantic network. ERLA (IC Hack 26) is related. We do not claim to be first.

## What we learned

A single aggregate metric can hide weaker performance in the groups that make it up. The comparison needs its baseline, strata, uncertainty and calibration reported alongside it. We also learned to describe a missing code link as “not found in this archive,” rather than implying that no implementation exists. A forecast can help someone find a lead to investigate; co-occurrence is not a measure of importance or truth. AI-labelled open-problem excerpts need verification against their source papers.

## What's next

Improve concept quality and calibration, and assess the forecast against the structural baselines within each stratum. Validate paper-to-code matching with the planned hand-check and continue to present archive coverage as a lower bound. Improve open-problem extraction and validation before treating its labels as reliable. Extend the corpus to 2024–2026 papers with a consistent OpenAlex topic vintage (topics were re-classified in October 2026), and give the production model its own held-out test.

## Built with

Python, NumPy, OpenAlex, Papers with Code archive, Vite, React, TypeScript, Three.js, IBM Plex, GitHub Actions, Vercel, Claude Code, Codex

## Links

- Live site: <https://whitespace-hacktheburgh-26.vercel.app>
- Repository: <https://github.com/PersiaF04/HACKTHEBURGH-26>

## Track notes

These are the team's own framings; the official prompts are unconfirmed.

- **HRT:** research decision support grounded in a purged temporal backtest, with its baseline and limitations visible. This is not a trading claim.
- **G-Research:** make research directions and recorded code coverage easier to see, while treating the archive view as a lower bound.

## Before submitting (HUMAN)

- [ ] Confirm the submission platform and its current rules.
- [x] One project may enter both tracks; Whitespace enters HRT and G-Research (Persia, #174).
- [ ] Decide the project name and track choice for the form.
- [x] Headline metric signed off before the test (Persia, #122).
- [x] The repository is public (checked).
- [x] Licence: MIT (LICENSE on main).
- [ ] Decide how the Papers with Code share-alike licence applies to the UI.
- [ ] Approve the AI-use disclosure wording.
- [ ] Disclose pre-existing code and external contributions as required by the event Code of Conduct.
- [ ] Record a two-minute backup video with audio or captions and store it for offline playback.
