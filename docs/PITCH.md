# Whitespace pitch

## Hook

**Find the research gaps worth a closer look, and see what the literature leaves out.**

## 30-second elevator pitch

Choosing a research direction is often guesswork: papers show what has been studied, while the gaps between fields stay hard to see. Whitespace maps AI research concepts using the 2023 snapshot of 730,671 works, and ranks unlinked pairs. Its live gap scores come from a production model fitted on origins 2010–2014 and 2017, then Platt-calibrated on 2020, the held-out backtest origin. It has no held-out test of its own and is not shown to be better calibrated than the backtest model; likelihoods are rankings, not real chances. The held-out backtest's unchanged aggregate headline is AP 0.6876 versus 0.5984, +0.0892 [0.0845, 0.0945], but performance is below structural baselines within strata and P@100 is not distinctive. Whitespace is a decision aid, not a measure of which ideas matter.

## Narrative arc

1. **Problem:** Choosing a research direction is guesswork. Search finds existing work, while gaps between concepts and missing code are hard to see.
2. **Insight:** Historical connections can be tested as forecasts, and an operational map can help people explore areas the literature has not yet connected.
3. **Product:** Whitespace offers a 3D-only research map and ranks unlinked pairs with a gap finder. The header tabs are Research map, Gap finder and Open problems; Evidence and Code coverage are in the footer and at `/evidence` and `/coverage`. The live map is the 2023 snapshot of 730,671 works, and the header badge reads “Real data · 731k papers · 2023.” Open Problems displays short attributed `open_problem` excerpts quoted from OpenAlex-indexed abstracts, capped at 400 characters; copyright remains with publishers and authors. AI-labelled precision on this type was 24/34 (71%), not human-validated; the same AI system that built the extractor labelled the sample, so it is not independent. Overall extraction quality remains unmeasured.
4. **Proof:** The held-out headline is unchanged: aggregate AP 0.6876 versus 0.5984, +0.0892 [0.0845, 0.0945]. It is aggregate-only; within each starting-weight stratum, the model is below the structural baselines on AP and AUC. ECE is 0.143 and P@100 is not distinctive.
5. **Why it matters:** Students, researchers and supervisors can use evidence to shortlist directions for human investigation. The code view can show where an archive has no linked implementation, without implying none exists.
6. **Ask:** Explore the map, pick a non-covid gap from the live top list, then check the evaluation and archive caveats. Use the tool to decide what to investigate, not what to believe.

## Three-minute spoken script

The script is timed for a live walkthrough of [the Whitespace site](https://whitespace-hacktheburgh-26.vercel.app). The live export is real data; its header badge reads “Real data · 731k papers · 2023.” Do not describe rankings as verified chances.

### 0:00–0:20 — Opening and problem

**Stage direction:** Open the Research map from the header's Research map tab.

“Choosing a research direction is still a lot of guesswork. A search engine can find papers that already connect two fields, but the gaps between fields are harder to see. Whitespace is a way to explore those gaps and inspect the evidence behind them.”

### 0:20–0:50 — Research map

**Stage direction:** Use the 3D-only map; orbit or zoom, then select a concept to show its branch → concept → hypothesis graph. Point out the single 2023 snapshot and 730,671 works in the header badge. There is no time slider. The backtest outcome window, discussed on Evidence, is 2021–2023. The three header tabs are Research map, Gap finder and Open problems.

“This is the 3D Research map, built from the 2023 snapshot of OpenAlex AI research, with 730,671 works. The map lets us move from a branch to a concept and its hypotheses. The layout helps navigate the landscape; it is not evidence about historical distance.”

### 0:50–1:15 — Gap finder

**Stage direction:** Open Gap finder, pick a non-covid gap from the live top list, and point out Likelihood (%), Strength (Strong/Moderate/Weak), and the “How this is measured” toggle.

“The Gap finder ranks pairs that are not yet linked by our rule: three or more joint papers. Its momentum term is sigmoid of twice the smaller topic growth, so both topics need to be growing. A 534-phrase generic stoplist hides filler from the displayed list only. The live scores come from a production model fitted on origins 2010 to 2014 and 2017, then Platt-calibrated on 2020, the held-out backtest origin. It has no held-out test of its own and is not shown to be better calibrated than the backtest model. Likelihoods are rankings, not real chances, and the combined gap score is a ranking heuristic.”

### 1:15–1:35 — Open problems

**Stage direction:** Open Open problems from the header; show a short attributed excerpt and its source attribution. Keep it clear that this is display-only AI labelling, not human validation.

“This page shows short attributed excerpts of the open-problem type, up to 400 characters, quoted from abstracts indexed by OpenAlex. Copyright remains with publishers and authors. AI-labelled precision on this type was 24 of 34, or 71%. This is not human-validated: the same AI system that built the extractor labelled the sample, so it is not independent. Overall extraction quality remains unmeasured. Treat these as prompts to check the source paper, not verified labels.”

### 1:35–2:20 — Evidence

**Stage direction:** Open Evidence from the footer link or directly at `/evidence`. Show the headline comparison and its protocol.

“Here is the result from the frozen run at SHA `93448d2`, under our pre-registered rule in issue 122. The held-out headline is unchanged: aggregate average precision is 0.6876 versus 0.5984 for `current_weight`, chosen on 2017, a difference of +0.0892 with a concept-block 95% interval from 0.0845 to 0.0945.

“The live gap scores use a production model trained through the 2020 origin. It has no held-out test of its own. Those live likelihoods are rankings, not real chances; the held-out numbers describe the backtest model, not the production model.

“The backtest was purged and temporal: fit through 2014, calibrate on 2017, and test once on 2020 against outcomes from 2021 to 2023. The result is aggregate-only. Within each starting-weight stratum, the model is below the structural baselines on AP and AUC. Calibration is imperfect: ECE is 0.143, with 0.53 predicted versus 0.78 observed in the top decile. P@100 is indicative only: 1.00 versus 0.66 for `current_weight`, difference +0.34 [0.11, 0.62]; other baselines reach 0.91 to 1.00.”

### 2:20–2:45 — Code coverage

**Stage direction:** Open Code coverage from the footer link or directly at `/coverage`; point to a cell and its denominator.

“This view uses the Papers with Code archive. A cell without a linked paper means no link was found in that archive, not that no implementation exists. Coverage is a lower bound: the archive is incomplete and frozen, so missing links need human interpretation.”

### 2:45–3:00 — Why it matters and ask

**Stage direction:** Return to the Research map tab or leave Code coverage visible.

“Concept forecasting has prior art, including Krenn and colleagues, arXiv 2210.00881, and ERLA from IC Hack 26 is a related project. We do not claim to be first. Our contribution is purged temporal evaluation and turning the forecast into a decision tool. Concepts are deterministic phrases with unmeasured quality, and the result does not tell you what to work on. Use Whitespace to find a lead, then investigate it.”

## 60-second fallback

“Choosing a research direction is often guesswork, and gaps between fields are invisible in ordinary search. Whitespace maps AI research concepts using the 2023 snapshot of 730,671 works, and ranks unlinked pairs. The live gap scores come from a production model fit on origins 2010 to 2014 and 2017, then Platt-calibrated at the 2020 backtest origin. It has no held-out test of its own and is not shown to be better calibrated, so likelihoods are rankings, not real chances. The held-out headline is unchanged: aggregate AP 0.6876 versus 0.5984, +0.0892 [0.0845, 0.0945]. It is aggregate-only: within strata the model is below structural baselines. ECE is 0.143 and P@100 is indicative, not distinctive. Open Problems shows attributed open-problem excerpts; AI-labelled precision was 24/34 (71%), but the same AI system that built the extractor labelled the sample. It is not human-validated or independent; overall quality remains unmeasured. Code coverage uses the Papers with Code archive and is a lower bound. Krenn et al. is prior art and ERLA is related; our contribution is purged temporal evaluation and a decision tool.”

## Track framing

These are the team's own framings; the official prompts are unconfirmed.

- **HRT:** A research decision aid grounded in a purged temporal backtest. Its aggregate result and limits are visible; this is not a trading claim, and the production likelihoods are rankings without a held-out test of their own.
- **G-Research:** Making research directions and recorded code coverage easier to see, while treating the archive view as a lower bound.

## Five judge questions

1. **How do you know the forecast is useful?** The held-out headline is aggregate AP 0.6876 versus 0.5984, +0.0892 [0.0845, 0.0945]. It is aggregate-only: within each starting-weight stratum, the model is below the structural baselines on AP and AUC. ECE is 0.143 and P@100 is not distinctive. This is one purged temporal test, not proof of general performance. The production model supplying live gap scores has no held-out test of its own.
2. **Could there be leakage, and is it calibrated?** The backtest protocol fits through 2014, calibrates on 2017, and tests once on 2020 for 2021–2023 outcomes; the baseline was chosen on 2017. Calibration remains imperfect, with ECE 0.143. Topic assignments come from a post-October-2026 snapshot, a residual limitation.
3. **What does a “gap” mean?** A concept pair with fewer than three joint papers under our operational co-occurrence rule. Its momentum is `sigmoid(2·min(growth_a, growth_b))`, so both topics must be growing. The gap score is a ranking heuristic, not a probability; crossing the threshold is not proof that the ideas are important or the research is good. Our deterministic phrases have unmeasured quality.
4. **Does missing code mean no one implemented the paper?** No. It means no linked implementation was found in the Papers with Code archive. That archive is incomplete, so coverage is a lower bound.
5. **What is actually usable in the demo, and what is new here?** The 3D-only Research map, Gap finder and Open problems are the three header tabs. Evidence and Code coverage are in the footer and at `/evidence` and `/coverage`. The Gap finder has Likelihood (%), Strength (Strong/Moderate/Weak), and “How this is measured”; its displayed gap list hides generic filler phrases. Open Problems displays attributed excerpts of at most 400 characters from OpenAlex-indexed abstracts, with copyright remaining with publishers and authors. AI-labelled precision on the `open_problem` type was 24/34 (71%), not human-validated; the same AI system that built the extractor labelled the sample, so it is not independent. Overall extraction quality remains unmeasured, so excerpts are prompts for source-paper checks, not verified labels. Krenn et al. (arXiv:2210.00881) is prior art, and ERLA (IC Hack 26) is related; we do not claim to be first.
