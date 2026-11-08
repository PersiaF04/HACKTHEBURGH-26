# Backlog

Items below are deferred or removed. None of them is built, and none is
planned for the hackathon build. Treat each as a todo for after the event, and
confirm scope with the product owner before starting any of them.

## Stretch features (PRD section 5, "Stretch")

- [ ] **F8 Concept trend forecast.** Show paper share over time with an 80%
  interval against a naive forecast. Source: PRD.md, F8. Deferred because it is
  a stretch feature and is on the PRD "cut first" list.
- [ ] **F9 Research-question generator.** A local LLM drafts three questions for
  a gap from retrieved abstracts, with each sentence checked against source
  text (grounding check). Source: PRD.md, F9. Deferred because it needs a local
  model and a grounding check that is not yet specified in code, and it is on
  the "cut first" list.
- [ ] **F10 Start from my paper.** Paste an abstract to find nearby concepts and
  adjacent gaps (abstract to nearest concepts). Source: PRD.md, F10. Deferred
  as a stretch feature on the "cut first" list.
- [ ] **F12 Build-on readiness.** Show last-commit date and stars only if a
  separate source is approved, precomputed and validated. Source: PRD.md, F12.
  Deferred because no such source has been approved.

## Removed from scope

- [ ] **Time slider (F2).** Removed at Varshil's request because the approved
  design has no slider; the map shows the latest snapshot year. It could return
  if the product owner wants it. Source: PRD.md, F2.

## Open items from the build

- [ ] **Hybrid semantic and keyword search (F3).** Needed only if the pipeline
  does not deliver it; search is a placeholder in the frontend today. Source:
  PRD.md, F3.
- [ ] **Real-GPU 3D performance verification.** Frame rate and interaction
  smoothness of the map have not been measured on real GPU hardware. Source:
  PRD.md, performance targets ("None of these targets is met until measured").
- [ ] **Accessibility audit and mobile polish.** No audit has been done, and the
  layouts have not been tuned for small screens.
