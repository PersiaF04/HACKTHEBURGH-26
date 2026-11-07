# Whitespace submission checklist

Issue: [#174](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/174).
From PRD section 24 and section 20. Tick a box only after checking the thing
itself. Items marked **HUMAN** need a person's decision or action; an agent
must not decide them.

## Deadlines

- Official deadline: Sunday 8 November 2026, 12:00 (per the HackTheBurgh XIII
  itinerary, as read in the PRD). Confirm it is still current.
- Internal code freeze: **10:30 UTC on Sunday 8 November 2026** (product owner
  decision, recorded on #122). Freeze code, data and configuration, then run
  the held-out 2020 test once. No feature changes after this point.
- Submit by 11:30 only if the official deadline is still 12:00.
- Judging starts around 12:30 (PRD timeline).

## Before the freeze

- [ ] **HUMAN** Confirm the submission platform and its current rules. Do not
  assume prior-year rules.
- [ ] **HUMAN** Confirm whether one project may enter both tracks (HRT and
  G-Research as the owner phrased them; the official site does not confirm the
  wording). Ask the sponsors at their workshops or at <hello@hacktheburgh.com>.
- [ ] **HUMAN** Decide the project name and track choice for the form.
- [ ] Manifest records the corpus scope, work-type list, topic vintage
  (current assignments, post October 2026), split and measured paper counts per
  origin.
- [ ] If frozen v1 topic assignments are wanted, they are saved before
  13 January 2027.
- [ ] **HUMAN** Sign off the headline metric (average precision across all
  strata, against the best baseline chosen on the calibration origin) before
  the test run.

## Repository

- [ ] Repository is public. **HUMAN** (visibility setting).
- [ ] README states what exists and what does not, with no claim beyond the
  evidence. The existing README says no forecast result exists yet; update it
  when the run completes.
- [ ] **One command** to run the demo from precomputed artifacts is written in
  the README and was actually run by someone other than its author. Until
  that is true, the README must say there is no verified run command.
- [ ] No live external calls during the demo; it runs from files.
- [ ] No credentials or private data committed. OpenAlex key lives in an
  environment variable or an ignored local file.
- [ ] Raw abstracts are not in Git or public artifacts.
- [ ] Licence decision: the repository has no `LICENSE` file. **HUMAN** to
  select one or state it is unlicensed.
- [ ] Files from the earlier project are removed or clearly
  separated (tracked in #136 and #171).

## Results table, limitations and prior art

- [ ] Results table in the README or Evidence page. Cells are filled from
  `metrics.json` and `backtest.json` only after the real run; otherwise the
  cell says "planned backtest, not achieved". Required columns: base rate,
  precision at 100, average precision, ROC-AUC (secondary), model against each
  baseline, by starting weight 0, 1, 2.
- [ ] If the model does not beat the strongest baseline, the table says so.
- [ ] Limitations section covers: co-occurrence is not importance or truth;
  topic vintage; layout fixed from the final snapshot; no embeddings; logistic
  regression with null intervals; deterministic phrase concepts of unmeasured
  quality; archive coverage is a lower bound; PwC archive ends 28 July 2025;
  hand-check status.
- [ ] Prior Art section names **ERLA** (referred to as MAGI in the initial
  brief; Devpost entry "ERLA - Exploratory Recursive Language Agents"),
  **Papers with Code** (the archive used) and **SciCoQA** (ACL Anthology 2026,
  as cited in the PRD; not read by this pack's author, so verify the citation
  before quoting). Also name Krenn et al., arXiv:2210.00881.
- [ ] ERLA described accurately: its published pages document no forecast,
  backtest or code view; its repository has no declared licence, so none of its
  code is reused. Prize wording differs between Devpost and GitHub; quote
  Devpost or say "placed in the track".
- [ ] Papers with Code credited, CC-BY-SA-4.0 identifier and link shown, and
  share-alike addressed for any redistributed derived table. **HUMAN** to
  decide how share-alike applies to the UI.

## Disclosures

- [ ] **HUMAN** AI-use disclosure wording approved. The README already says
  Claude Code agents wrote code and documentation and Codex agents reviewed
  it, under human decisions.
- [ ] **HUMAN** Pre-existing code and external contributions disclosed as the
  event Code of Conduct requires. The repository history includes work from the
  earlier project; state what was built during the event period and what was
  not. Only work built during the official hackathon period is eligible for
  prizes (Code of Conduct, as quoted in the PRD).
- [ ] Data sources and licences listed: OpenAlex (CC0 metadata, third-party
  restrictions may apply), Papers with Code archive (CC-BY-SA-4.0).

## Demo readiness

- [ ] Frontend reads real exported files, not mock fixtures. Until it does,
  the demo says which screens are mock.
- [ ] Files exist and are wired: `map-<year>.json`, `gaps.json`,
  `gap-details.json`, `concepts.json`, `meta.json`, `backtest.json`,
  `manifest.json`, coverage response.
- [ ] Demo rehearsed three times with a timer, using
  [WHITESPACE-DEMO.md](WHITESPACE-DEMO.md). The 60-second fallback rehearsed
  once.
- [ ] Every placeholder in the demo script and Q&A replaced from a file, or the
  no-result variant used. Search both files for `[` placeholders.
- [ ] Judge Q&A read by every presenter, including "do not say" and "what we
  did not build".
- [ ] **Two-minute backup video** recorded from the same artifacts, with
  audio or captions, stored where it can be played offline. **HUMAN**
- [ ] Offline copy of the app and a screenshot set on the presenter laptop.

## Wording check (run before submitting)

Run from the repository root. It must print nothing and exit with status 1.
The pattern uses bracket tricks so this file does not match itself.

```bash
grep -n -i -E "first[ ]tool|predicts[ ]breakthroughs|no[ ]code[ ]exists|deliver[e]d|Turn[ ]Up|curtai[l]|SCOTE[X]|D[F]S" \
  docs/WHITESPACE-DEMO.md docs/WHITESPACE-JUDGE-QA.md docs/SUBMISSION-CHECKLIST.md
```

Also check the README, Devpost text and video script by hand for "first",
"new idea", "no code" without "linked ... in this archive", and any
unmarked planned number.

## Needs a human, in one list

1. Submission platform, current rules, and whether one project may enter both
   tracks.
2. Track names and rubric from the sponsors.
3. Headline sign-off before the single test run.
4. AI-use and pre-existing-code disclosure wording.
5. Licence for the repository and the share-alike decision for the UI.
6. The two-person 100-pair code-link hand-check (or omit any link-precision
   figure).
7. Public visibility of the repository and the final submit action.
