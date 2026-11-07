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
