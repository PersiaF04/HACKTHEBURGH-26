# Whitespace demo script (3 minutes)

Issue: [#174](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/174).
Follows PRD sections 22 (demo), 18 (track framing) and 19 (evaluation
additions). Facts come from [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122).

## Read this first

- **A single 2020 result exists** ([#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122),
  SHA 93448d2). Numbers filled below are real; any bracketed placeholder still
  left (such as `[AP w1]`) has no recorded value yet. Fill it from the named
  file or leave it out. Never say a placeholder out loud.
- **If no real backtest exists at demo time, say this sentence verbatim:
  "planned backtest, not achieved".** Then show the protocol (no-result variant, 0:20 to 1:10) instead
  of numbers. A planned or synthetic number is never presented as a result.
- A forecast is a ranked guess from past publication patterns. It is not a
  measure of importance or truth.
- **Frontend status.** The frontend (PR #159) currently runs on mock fixtures.
  Every beat that shows a number or a map shows real values only once the pipeline
  has written the files and a static route adapter plus a `public/data` layout
  exist (frontend lane). Until then those screens show mock data and must be
  announced as mock, or skipped.
- **Tracks.** The owner's brief names two prizes: "Best Use of Data for
  Predictions & Decision Making" (HRT) and "Make the invisible visible"
  (G-Research). The official HackTheBurgh XIII site does not confirm either
  wording, and no judging rubric was found. Ask the sponsors at their
  workshops (HRT day 1 14:00, G-Research day 1 17:00) or at
  <hello@hacktheburgh.com>, and whether one project may enter both prizes. Do not
  quote the track names as official until confirmed.
- **Same facts for both tracks.** Only the opening sentence changes (the 0:00 to 0:20 beat).
  Sequence the result and protocol first, then the visuals as the interface to
  the same evidence. Do not describe this as a trading idea: the transfer is
  the discipline (point-in-time data, baselines, out-of-sample tests), not the
  domain.

## Who needs what before the demo

| Item | Needs |
| --- | --- |
| Backtest numbers | The held-out 2020 run, scored once at frozen SHA 93448d2 (pipeline freeze 02:00 UTC 8 Nov), and a human sign-off of the headline (average precision, all strata, against the best baseline chosen on the calibration origin) |
| Map on real data | `map-<year>.json` (latest year only), `concepts.json`, `meta.json` (from #167) wired through a static route adapter |
| Gap list and detail | `gaps.json`, `gap-details.json` (from #167) wired the same way |
| Evidence page | `backtest.json`, `manifest.json` (from #166) wired the same way |
| Coverage heatmap | The coverage response from #165 and #145, wired the same way |
| Hand-check precision | Only if two people actually run the 100-pair check; otherwise omit the figure |

## Controls that exist only once the frontend is wired

- Clicking a concept to show its trend and predicted partners.
- Gap list filters by area and minimum probability.
- Clicking a heatmap cell to list papers without an archive link.
- Evidence tables, by-stratum tabs and hits and misses tables reading
  `backtest.json`.

Not built, so never shown or promised: semantic search, the open-problems
explorer (F6), the research-question generator, "start from my paper", and
build-on readiness (stars and last commit). See "What we did not build" in
[WHITESPACE-JUDGE-QA.md](WHITESPACE-JUDGE-QA.md).

## Beat by beat

Result variant (a real run exists). Total 3:00.

| Time | On screen | Exact control | Spoken line | Data file for each number |
| --- | --- | --- | --- | --- |
| 0:00 to 0:20 | Evidence page, headline panel | Open **Evidence**; no clicks | HRT opening: "Which research gap should I spend my thesis on? We tested a ranked guess against what actually happened." G-Research opening: "Research has structure no single paper shows; this replays it using only papers published by each date." | none yet |
| 0:20 to 1:10 | Evidence page: headline, baseline table, strata tabs | Click each starting-weight tab (0, 1, 2); expand the baseline table | "Frozen on origins up to 2014 and calibrated at 2017, scored once at 2020 on outcomes from 2021 to 2023, on every eligible pair. Base rate is 0.28. Our average precision is 0.69 against 0.60 for the best baseline, a gain of 0.089 (95% interval 0.085 to 0.094). Precision at 100 is 1.00 against 0.66, indicative only (paired interval 0.11 to 0.62). Calibration is imperfect: expected calibration error 0.14, and the top decile is predicted at 0.53 but observed at 0.78. By starting weight: [AP w0], [AP w1], [AP w2]. Honest line: other simple baselines beat the model on average precision inside each starting-weight stratum (stratum 0: 0.154 against 0.216 to 0.247)." If the model does not beat the best baseline, say so here, plainly. | `backtest.json` (metrics, baselines, strata); `manifest.json` (split, counts) |
| 1:10 to 1:30 | Evidence page: checks and caveats | Scroll to leakage checks and vintage note | "These checks passed: [purge test result], [poison test result]. Unprompted caveat: OpenAlex re-assigned topics in October 2026, so which papers are in our AI corpus reflects current topic assignments, not those of 2020." | `manifest.json`; `backtest.json` checks block (exact field to confirm) |
| 1:30 to 2:10 | Research map, then a concept | Click a concept; show its trend and predicted partners | "Each dot is a concept; size is paper count. Positions come from one fixed layout, so the map is stable, not a separate layout per year. Click a concept to see its trend and predicted partners." | `map-<year>.json` (latest year only), `concepts.json`, `meta.json` |
| 2:10 to 2:35 | Gap finder, then gap detail | Open the top ranked gap; show score parts and the 3 supporting links | "A gap is a pair not yet linked, meaning fewer than three joint papers. The rank is a guess from publication patterns, with every component shown. Here is one hit and one miss from the backtest." | `gaps.json`, `gap-details.json`; hits and misses in `backtest.json` |
| 2:35 to 2:50 | Coverage heatmap | Click one dark cell | "Dark means no linked code found in the Papers with Code archive, a 28 July 2025 snapshot. That is a lower bound, not proof of no implementation. Years where the archive is thin are greyed; the cutoff is [coverage cutoff year]." | coverage response (#165, #145) |
| 2:50 to 3:00 | Limits slide or Evidence footer | none | "Not new as an idea: Krenn et al. (arXiv:2210.00881) forecast concept links. Co-occurrence is not importance. Topic vintage is a residual leak. See the repo for the full protocol." | none |

No-result variant (use if no real backtest exists). Total 3:00.

| Time | On screen | Exact control | Spoken line | Data file |
| --- | --- | --- | --- | --- |
| 0:00 to 0:20 | Evidence page | Open **Evidence** | Same track opening as above. Then: "planned backtest, not achieved." | none |
| 0:20 to 1:10 | Protocol on the Evidence page or README | Scroll through split, population, baselines | "Here is the protocol we would run: fit on origins up to 2014, calibrate at 2017, test once at 2020 on outcomes 2021 to 2023, every eligible pair, strongest baseline named in advance, base rate and lift reported by starting weight. We have not run it, so no number is shown." | `manifest.json` if it exists; otherwise README "Evaluation approach (plan)" |
| 1:10 to 2:10 | Map and concept | As above | As above, labelled as a structure view, not evidence of forecast quality | map files if wired, otherwise say the screen shows mock data |
| 2:10 to 2:40 | Coverage heatmap | As above | As above | coverage response |
| 2:40 to 3:00 | Limits | none | As above, plus: "everything forecast-related is a design today" | none |

## 60-second fallback

Use when time is cut, the projector fails or a screen will not load. Say it
from the README with no live app if needed.

1. 0:00 to 0:15: "Whitespace looks for AI and ML concept pairs not yet
   combined and ranks which are likely to appear together in three or more
   papers within three years. It is a ranked guess from past publication
   patterns, not importance or truth."
2. 0:15 to 0:35: With a result: "Tested once at 2020: base rate 0.28,
   our average precision 0.69 against 0.60 for the best simple baseline." Without one: "planned backtest, not achieved; the
   protocol is purged, out of sample and compares against the strongest simple
   baseline."
3. 0:35 to 0:50: "It also shows where no linked code was found in the Papers
   with Code archive, a 28 July 2025 snapshot and a lower bound."
4. 0:50 to 1:00: "Concept-pair forecasting is prior art (Krenn et al.). Our
   contribution is the out-of-sample check and the code view. Limits are in the
   README."

## Recovery line per likely failure

| Failure | Recovery line | Action |
| --- | --- | --- |
| Frontend will not start or the page is blank | "The app is not loading, so I will show the same evidence from the recorded video and the README." | Play the backup video; otherwise use the 60-second fallback |
| Screen shows mock data, not real exports | "This view is on mock fixtures, so I will not read numbers from it." | Switch to `backtest.json` in a text view, or use the no-result variant |
| Real export missing or wrong shape | "The export is not wired in this build; here is the file it would read." | Show the JSON file; do not improvise values |
| No backtest result at demo time | "planned backtest, not achieved." | Run the no-result variant |
| Model does not beat the best baseline | "The strongest simple baseline wins on [metric]; we report that." | Keep the slide; point to the by-stratum tabs |
| Concept panel is slow or blank | "Pausing; here is the concept's trend from the exported file." | Click a different concept, or show `concepts.json` |
| Heatmap cell click shows nothing | "The paper list for this cell is not wired; the cell shows the numerator and denominator." | Read the numerator and denominator from the tooltip |
| Network drops | "The demo runs from precomputed files with no live calls." | Continue; nothing should need the network |
| A judge asks a number we do not have | "We have not measured that; here is how we would." | Point to the protocol and the Q&A |
| Over time | "I will stop here; the README holds the limits." | Jump to the limits beat (2:50 to 3:00) |

## Wording rules

See the "do not say" list in
[WHITESPACE-JUDGE-QA.md](WHITESPACE-JUDGE-QA.md). In short: never "first";
"no linked code in this archive", not "no code"; a forecast is a ranked guess;
never present a planned or synthetic number as a result.

## Forbidden-phrase check

Run from the repository root (Git Bash or any POSIX shell). The pattern
uses bracket tricks so this file does not match itself. It must print nothing
and exit with status 1 (no matches). Any output means a phrase must be
removed.

```bash
grep -n -i -E "first[ ]tool|predicts[ ]breakthroughs|no[ ]code[ ]exists|deliver[e]d|Turn[ ]Up|curtai[l]|SCOTE[X]|D[F]S" \
  docs/WHITESPACE-DEMO.md docs/WHITESPACE-JUDGE-QA.md docs/SUBMISSION-CHECKLIST.md
```
