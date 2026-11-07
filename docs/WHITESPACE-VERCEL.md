# Whitespace Vercel preview

The Whitespace frontend is a static Vite single-page app. The Vercel project should use these settings:

| Setting | Value |
| --- | --- |
| Project root | `whitespace/web` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Runtime | Static files; no server or live external API calls |

`whitespace/web/vercel.json` rewrites client-side routes to `/index.html`, so direct visits and refreshes at `/gaps`, `/open-problems`, `/evidence`, and `/coverage` load the SPA. Vercel's [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas) documents this fallback.

The current frontend imports JSON fixtures from `mock/` at build time and labels them as placeholders. They are bundled with the static app; this preview does not contain real corpus, forecast, backtest, or code-coverage results. When frozen artifacts are available, place public JSON files under Vite's `public/` directory (or update the typed client to their agreed static paths) and verify those URLs in the preview before changing the README's deployment status.

The Vercel project does not need a Git integration for a one-off preview. From the linked local project directory, run:

```sh
cd whitespace/web
vercel link
vercel deploy
```

At the link prompt, select the authorized team and existing `whitespace` project.

`vercel deploy` creates a preview by default; do not add `--prod`. A preview URL must be checked for the root page, each client-side route (including direct refresh), the generated asset files, and any published JSON paths. Keep the existing production alias on its previous deployment until the product owner approves cutover. Do not commit Vercel credentials or project tokens. See Vercel's [CLI deployment guide](https://vercel.com/docs/projects/deploy-from-cli).
