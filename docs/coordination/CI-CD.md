# CI and delivery

## What is in place

GitHub Actions runs these checks on pull requests targeting `main` and on pushes to `main`:

| Check | Workflow | Runs when | What it does |
| --- | --- | --- | --- |
| Markdown lint | `.github/workflows/ci.yml` | every PR and push | `markdownlint-cli2` over `**/*.md` |
| Web build | `.github/workflows/ci.yml` | every PR and push | `npm --prefix web ci` then `npm --prefix web run build` |
| Pipeline tests | `.github/workflows/pipeline.yml` | `pipeline/**` or the workflow changes | `python -m pytest -q` in `pipeline/` (Python 3.12) |
| Model tests | `.github/workflows/models.yml` | `models/**` or the workflow changes | `python -m pytest -q models` (Python 3.11, standard library plus pytest) |

The lane workflows use path filters, so they only run when their lane changes. The model test steps also skip themselves if `models/` is not on the branch yet. Keep checks fast and tied to real project risks.

## Vercel deployment

Vercel is the agreed static host for the web app. The project connection and first deployment are still pending; local preview remains the fallback until a deployed URL is verified.

Use these Vercel project settings:

- **Root directory:** `web/`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Include files outside the root directory in the Build Step:** enabled

The build runs `sync-data`, which copies `contracts/fixtures/` and `data/public/` from the repository root into `web/public/data/`. Keep Vercel's outside-root file setting enabled so those inputs are available when the root directory is `web/`. The app has no build-time secrets; keep any future credentials out of Git and configure them through Vercel's environment settings only if a requirement needs them.

`data/public/replay/live.json` is gitignored, so it is not included in a Vercel deployment. The hosted site therefore serves the committed replay days only; R-8 live mode is not available there with this setup. A hosted live mode needs a separate, approved way to publish snapshots to a fetchable location. Until then, local preview can show live data only on a machine where the lane A poller has generated `live.json`; otherwise use the committed replay.

Connect the Vercel project to this repository and deploy from `main` after the project owner provides access. Verify that the deployment serves the built app and its committed replay JSON data before sharing its URL. Do not claim a public deployment until this check passes.

## CI and recovery

Keep the existing pull request checks fast and tied to project risks. A failed or unavailable deployment must not block the offline demo: use `npm --prefix web run preview` with committed JSON data. Record changes to CI or deployment behavior in `PRD.md` and this guide.
