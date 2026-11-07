# Ask the Grid

A chat panel backed by the serverless function `web/api/ask.ts`. The model words answers; eight read-only tools
(`web/api/_lib/tools.ts`, a TypeScript port of `models/ask_golden.py`) supply every number from the committed
JSON, and each answer lists the tools and source files it used.

## Mounting (lane C)

`AskTheGrid` is exported but not mounted. In a screen, add:

```tsx
import { AskTheGrid } from "../ask/AskTheGrid";

<AskTheGrid />
```

It takes an optional `endpoint` prop (default `/api/ask`). It needs no data props and fails soft: if the
function is missing, unconfigured or slow, it shows a short message and nothing else on the page changes.
`npm run dev` serves no `/api` route, so use `vercel dev` (run in `web/`) or the deployed site to try it.

## Setup

- Set `ANTHROPIC_API_KEY` in the Vercel project (Environment Variables). Never commit it or expose it to the client.
- Vercel project root stays `web/`; `web/vercel.json` bundles `public/data/**` (written by `sync-data` during the build) with the function.

## Checks

`npm --prefix web run test:ask` type-checks `web/api` and runs every golden question's tool calls
(`contracts/fixtures/ask-golden.json`, issue #91) against the tools with no LLM. The golden tests skip until that file is on the branch.

Optional: set `ANTHROPIC_MODEL` in the Vercel environment to use a different model ID. The default is `claude-sonnet-5-5`; check it against the current Anthropic model list with one live request before the demo, because no live call has been run from this repo.
