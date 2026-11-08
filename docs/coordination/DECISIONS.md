# Decision log

Record only decisions that materially affect product scope, architecture, user experience, dependencies, data, or shared interfaces. Skip routine implementation choices. Add a new entry when a decision changes so there is a short history of why.

## Entry template

### D-XXX: Decision title

- **Date / status:** YYYY-MM-DD / Proposed, Accepted, or Superseded
- **Decision owner / agreed by:** Names
- **Context:** Why is a decision needed?
- **Options:** What realistic alternatives were considered?
- **Decision:** What did the team choose?
- **Consequences:** What does this enable or constrain?
- **Related task / PRD section:** Link

---

### D-001: Earlier product direction (superseded)

- **Date / status:** 2026-11-07 / Superseded
- **Decision owner / agreed by:** Persia (product owner)
- **Decision:** The first product direction was replaced by Whitespace. See [`PRD.md`](../../PRD.md). The earlier implementation remains in Git history and closed pull requests.

### D-002: Use Vercel for the static web deployment

- **Date / status:** 2026-11-07 / Accepted
- **Decision owner / agreed by:** Persia (product owner)
- **Context:** The app needs a shareable static deployment for the demo; the earlier GitHub Pages proposal in #50 was dropped.
- **Options:** GitHub Pages, Vercel, or local preview only.
- **Decision:** Use Vercel for the static app, deploying from `main` after the project is connected. Set the project root to `web/`, build with `npm run build`, and publish `dist`.
- **Consequences:** The web shell has no data-sync step; it builds from `web/` alone. The Vercel connection is pending; this decision does not claim a deployed URL exists.
- **Related task / PRD section:** #50; PRD section 12

### D-003: Show author-stated open problems on a dedicated Open Problems page

- **Date / status:** 2026-11-08 / Accepted
- **Decision owner / agreed by:** Persia (product owner; he/him)
- **Context:** F5 placed authors' stated open problems inside the gap detail. The frontend integration (#228, PR #229) gives the app a dedicated Open Problems tab, and the current export has no such sentences: `open-problems.json` is a placeholder and gap details carry empty `open_problems`.
- **Options:** (A) show open problems only on the Open Problems page; (B) keep them in the gap detail as well.
- **Decision:** Option A. Author-stated open problems live on the Open Problems page (F6), not in Gap Finder or gap detail.
- **Consequences:** Gap detail shows score breakdown, closest papers and shared neighbours only. Until sentences are extracted from abstracts, the Open Problems page shows “not available yet”; nothing is fabricated or filled with demo content. Evidence (F7) and Code coverage (F11) stay reachable through the footer link and direct routes, as in #229.
- **Related task / PRD section:** #228, PR #229, #235; PRD F5, F6

### D-004: The research map is 3D-only with no time slider

- **Date / status:** 2026-11-08 / Accepted
- **Decision owner / agreed by:** Persia (product owner; he/him), following Varshil's earlier request to remove the slider
- **Context:** The map had a 2D view and a time slider (F2, already removed). #213 and #220 deliver a 3D-only map with Top-down, Front and Reset camera controls.
- **Options:** 3D-only; keep a 2D fallback view.
- **Decision:** 3D-only map, no 2D view, no time slider. The map shows the latest snapshot year.
- **Consequences:** One map renderer to build, test and explain; the on-canvas guidance, legibility, accessibility and reduced-motion handling stay. Users who cannot use 3D have no 2D alternative.
- **Related task / PRD section:** #213, #220, #124, #235; PRD F1, F2
