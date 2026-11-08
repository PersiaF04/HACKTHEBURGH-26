# Whitespace

Whitespace is a research-discovery tool for AI/ML literature. It turns a historical paper corpus into a concept graph that changes over time, and asks which concept pairs that are not yet linked are likely to be linked within three years. It was started at HackTheBurgh XIII (repository name: `HACKTHEBURGH-26`).

**One-liner:** "See where research is going, and the questions nobody has answered yet."

**Status:** under active development (spike [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122), requirements in [`PRD.md`](PRD.md)). The pipeline code and tests and the frontend MVP (on mock data) are in place; the full corpus, real artifacts and the forecast evaluation are still in progress. No forecast result exists yet, and nothing in this repository is a measured result until it is recorded.

## Who it is for

- PhD and MSc students choosing a novel, timely thesis or dissertation topic.
- Researchers who want to spot emerging directions and avoid saturated ones.
- Lab leads and supervisors deciding which directions to pursue or recommend.

## Two tracks, one set of evidence

Both tracks use the same evidence and limitations; only the opening framing changes ([`PRD.md`](PRD.md) section 18).

- **HRT: which research gap should I pursue?** Rank unlinked concept pairs by the probability that they link within three years. The model is tested on a purged temporal backtest (fit through 2014, calibrate at 2017, test once at 2020 with outcomes in 2021 to 2023) so no outcome window leaks into a later split. Probabilities are calibrated and reported with the base rate, precision@k and PR-AUC on all eligible pairs, against every declared baseline. If the model does not beat the strongest baseline, that is reported.
- **G-Research: make the invisible visible.** A research map with a time slider, an explorer of author-stated open problems (limitations, future work), and a code-coverage view from the archived Papers with Code links. Coverage is a lower bound: a paper without a link has no linked code in that archive, not necessarily no code.

The exact track prompts are not yet confirmed against the official event site (see the PRD).

## Repository layout

| Path | Contents |
| --- | --- |
| `whitespace/pipeline/` | Python pipeline: shared time rules and purge check, concepts, snapshot graphs, labels, baselines, metrics, Papers with Code layer, coverage export |
| `whitespace/tests/` | Offline tests (no network, no downloaded data) |
| `whitespace/web/` | Frontend MVP (Vite, React, TypeScript, Zustand): Explore, Gaps, Open problems, Evidence and Coverage routes, built against `mock/*.json` |
| `web/` | Earlier minimal frontend shell, still the folder CI's Web build checks |
| `docs/` | Demo script, judge Q&A, submission checklist |
| `docs/coordination/` | Issue workflow, CI and delivery, decision log, agent messaging |
| `scripts/` | Team inbox, agent session start, old-project term check |
| `.github/` | Issue and PR templates, CI workflows |

`whitespace/web/` is the frontend location in [`PRD.md`](PRD.md) section 15. Removing the `web/` shell and pointing CI at `whitespace/web/` is waiting on an owner decision ([#169](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/169)). See [`whitespace/README.md`](whitespace/README.md) for the pipeline's rules and modules.

## Run locally

Pipeline tests, from the repository root (Python 3.11 is what CI uses):

```sh
python -m pip install -r whitespace/requirements.txt
python -m pytest -q whitespace
```

There is no end-to-end pipeline command on `main` yet; the manual Papers with Code resolution check is described in [`whitespace/README.md`](whitespace/README.md).

Frontend, with Node.js 22. It reads the mock JSON in `whitespace/web/mock/` and needs no API or network:

```sh
npm --prefix whitespace/web ci
npm --prefix whitespace/web run dev      # development server
npm --prefix whitespace/web run build    # type-check and build to whitespace/web/dist
npm --prefix whitespace/web run preview  # serve the build
```

## Vercel preview

Deployment is tracked in [#135](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/135). The Vercel project `whitespace` is set to root directory `whitespace/web`, install `npm ci`, build `npm run build` and output `dist`; `whitespace/web/vercel.json` rewrites every route to `index.html` so deep links load on refresh.

- Vercel's Git deployments are blocked for this private repository on the Hobby plan, because the commit author must be the team owner. Previews are therefore deployed from the owner's authenticated machine with `vercel deploy` in a folder linked to the project, without `--prod`. [PR #172](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/172) proposes an owner-token preview workflow instead.
- A preview of PR #159 at `eff0a25` is at <https://whitespace-gd2vx6uoz-persia3.vercel.app>. It runs on mock fixtures and shows no real results. The link is deployment-specific and may change.
- The production URL still serves the previous deployment until the product owner approves a cutover.

## Data and limitations

- Paper metadata comes from OpenAlex (CC0 metadata). Raw abstracts are not committed or published.
- Code links come from the [Papers with Code archive on Hugging Face](https://huggingface.co/datasets/pwc-archive/links-between-paper-and-code) (`cc-by-sa-4.0`, 300,161 rows, snapshot retrieved 28 July 2025). Credit Papers with Code and follow the share-alike terms. Papers after about mid-2025 will look unlinked.
- A "link" is co-occurrence in at least three papers. Co-occurrence is not importance or truth.
- Concept-pair forecasting is prior art, not a new idea (for example, Krenn et al., [arXiv:2210.00881](https://arxiv.org/abs/2210.00881)).

## Team and lanes

- **Product owner:** Persia ([@PersiaF04](https://github.com/PersiaF04)), who owns scope, priorities and merge decisions.
- **Contributors:** Varshil and sanamorii ([#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122)).
- **Lanes** ([`PRD.md`](PRD.md) section 20): pipeline / ML, backend, and frontend / pitch.
- **Agents:** Claude Code agents implement assigned issues and Codex agents review pull requests, as set out in [`AGENTS.md`](AGENTS.md).

## Contributing

Read [`TEAMWORK.md`](TEAMWORK.md) and [`AGENTS.md`](AGENTS.md). GitHub Issues are the work queue: one issue per change, one branch per issue, and a pull request to `main` with `Closes #<issue>`. Do not work directly on `main`.

## AI-use disclosure

This project is built with AI coding agents. Claude Code agents write code and documentation and Codex agents review it, under human decisions on scope and merging.

## Licence

Not selected. The repository has no `LICENSE` file, so treat the code as not licensed for reuse until one is added.
