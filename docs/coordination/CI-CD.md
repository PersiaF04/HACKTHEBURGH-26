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

## Deployment is pending

Automated deployment is not configured. The target (for example GitHub Pages) and its trigger are pending the owner's decision. Once approved, add a deployment workflow that runs only after the agreed CI checks pass, keeps any credentials in GitHub Actions secrets or environments, and has a documented rollback or demo fallback. Record the target and trigger in the PRD before enabling it.
