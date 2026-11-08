# Whitespace

Whitespace is a research-discovery tool for AI/ML literature. It looks for ideas that nobody has combined yet and asks which of those combinations are likely to appear soon. It was started at HackTheBurgh XIII (repository name: `HACKTHEBURGH-26`).

**Status:** under active development. Whitespace is the selected project direction (see [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122)). The pipeline scaffold is in place; the product features, full corpus and forecast evaluation are still in progress. No forecast result exists yet.

**Deployment:** the existing Vercel project has been renamed and configured for Whitespace. The Whitespace frontend has not been deployed yet; the previous production deployment remains live until the replacement is built and verified. Track deployment at [#135](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/135). Add a Whitespace URL here only after it is verified.

## What Whitespace does

Whitespace turns a historical paper corpus into a concept graph that changes over time. It aims to show three things:

- **Forecasts of unlinked concept pairs.** Which pairs of AI/ML concepts that are not yet linked by the product's co-occurrence rule will co-occur in three or more papers within three years. A pair with fewer than three prior co-occurrences counts as "not yet established", not "never studied".
- **Author-stated open problems.** Limitation, future-work and open-problem statements, grouped by concept and linked to the papers they came from.
- **A code-coverage lower bound.** Which papers have a linked code repository in the archived Papers with Code data. A missing link means none was found in that archive, not that no code exists.

## Who it helps

- PhD and MSc students choosing a thesis or dissertation topic.
- Researchers who want to spot emerging directions and avoid saturated ones.
- Lab leads and supervisors deciding which directions to pursue or recommend.

## Planned features

All features below are **planned**. None is built yet. The list summarises the MVP and stretch features in [`PRD.md`](PRD.md), which is the source of truth.

- Research map of roughly 3,000 to 6,000 concepts, with a time slider.
- Paper and concept search.
- Gap finder and gap detail: ranked unlinked pairs with a score breakdown, supporting papers and shared neighbours.
- Open-problems explorer.
- Code coverage view by concept and year.
- Evidence page showing the evaluation results against every declared baseline, once they exist.
- Stretch: concept trend forecast, a local research-question generator, and "start from my paper".

## Data and licensing

- **OpenAlex.** Paper metadata is planned to come from OpenAlex, whose records are CC0 per the [OpenAlex API overview](https://docs.openalex.org/how-to-use-the-api/api-overview). Third-party sources reached through OpenAlex may carry separate restrictions, so CC0 on the metadata does not settle rights over everything it points to.
- **Papers with Code archive.** Code links are planned to come from the [Papers with Code archive on Hugging Face](https://huggingface.co/datasets/pwc-archive/links-between-paper-and-code). It is licensed `cc-by-sa-4.0`, has 300,161 rows, and is a snapshot retrieved on 28 July 2025. It will not be updated, so papers after about mid-2025 will look unlinked. Any use of it must credit Papers with Code and follow the share-alike terms.
- **Abstracts.** Raw abstracts are not redistributed in this repository or in public artifacts.

## Evaluation approach (plan)

This is the planned protocol. **No result exists yet**, and nothing here should be read as a measured or expected performance.

- **Purged temporal split.** Fit origins through 2014, calibration at 2017, and a test origin of 2020 with outcomes in 2021 to 2023. The gaps keep each split's outcome window from overlapping the next split's data.
- **Population.** All eligible candidate pairs, not a sampled subset.
- **Reported numbers.** The base rate (the share of eligible pairs that link within three years), precision@k and PR-AUC, beside ROC-AUC and calibration.
- **Comparison.** The model is compared against the strongest declared baseline on the same pairs. Baselines include current co-occurrence weight, degree product, preferential attachment, Adamic-Adar and cosine similarity. If the model does not beat the strongest baseline, that will be reported.

The test is to be run once, after the design and data snapshot are frozen. Details and open decisions are in [`PRD.md`](PRD.md) and [issue #122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122).

## Limitations

- Co-occurrence is not importance or truth. A concept pair that appears together is not thereby a good idea or a correct one.
- OpenAlex topic assignments are not labels known at each historical date. OpenAlex [switched to a new topic classifier in October 2026](https://help.openalex.org/data/topics/): the topics did not change, but which works are assigned to them did, and the assignments come from each work's title, abstract and source name. The old assignments were frozen on 5 October 2026 and stay available only until 13 January 2027. The PRD pins one vintage, so topic-based features need care to avoid leakage.
- A missing code link means no link was found in the Papers with Code archive. It does not mean the paper has no code.
- Concept-pair forecasting is prior art, not a new idea. For example, Krenn et al., [arXiv:2210.00881](https://arxiv.org/abs/2210.00881), frame AI research directions as link prediction on a semantic network.

## Stack

The stack is **proposed** in [`PRD.md`](PRD.md) section 10. It has not been verified or built, and the PRD requires each dependency to be checked before use.

| Layer | Proposed technology |
| --- | --- |
| Pipeline | Python 3.11, Polars, DuckDB, NetworkX or igraph, LightGBM, scikit-learn, UMAP |
| NLP | all-MiniLM-L6-v2 (or SPECTER2 on available GPU), KeyBERT, facebook/bart-large-mnli |
| Search | FAISS and BM25, combined with reciprocal rank fusion |
| API | FastAPI, uvicorn |
| Web | React, TypeScript, Vite, Tailwind, deck.gl, Recharts, Zustand |

## Running locally

There are no verified run instructions for Whitespace yet. This section will be filled in once the reset in [#136](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/136) lands and the commands have been run.

## Repository layout

Folders currently on `main`. Some still hold earlier-project code that is being removed.

| Folder | Contents |
| --- | --- |
| `docs/` | Coordination docs and the decision log |
| `scripts/` | Helper scripts, including the team inbox check |
| `.github/` | Issue templates and workflows |

The remaining folders (`web/`, `pipeline/`, `models/`, `contracts/`, `data/`) belong to the earlier project and are scheduled for removal or replacement in [#136](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/136).

## Contributing

- Read [`TEAMWORK.md`](TEAMWORK.md) for the quickstart and [`AGENTS.md`](AGENTS.md) for the working agreement, which applies to people and AI agents alike.
- Read [`PRD.md`](PRD.md) for requirements and [issue #122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122) for the research spike and its evidence.
- GitHub Issues are the work queue: one issue per change, one branch per issue, and a pull request to `main` with `Closes #<issue>`. Do not work directly on `main`.

## Team

The human team owns the product idea, requirements, issue triage, priority and merge decisions. Each work issue and branch has one directly responsible developer. Claude Code agents implement assigned issues and Codex agents review pull requests, as set out in [`AGENTS.md`](AGENTS.md). The PRD names the product owner.

## AI-use disclosure

This project was built with AI coding agents. Claude Code agents wrote code and documentation, and Codex agents reviewed it, under human decisions on scope and merging.

## Licence

Not selected. The repository has no `LICENSE` file and the owner has not made a decision, so treat the code as not licensed for reuse until one is added.
