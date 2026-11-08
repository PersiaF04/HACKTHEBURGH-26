# Whitespace pitch

## Hook

**Find the research gaps worth a closer look, and see what the literature leaves out.**

## 30-second elevator pitch

Choosing a research direction is often guesswork: papers show what has been studied, while the gaps between fields stay hard to see. Whitespace maps AI research concepts and ranks pairs that may become connected in the next three years. At frozen SHA `93448d2`, its aggregate average precision beat the pre-registered baseline (chosen on 2017) over all eligible pairs in a purged temporal test, though it does not beat the stronger structural baselines within strata. It also shows where the Papers with Code archive has no linked implementation, as a lower bound. It is a decision aid, not a measure of which ideas matter.

## Narrative arc

1. **Problem:** Choosing a research direction is guesswork. Search finds existing work, while gaps between concepts and missing code are hard to see.
2. **Insight:** Historical connections can be tested as forecasts, and an operational map can help people explore areas the literature has not yet connected.
3. **Product:** Whitespace maps AI research concepts, ranks unlinked pairs by the chance they will meet the three-paper co-occurrence rule within three years, and shows linked-code coverage from the Papers with Code archive. Search and Open problems are MVP placeholders today.
4. **Proof:** At frozen SHA `93448d2`, the model beat the pre-registered baseline on aggregate average precision over 3,943,852 eligible concept pairs. Within each starting-weight stratum it is below the five structural baselines, so this is an aggregate-only result. The result comes from a purged temporal backtest, not a claim that every predicted pair is meaningful.
5. **Why it matters:** Students, researchers and supervisors can use evidence to shortlist directions for human investigation. The code view can show where an archive has no linked implementation, without implying none exists.
6. **Ask:** Try a map area, inspect one ranked pair, then check the evaluation and archive caveats. Use the tool to decide what to investigate, not what to believe.

## Three-minute spoken script

The script is timed for a live walkthrough of [the Whitespace site](https://whitespace-hacktheburgh-26.vercel.app). If a screen still shows fixtures, say so; use the phrase “if real data is live” before describing its data. Do not read mock values as results.

### 0:00–0:20 — Opening and problem

**Stage direction:** Open the Research map.

“Choosing a research direction is still a lot of guesswork. A search engine can find papers that already connect two fields, but the gaps between fields are harder to see. Whitespace is a way to explore those gaps and inspect the evidence behind them.”

### 0:20–0:50 — Research map

**Stage direction:** Use the 3D-only map; select a concept if the interaction is available. The header tabs are Research map, Gap finder and Open problems.

“This is the 3D Research map: concepts drawn from the OpenAlex AI subfield 1702 corpus, with 731,511 works. The map gives a view of the research landscape. If real data is live, each point reflects a concept’s publication footprint; the layout is a navigation aid, not evidence about historical distance.”

### 0:50–1:15 — Gap finder

**Stage direction:** Open Gap finder and select a ranked pair, if real data is live.

“The Gap finder ranks pairs that are not yet linked by our rule: three or more joint papers. The forecast asks whether a pair will cross that threshold within three years. It is a ranked guess from past publication patterns, not a claim that the combination is important, true or fundable.”

### 1:15–1:35 — Open problems

**Stage direction:** Open Open problems and identify it as a placeholder.

“This page is an MVP placeholder. We have not built reliable extraction of authors’ stated open problems, so I won’t present this screen as a working feature. That is an important distinction: the current ranking does not judge whether a gap is worth pursuing.”

### 1:35–2:20 — Evidence

**Stage direction:** Open Evidence from the footer link or directly at `/evidence`. Show the headline comparison and protocol if displayed; otherwise speak to the result.

“Here is the result from the frozen run at SHA `93448d2`, under our pre-registered rule in issue 122. On all 3,943,852 eligible concept pairs, with a base rate of 0.281, average precision is 0.6876 for the model and 0.5984 for the pre-registered baseline, current weight, chosen on 2017: a paired difference of plus 0.0892. The concept-block 95% interval is 0.0845 to 0.0945. ROC AUC is 0.867 versus 0.818.

“The live gap scores use a production model trained through the 2020 origin; the headline numbers above are from the frozen backtest model.”

“The test was purged and temporal: fit through 2014, calibrate on 2017, and test once on 2020 against outcomes from 2021 to 2023. The baseline was selected on 2017. That is an aggregate result. Within each starting-weight stratum, the model is below the five structural baselines, such as common neighbours and Adamic–Adar, on AP and AUC, so much of the gain comes from the strata mix. Calibration is imperfect: ECE is 0.143, and the model under-predicts at the top end. P at 100 is 1.00 versus 0.66, but its interval is wide, 0.11 to 0.62, and other baselines also reach 0.91 to 1.00, so it is not distinctive.”

### 2:20–2:45 — Code coverage

**Stage direction:** Open Code coverage from the footer link or directly at `/coverage`; point to a cell and its denominator if real data is live.

“This view uses the Papers with Code archive. A cell without a linked paper means no link was found in that archive, not that no implementation exists. Coverage is a lower bound: the archive is incomplete and frozen, so missing links need human interpretation.”

### 2:45–3:00 — Why it matters and ask

**Stage direction:** Return to the map or leave Code coverage visible.

“Concept forecasting has prior art, including Krenn and colleagues, arXiv 2210.00881, and ERLA from IC Hack 26 is a related project. Our contribution is purged temporal evaluation and turning the forecast into a decision tool. Concepts are deterministic phrases with unmeasured quality, and the result does not tell you what to work on. Use Whitespace to find a lead, then investigate it.”

## 60-second fallback

“Choosing a research direction is often guesswork, and gaps between fields are invisible in ordinary search. Whitespace maps AI research concepts and ranks unlinked pairs that may become connected within three years. At frozen SHA `93448d2`, over 3,943,852 eligible pairs with a 0.281 base rate, average precision was 0.6876 versus 0.5984 for the pre-registered baseline, current weight. The purged test fit through 2014, calibrated on 2017 and tested once on 2020 for 2021–2023 outcomes. It is aggregate-only: within strata the model is below the structural baselines. Calibration is imperfect, and P at 100 is not distinctive. Code coverage uses the Papers with Code archive and is a lower bound. Search and Open problems remain placeholders. Krenn et al. is prior art; our contribution is purged temporal evaluation and turning the forecast into a decision tool.”

## Track framing

These are the team’s own framings; the official prompts are unconfirmed.

- **HRT:** A rigorous forecast of which gap to pursue, evaluated with a purged temporal backtest. We test a historical ranking against a held-out future period, compare it with a baseline selected on calibration data, and report uncertainty and calibration limits. This is research decision support, not a trading claim.
- **G-Research:** Making the invisible visible: the gaps between research concepts and the missing code links in a paper-to-code archive. The archive view is explicitly a lower bound, and Open problems is still a placeholder.

## Five judge questions

1. **How do you know the forecast is useful?** At frozen SHA `93448d2`, the model’s average precision was 0.6876 versus 0.5984 for the pre-registered baseline on all 3,943,852 eligible pairs; the paired difference was 0.0892, with a concept-block 95% interval of 0.0845–0.0945. It is aggregate-only: within each stratum the model is below the five structural baselines on AP and AUC. This is one purged temporal test, not proof of general performance.
2. **Could there be leakage, and is it calibrated?** The test protocol fits through 2014, calibrates on 2017, and tests once on 2020 for 2021–2023 outcomes; the baseline was chosen on 2017. Calibration remains imperfect: ECE 0.143, with under-prediction at the top end. We disclose that limitation.
3. **What does a “gap” mean?** A concept pair with fewer than three joint papers under our operational co-occurrence rule. Crossing that threshold is not proof that the ideas are important or that the research is good. Our deterministic phrases have unmeasured quality.
4. **Does missing code mean no one implemented the paper?** No. It means no linked implementation was found in the Papers with Code archive. That archive is incomplete, so the coverage is a lower bound.
5. **What is actually usable in the demo, and what is new here?** If real data is live, the Research map, Gap finder, Evidence and Code coverage show the exported corpus and results. Research map, Gap finder and Open problems are the three header tabs; Evidence and Code coverage are linked in the footer and available at `/evidence` and `/coverage`. Search and Open problems are MVP placeholders. The live gap scores use a production model trained through the 2020 origin; the headline numbers are from the frozen backtest model. Krenn et al. (arXiv:2210.00881) is prior art, and ERLA (IC Hack 26) is a related project; our contribution is purged temporal evaluation and turning the forecast into a decision tool.
