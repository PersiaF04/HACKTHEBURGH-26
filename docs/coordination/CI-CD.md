# CI and delivery

## What is in place

GitHub Actions runs these checks on pull requests targeting `main` and on pushes to `main`:

| Check | Workflow | Runs when | What it does |
| --- | --- | --- | --- |
| Markdown lint | `.github/workflows/ci.yml` | every PR and push | `markdownlint-cli2` over `**/*.md` |
| Web build | `.github/workflows/ci.yml` | every PR and push | `npm --prefix web ci` then `npm --prefix web run build` |
| Whitespace tests | `.github/workflows/whitespace.yml` | `whitespace/**` or the workflow changes | `python -m pytest -q whitespace` (Python 3.11) |

The Whitespace workflow uses a path filter, so it only runs when the pipeline changes. Keep checks fast and tied to real project risks.

`scripts/check-old-project.sh` fails if terms from the earlier product reappear in tracked files outside its allow-list. It is not wired into CI; run it by hand before a release or after a large merge.

## Vercel deployment

Vercel is the agreed static host ([D-002](DECISIONS.md)). Deployment is tracked in [#135](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/135). Deploy a preview first; the production URL changes only after the product owner approves the preview.

The app has no build-time secrets. Keep any credentials out of Git and configure them only through Vercel's environment settings.

## CI and recovery

A failed or unavailable deployment must not block the offline demo: build the web app locally and run `npm --prefix web run preview`. Record changes to CI or deployment behavior in this guide.
