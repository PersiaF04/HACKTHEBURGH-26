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

### D-003: Keep author-stated open problems in the gap detail as a compact collapsed section, linked to the Open Problems page

- **Date / status:** 2026-11-08 / Accepted (supersedes the earlier page-only wording)
- **Decision owner / agreed by:** Persia (product owner; he/him)
- **Context:** F5 placed authors' stated open problems inside the gap detail, and the app gained a dedicated Open Problems tab (#228, PR #229). User clarification: the complaint was visual clutter from a large card, not removing the feature. The current export has no such sentences: `open-problems.json` is a placeholder and gap details carry empty `open_problems`.
- **Options:** (A) Open Problems page only; (B) restore the large card in the gap detail; (C) a compact collapsed disclosure in the gap detail plus a link to the Open Problems page.
- **Decision:** Option C.
- **Consequences:** F5 is retained. The detail panel shows a compact, collapsed “Author-stated open problems” evidence section with a link to the Open Problems page for full reading and filters; with no export data it shows “Author-stated open problems are not available in this export yet.” and nothing is fabricated. The Evidence and Code coverage footer links are unchanged. Delivered as one small UI PR into the #229 stack.
- **Related task / PRD section:** #228, PR #229, #235; PRD F5, F6

### D-004: The research map is 3D-only with no time slider

- **Date / status:** 2026-11-08 / Accepted
- **Decision owner / agreed by:** Persia (product owner; he/him), following Varshil's earlier request to remove the slider
- **Context:** The map had a 2D view and a time slider (F2, already removed). #213 and #220 deliver a 3D-only map with Top-down, Front and Reset camera controls.
- **Options:** 3D-only; keep a 2D fallback view.
- **Decision:** 3D-only map, no 2D view, no time slider. The map shows the latest snapshot year.
- **Consequences:** One map renderer to build, test and explain; the on-canvas guidance, legibility, accessibility and reduced-motion handling stay. Users who cannot use 3D have no 2D alternative.
- **Related task / PRD section:** #213, #220, #124, #235; PRD F1, F2
