# Whitespace: Find research gaps worth a closer look

## Inspiration

Research moves faster than people can read it. Search finds work that already exists, but it does not rank combinations that have not yet become connected in published literature. Authors' open problems are scattered across papers, and paper-to-code links are incomplete and difficult to compare. We built Whitespace to help people explore research directions and inspect the evidence behind them.

## What it does

Whitespace maps AI research concepts from OpenAlex and ranks concept pairs that have not yet met the project's three-paper co-occurrence rule. A research map supports exploration, while Gap Finder presents ranked pairs and their supporting evidence. Evidence exposes a purged temporal backtest, declared baselines and calibration. Code Coverage shows links found in the Papers with Code archive; this is a lower bound, and a missing archive link does not establish that no implementation exists.

Search and Open Problems are MVP placeholders. The current export contains no author-stated open-problem sentences, so the product does not claim to extract or assess them.

## How we built it

The Python pipeline collects OpenAlex works in AI subfield 1702, extracts deterministic one-to-three-word phrases per snapshot year, builds concept co-occurrence graphs, ranks eligible pairs with a logistic regression model, evaluates the full eligible pair population, joins paper records to the Papers with Code archive, and exports static JSON artifacts. The temporal backtest has a single 2020 test origin: it fits through 2014, calibrates on 2017, and evaluates outcomes from 2021 to 2023. Purging keeps the three-year outcome windows separated. Its headline comparison is the pre-registered `current_weight` baseline, selected on the 2017 calibration origin.

The frontend is a static Vite, React and TypeScript app. The results are precomputed, so the demo makes no live external calls. GitHub Actions deploys the site to Vercel from `main`. The team also built with AI coding agents: Claude Code implemented, and Codex reviewed.

## Challenges we ran into

The central challenge was evaluating a forecast without letting later information leak into its historical inputs. We used a purged temporal split and report that topic assignments come from a post-October-2026 snapshot, a residual limitation. We also had to keep the aggregate result in perspective: stronger structural baselines outperform the model within every starting-weight stratum. Deterministic phrase concepts have unmeasured quality, calibration is imperfect, and the code archive is incomplete and historical. Time also meant Search and Open Problems remain placeholders.

## Accomplishments that we're proud of

We completed the real backtest once at the 2020 test origin (outcomes 2021–2023) on frozen commit `93448d2`. Under the pre-registered rule, the model beats the `current_weight` baseline (selected on the 2017 calibration origin) on aggregate average precision: 0.6876 versus 0.5984, difference +0.0892 (95% concept-block bootstrap interval [0.0845, 0.0945]). P@100 is not distinctive (model 1.00; baseline 0.66; wide interval [0.11, 0.62], while other baselines reach 0.91–1.00). Calibration is imperfect: ECE 0.143. The aggregate AP gain is partly driven by the strata mix: within each starting-weight stratum, the model is below the five structural baselines (common neighbours, Adamic–Adar, Jaccard, degree product and preferential attachment) on AP and AUC. Coverage is a lower bound. Search and Open Problems are MVP placeholders. We report the result with its limits, without treating it as proof that the model is generally useful or that any predicted pairing is important.

Forecasting concept pairs has prior art: Krenn et al. (arXiv:2210.00881) frame AI research directions as link prediction on a semantic network. ERLA (IC Hack 26) is related. We do not claim to be first.

## What we learned

A single aggregate metric can hide weaker performance in the groups that make it up. The comparison needs its baseline, strata, uncertainty and calibration reported alongside it. We also learned to describe a missing code link as “not found in this archive,” rather than implying that no implementation exists. A forecast can help someone find a lead to investigate; co-occurrence is not a measure of importance or truth.

## What's next

Build and evaluate search and author-stated open-problem extraction before presenting them as working features. Improve concept quality and calibration, and assess the forecast against the structural baselines within each stratum. Validate paper-to-code matching with the planned hand-check and continue to present archive coverage as a lower bound.

## Built with

Python, NumPy, OpenAlex, Papers with Code archive, Vite, React, TypeScript, IBM Plex, GitHub Actions, Vercel, Claude Code, Codex

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
