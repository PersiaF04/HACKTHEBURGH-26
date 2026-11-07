# Turn Up Scotland

Scotland pays wind farms to switch off when the cables south are full. Turn Up Scotland shows the hidden bill, forecasts when the grid operator will ask for help, and tells flexible loads when to answer. Built for HackTheBurgh XIII (repository name: `HACKTHEBURGH-26`).

## Description

When the transmission lines out of Scotland are full, the grid operator (NESO) pays wind farms to stop and pays gas plants further south to start. The payments to wind make headlines. Two other things do not:

- **The hidden bill.** Payments to Scottish wind were about £188m between 1 April and 29 October 2026. Two parallel measures of the system cost of the same constraint, gas turn-up offers and NESO's own published constraint cost, were each about £1.8bn over the same window. These overlap: they are shown side by side as magnitudes, not added up, and they do not prove who ultimately paid.
- **The unanswered call.** NESO began procuring flexible demand to switch on and soak up the surplus wind through its Demand Flexibility Service on 7 October 2026; the first turn-up request in our data is for 8 October. Of about 81,000 MWh requested across 30 such events up to 31 October, about 0.05% (0.046%) was procured.

Turn Up Scotland rebuilds Scottish wind curtailment from public data, checks it against NESO's published figures, forecasts the next day's curtailment, and replays a decision tool (the Flex Copilot) that says when a flexible load such as an electrolyser, data centre or heat network should be ready to switch on and what to bid. It is a static web app over committed JSON files, so the demo works offline.

**Who it is for.** The main user is the operations lead of a flexible load, or an aggregator, who decides each day which half-hours to be ready for. A second audience is anyone interested in energy policy: journalists, analysts and the public. Households, trading desks and regions outside Great Britain are out of scope.

**Honest limits.**

- All backtests are **retrospective**: NESO's day-ahead files carry no publication timestamps, so scores are built from data as published today and are probably optimistic. Every data file carries `meta.retrospective`.
- The samples are small. DFS turn-up events have existed for about one month, and the Copilot's replay rests on a handful of tradable half-hours.
- DFS zone IDs (Z1 to Z3) are shown as zone IDs; their mapping to regions is **not confirmed**, so nothing claims they are Scotland.
- The Copilot reports net pounds (settlement plus an assumed site value, minus electricity) with a sensitivity chart. It assumes full delivery, which is optimistic, and it makes no revenue claim.
- No AI model produces any number in the app.

The product requirements, evidence and risks are in [`PRD.md`](PRD.md).

## Badges

[![CI](https://github.com/PersiaF04/HACKTHEBURGH-26/actions/workflows/ci.yml/badge.svg)](https://github.com/PersiaF04/HACKTHEBURGH-26/actions/workflows/ci.yml)
[![Models](https://github.com/PersiaF04/HACKTHEBURGH-26/actions/workflows/models.yml/badge.svg)](https://github.com/PersiaF04/HACKTHEBURGH-26/actions/workflows/models.yml)
[![Pipeline](https://github.com/PersiaF04/HACKTHEBURGH-26/actions/workflows/pipeline.yml/badge.svg)](https://github.com/PersiaF04/HACKTHEBURGH-26/actions/workflows/pipeline.yml)

## Visuals

No screenshots are committed yet. The three-minute demo script, the Devpost write-up and likely judge questions are in [`docs/DEMO.md`](docs/DEMO.md). The demo journey and the demo-step table are in [`PRD.md`](PRD.md) (sections 3 and 7), and the team's working notes and project status are in [`docs/`](docs/) (for example [`docs/coordination/STATUS.md`](docs/coordination/STATUS.md)). The app has seven screens, all reading JSON from `data/public/` (falling back to `contracts/fixtures/`):

| Screen | What it shows |
| --- | --- |
| The Waste (Waste Map) | A replay of a stormy day, farm by farm, with counters for energy wasted and money paid |
| Hidden Bill (Iceberg) | Payments to wind next to two much larger parallel measures of system cost |
| Help Wanted | NESO's turn-up requests against how little was procured |
| Tomorrow | A half-hourly curtailment forecast with a chronological backtest beside every score |
| Flex Copilot | A ready-and-bid schedule for a flexible load, scored against a naive rule and a perfect-hindsight oracle |
| Be the Operator | A game: make the readiness calls yourself and compare with the Copilot and the oracle |
| Under the Hood | How each number was rebuilt and checked, including the days that do not reconcile |

## Installation

Requirements:

- Node.js 22 and npm (the web app).
- Python 3.11 or later (the pipeline and models use only the standard library; `pytest` is needed for tests).

```bash
npm --prefix web ci
python -m pip install pytest
```

On Windows, Python has no timezone database, so also run `python -m pip install tzdata` before running the pipeline tests (CI runs on Linux and does not need it).

## Usage

Run all commands from the repository root unless stated.

**Run the app** (it needs no network and no credentials):

```bash
npm --prefix web run dev
```

For the demo build, which type-checks and then serves the production bundle on `http://localhost:4173`:

```bash
npm --prefix web run build && npm --prefix web run preview
```

Both commands first copy `contracts/fixtures/` and then `data/public/` into the app, so real files win and fixtures fill any gaps.

**Regenerate model outputs** (lane B, details in [`models/README.md`](models/README.md)):

```bash
python models/build_forecast.py             # data/public/forecast.json
python models/build_forecast.py --refresh   # re-download inputs first
python models/build_copilot.py              # data/public/copilot.json
```

**Regenerate pipeline outputs** (lane A, run from `pipeline/`, details in [`pipeline/README.md`](pipeline/README.md)):

```bash
cd pipeline
python -m turnup.backfill     # rebuild the lane A contract files in data/public/
python -m turnup.validate     # check data/public/ against contracts/fixtures/
python -m turnup.live         # refresh replay/live.json every 5 minutes (gitignored)
python -m turnup.archiver     # archive point-in-time snapshots until stopped
```

**Run the tests:**

```bash
python -m pytest models -q
cd pipeline && python -m pytest -q
```

### Repository layout

| Folder | Owner | Contents |
| --- | --- | --- |
| `web/` | Lane C | React, Vite and TypeScript static app |
| `pipeline/` | Lane A | Data pipeline, snapshot archiver and live poller |
| `models/` | Lane B | Forecast, request probability and Copilot |
| `contracts/` | All lanes | The JSON data contract and fixtures; changes need all three lane owners |
| `data/public/` | Producing lane | Generated JSON the app reads |
| `docs/` | Team | Coordination docs, CI notes and the decision log |

## Support

There is no separate support channel. Open a GitHub issue using the work item template for a task or bug, or the agent-message template for a question or handoff. For repeatable agent start and resume checks, see [`docs/coordination/VARSHIL-AGENT-SETUP.md`](docs/coordination/VARSHIL-AGENT-SETUP.md).

## Roadmap

Planned or open items, tracked in [`PRD.md`](PRD.md) and GitHub Issues:

- Score the forecast on our own archived snapshots so the backtest is no longer retrospective.
- Confirm the DFS zone-to-region mapping with NESO before naming any region.
- Re-run the Copilot per load type, size and zone, and model partial delivery from NESO's settled volumes.
- A hosted deployment and live mode on the hosted site (the live feed is gitignored, so it is local-only for now).
- Optional: a desk-turbine mirror and relay-driven demo load, and Tiger Data storage.

## Contributing

Read [`TEAMWORK.md`](TEAMWORK.md) for the quickstart and [`AGENTS.md`](AGENTS.md) for the working agreement, which applies to people and AI agents alike.

- GitHub Issues are the work queue. Use one issue per change, one branch per issue (`feature/<issue>-<slug>`, `fix/...`, `docs/...`, `chore/...`) and a pull request to `main` with `Closes #<issue>`.
- Do not work directly on `main`. Each lane owns its own folder; contract changes go through a pull request approved by all three lane owners.
- Branch protection needs an approval from an account other than the author. Update your branch from `main` before requesting approval, because new commits dismiss earlier approvals.
- Follow the issue-to-branch-to-PR flow in [`docs/coordination/BOARD.md`](docs/coordination/BOARD.md); use [`docs/coordination/AGENT-MESSAGING.md`](docs/coordination/AGENT-MESSAGING.md) for agent messages, [`docs/coordination/CI-CD.md`](docs/coordination/CI-CD.md) for CI and deployment notes, and [`docs/coordination/DECISIONS.md`](docs/coordination/DECISIONS.md) to record significant shared decisions.

## Authors and acknowledgment

| Lane | Person | Developer agent | Reviewer |
| --- | --- | --- | --- |
| A: data and pipeline | Varshil (`varshil247`) | Varshil's Claude | Varshil's Codex |
| B: models, validation and decision | sanamorii (`sanamorii`) | sanamorii's Claude | Persia's Codex |
| C: front end, story and hardware; product owner | Persia (`PersiaF04`) | Persia's Claude | Persia's Codex |

Claude Code agents wrote and Codex agents reviewed the code, under human decisions on scope and merging.

Data comes from NESO Open Data (published under the NESO Open Data Licence), Elexon open data, and DESNZ's Renewable Energy Planning Database (for farm coordinates). Please follow each source's own terms when reusing data.

## License

No licence has been chosen yet and the repository has no `LICENSE` file, so treat the code as not licensed for reuse until the team decides. This is an open decision for the product owner.

## Project status

Under active development for HackTheBurgh XIII (Edinburgh, 7 to 8 November 2026, 24 hours). The tracks are HRT "Best Use of Data for Predictions & Decision Making" and G-Research "Make the invisible visible". All seven screens, the data pipeline and the models are merged; the code freeze is 07:00 UTC on 8 November and the submission deadline is 12:00 GMT on 8 November. See [`PRD.md`](PRD.md) for the current state of requirements and risks.
