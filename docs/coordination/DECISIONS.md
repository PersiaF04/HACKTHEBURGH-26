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

### D-001: Build "Turn Up Scotland" as a static web app over a JSON contract

- **Date / status:** 2026-11-07 / Accepted
- **Decision owner / agreed by:** Persia (product owner). Varshil and sanamorii to confirm on #26.
- **Context:** Spikes #19–#25 compared seven candidate ideas. #25 validated "Where Did the Wind Go?" with keyless public data, and three developers must build in parallel within 24 hours.
- **Options:** #19 (finance alternate realities), #20 (university planner), #21/#25 (wind curtailment), the #22 shortlist (dark ships, Pre-echo and others), #24 (TV pickup).
- **Decision:** Build #25 as "Turn Up Scotland". Python pipeline and models write contract JSON to `data/public/`, and a React + Vite + TypeScript static app reads it. There is no bespoke API server for P0.
- **Consequences:** Lanes work in parallel against `contracts/` with fixtures. Offline replay is built in, so the demo doesn't depend on venue Wi-Fi or windy weather. Live mode and Tiger Data are P1.
- **Related task / PRD section:** #26; PRD sections 5, 10 and 13
