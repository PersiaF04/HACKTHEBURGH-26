# Product requirements and technical specification: Whitespace

> **Status:** Spike / project reset in progress. **Product owner:** Persia (PersiaF04).
> **Updated:** 2026-11-07. This PRD replaces the former Turn Up Scotland product direction.
> **Evidence and open decisions:** issue #122. Targets below are not results until measured.

## 1. Summary

Whitespace is a research-discovery tool for AI/ML literature. It turns a historical paper corpus into a concept graph that changes over time. It aims to predict which concept pairs not yet linked by the product's co-occurrence rule will become linked within three years, and to surface open-problem statements from abstracts. Predictions must be evaluated out of sample before being presented as useful forecasts.

The product also shows which papers have linked code, using the archived Papers with Code paper-to-code data. That coverage is a lower bound: the archive is incomplete and historical, and a missing link does not prove that no implementation exists.

**One-liner:** “See where research is going, and the questions nobody has answered yet.”

## 2. Problem

- **Too much to read:** researchers cannot keep up with the volume and pace of new literature.
- **Search only finds what exists:** ordinary search does not rank combinations that are not yet connected in observed literature.
- **Open problems are scattered:** authors state limitations and future work across many abstracts; these are difficult to aggregate.
- **Code coverage is hard to see:** paper-to-repository links are incomplete and scattered, making it difficult to identify areas where published work has little linked code.

## 3. Users

| User | Need |
| --- | --- |
| PhD / MSc student | Choose a novel, timely thesis or dissertation topic |
| Researcher | Spot emerging directions and avoid areas that are already saturated |
| Lab lead / supervisor | Decide which directions to pursue or recommend |

## 4. Goals and success measures

| Goal | Metric | Target / reporting rule |
| --- | --- | --- |
| Accurate predictions | Precision@100 on a purged 2020 → 2021–2023 temporal backtest | Beat the strongest specified baseline by a clearly reported margin; report honestly if it does not. Report results separately for pairs starting at weights 0, 1 and 2 |
| Trustworthy probabilities | Calibration and proper scores on the full eligible candidate population | Close to diagonal; show base rate and PR-AUC as well as ROC-AUC |
| Useful research guidance | Ranked gaps with score components and supporting papers | Return top 50 in under 1 second after artifacts load |
| Reliable demo | Precomputed artifacts | No live external calls during judging |
| Correct code links | Precision of paper-to-repository matching on 100 hand-checked pairs | At least 90/100 in this sample; report a binomial uncertainty interval and state that the check measures precision, not recall |

None of these targets is met until measured and recorded.

## 5. Features

| ID | Feature | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| F1 | Research map | MVP | About 3,000–6,000 concepts in a 3D-only view (no 2D map and no time slider), sized by paper count and coloured by growth; smooth orbit and zoom (D-004) |
| F2 | Time slider | Removed | Removed from scope at Varshil's request: the approved design has no slider; the map shows the latest snapshot year; year-scoped `map-<year>.json` files are not needed by the UI |
| F3 | Paper and concept search | MVP | Hybrid semantic and keyword search returns papers and concepts; map moves to the result |
| F4 | Gap finder | MVP | Rank unlinked pairs with P(link), interval, momentum, novelty, stated-gap rate and gap score; filter by area and minimum P |
| F5 | Gap detail | MVP | Show score breakdown, three closest papers on each side and shared neighbours; authors' stated open problems are shown on the Open Problems page (F6), not in the gap detail (D-003) |
| F6 | Open-problems explorer | MVP | Dedicated Open Problems page (D-003). For each concept, show stated-gap rate over time and “future work,” “limitation” and “open problem” sentences linked to papers. The current export has no author-stated open-problem sentences (`open-problems.json` is a placeholder and gap details carry empty `open_problems`), so until sentences are extracted the page shows “not available yet” and no content is invented |
| F7 | Evidence page | MVP | Show Precision@k against all declared baselines, calibration, base rate, PR-AUC and hits/misses tables; report metrics by starting pair weight |
| F8 | Concept trend forecast | Stretch | Show paper share over time with an 80% interval against a naive forecast |
| F9 | Research-question generator | Stretch | A local LLM drafts three questions for a gap from retrieved abstracts; each sentence is checked against sources and marked grounded or not, with citations |
| F10 | Start from my paper | Stretch | Paste an abstract to find nearby concepts and adjacent gaps |
| F11 | Code coverage view | MVP | Heatmap of concept × year coloured by code_rate with numerator, denominator and archive coverage state; grey out years with inadequate or unavailable archive coverage; clicking a cell lists papers without an archive link |
| F12 | Build-on readiness | Stretch | Show last-commit date and stars only if a separate source is approved, precomputed and validated; otherwise show archive-provided links without staleness claims |

## 6. Non-goals

- Startup, hackathon-project or commercial data.
- Full-text PDF parsing or fields outside AI/ML literature.
- User accounts or saved state.
- Live ingestion or external calls during judging.
- Paid APIs.
- Claims that a missing Papers with Code link proves no implementation exists.

## 7. Main user flow

1. Search a research area or paste an abstract.
2. The map moves to that area. Open a concept to see its trend.
3. Open Gap Finder for that area and select a highly ranked pair.
4. Read its score breakdown and supporting papers; open the Open Problems page for authors' stated open problems.
5. Optionally draft research questions, then open Evidence to see the backtest and calibration.
6. Open Code Coverage to inspect linked-code coverage, its historical limits and the sampled link-precision check.

## 8. Assumptions, risks and open questions

| Assumption / risk | Impact if wrong | Treatment |
| --- | --- | --- |
| A “link” means co-occurrence in at least three papers | Proxy may not represent ideas being studied together meaningfully | State the operational definition and test sensitivity to alternative thresholds |
| Sampling on current citations leaks future attention | Current citation counts include attention after historical prediction origins | Do not sample or rank historical training data by current citations. If subsampling is needed, use a seeded random or year-stratified sample and record it in the frozen manifest |
| Keyword phrases are noisy and incomplete | Concept labels and links may be unreliable | Use normalised keyword phrases as concepts, merge near-duplicates, and use pinned OpenAlex topics only as fallback where keywords are missing; compare coverage before fixing the vocabulary |
| Future leakage | Vocabulary, embeddings, graph structure or labels can encode future knowledge | Rebuild each snapshot from data available by T; purge overlapping three-year label windows; audit feature timestamps |
| Candidate subsampling changes probabilities | A 10:1 negative sample can inflate probabilities and distort metrics | Calibrate and evaluate on all eligible candidates, or apply and document a valid sampling correction |
| Papers with Code coverage is incomplete and historical | A “no code” statement can be false | Treat code_rate as a lower bound, identify archive snapshot date, and say “no linked code in this archive” |
| Paper-to-code matching can be wrong | False links undermine the code-coverage view | Prefer DOI/arXiv identifiers; validate title fallback on a stratified sample of 100 pairs and report precision |
| OpenAlex access, topic IDs, quota and terms may change | Collection may fail or exceed limits | Verify official API docs/terms in spike #122 before ingestion; keep credentials out of Git |
| Topic labels and metadata can be revised after a paper's publication | Rebuilding a graph from publication years does not recreate what was known at T | Pin the topic-assignment vintage and downloaded records. Mark current topic labels as exogenous, not historically as-of. Exclude mutable fields such as current citation counts from historical features; document field-level availability |
| Public artifacts may redistribute abstract text | OpenAlex metadata license does not automatically settle third-party text rights | Keep raw abstracts out of Git and public artifacts. Attribute papers; publish only short, linked open-problem excerpts after source-terms review, otherwise show the paper link and extracted label without the sentence |
| Compute and model stack may exceed event budget | Full corpus or NLP models may not finish in time | Time-box ingestion and embedding checkpoints; use the cut order in Part C |
| Code-freeze timing | Last-minute changes could invalidate the frozen test and submission | Product owner set the internal code freeze to 10:30 UTC on Sunday 8 November 2026. Freeze code, data and configuration before the single held-out evaluation run |

## Part B: technical specification

## 9. Architecture

OpenAlex → ingest → papers.parquet

- → embed (MiniLM) → FAISS
- → concepts → yearly co-occurrence graphs
- → open-problem mining (regex + BART-MNLI)
- → features → LightGBM link model → backtest → gap score
- → precomputed Parquet and JSON artifacts
- → read-only FastAPI (DuckDB, FAISS in memory)
- → React + Vite + deck.gl UI
- → optional local Ollama for questions

All judging paths use precomputed artifacts. The optional LLM feature is local and stretch; it is not on the MVP critical path.

## 10. Stack

| Layer | Proposed technology |
| --- | --- |
| Pipeline | Python 3.11, Polars, DuckDB, NetworkX or igraph, LightGBM, scikit-learn, UMAP |
| NLP | all-MiniLM-L6-v2 (or SPECTER2 on available GPU), KeyBERT, facebook/bart-large-mnli |
| Search | FAISS IndexFlatIP and BM25, combined with reciprocal rank fusion |
| Optional LLM | Ollama qwen2.5:7b-instruct; nli-deberta-v3-small to check output |
| API | FastAPI, uvicorn |
| Web | React, TypeScript, Vite, Tailwind, deck.gl, Recharts, Zustand |

The spike must verify each proposed model and dependency can be installed and run within available hardware and event time. Do not add every proposed dependency before its lane is approved.

## 11. Data ingestion

- **Proposed endpoint:** GET [api.openalex.org/works](https://api.openalex.org/works).
- **Proposed filter:** primary topic subfield 1702 (Artificial Intelligence), publication year 2010 onward, article, preprint and conference-paper types, and abstract availability. Pre-2015 records are required to provide multiple fit origins for the 2020 backtest; the map shows only the latest snapshot year. A live check confirmed subfield 1702 is Artificial Intelligence. This selects works currently assigned that primary subfield; do not describe it as all AI/ML literature. Freeze the exact filter, type scope and retrieval date with each dataset snapshot.
- **Proposed fields:** id, title, publication year/date, cited-by count, abstract inverted index, keywords, primary topic and topics. Current citation counts may be collected as metadata, but are not valid historical features or sampling criteria.
- **Proposed query:** cursor pagination and up to 100 records per page. The API maximum is 100; do not assume 200 is allowed.
- **Live estimate from 7 Nov 2026:** the article/preprint filter returned 717,139 works across 2015–2026 (including partial 2026); 529,502 through 2025. This is not the final corpus size: the selected scope starts in 2010 and conference papers are important in AI/ML, while that type was excluded from this count. Re-count the agreed year and work-type scope before setting corpus size; do not retain the initial ~180,000 estimate without measurement. Counts move with the service and topic assignments. Capture the exact query, retrieval date and result count in the artifact manifest.
- Basic OpenAlex queries are available without a key. A free verified key currently provides a $1 daily API budget; at the documented per-call price this is roughly 10,000 list calls, subject to request-rate and result limits. Separately, ordinary page-number paging is limited to the first 10,000 results, and a key is needed to cursor-page beyond that. Verify current budgets, prices and rate limits before downloading; do not conflate requests with results.
- Cursor paging is limited to 100 records per request. At the article/preprint estimate, API paging is thousands of requests; compare the official snapshot for bulk ingestion and respect OpenAlex guidance against large cursor downloads.
- For bulk data, compare the API with the official OpenAlex snapshot. Do not plan a large cursor download without checking current service guidance and quota.
- Rebuild abstracts from the inverted index, drop abstracts under 50 words, and checkpoint Parquet files.
- OpenAlex records are CC0 per the current API overview. Verify current API key requirements, quota, endpoint pricing, rate limits, reuse terms and topic ID from official OpenAlex sources. Never put an API key in Git or shared messages.
- Artifact manifest must include the complete query, filters and work-type scope; retrieval date and snapshot/topic-assignment vintage; input-file hashes; exact source/version for embeddings and classifier weights; deduplication and abstract reconstruction rules; random seeds; and which feature fields are genuinely available as of each prediction origin. Current citation counts or current topic assignments are not historical snapshots merely because the associated paper is old.
- Avoid relying on the search endpoint until current pricing and behavior are verified.

## 12. Data model (artifacts/)

| File | Columns / contents |
| --- | --- |
| Local-only `papers.parquet` | id, year, date, title, abstract, cites, keywords[], topic_id; raw abstracts are excluded from Git and public artifacts |
| paper_emb.npy, faiss.index | 384-dimensional normalised embeddings |
| concepts.parquet | concept_id, label, first_year, n_total, embedding, x, y |
| paper_concepts.parquet | paper_id, concept_id |
| counts.parquet | concept_id, year, n_papers, share |
| edges.parquet | a, b, first_linked_year, n_cooccur_by_year |
| open_problems.parquet | paper_id, concept_ids[], short attributed excerpt when permitted, type, confidence; never distribute raw abstracts |
| predictions.parquet | a, b, p_link, p_lo, p_hi, momentum, novelty, gap_rate, gap_score |
| forecast.parquet | concept_id, year, yhat, lo, hi (stretch) |
| metrics.json | Counts for the eligible pair universe and generator shortlist; ROC-AUC, average precision, Precision@k, base rate, calibration bins and hits/misses by starting weight 0/1/2 and aggregate; per-baseline results |
| paper_code.parquet | paper_id, arxiv_id, repo_url, is_official, match_method (DOI or title); last_commit and stars only if separately sourced |

## 13. Pipeline and evaluation

### Concepts and graphs

- Per the owner brief, use normalised keyword phrases as the primary concepts and pinned OpenAlex topic IDs only as a fallback when usable keywords are absent. Merge near-duplicates when cosine similarity exceeds 0.92. Keep concepts with at least 30 papers, targeting 3,000–6,000 concepts. This definition and the topic-assignment vintage must be recorded in the manifest before the 00:30 corpus freeze.
- A concept embedding is the mean of its paper embeddings.
- Build cumulative graph G_T using only eligible papers available at snapshot T.
- An edge becomes linked once the pair co-occurs in at least three papers.
- Recompute vocabulary, concepts, embeddings and graphs from papers available by each snapshot T. Do not use a vocabulary learned from later years.
- Freeze/deduplicate paper versions and state the corpus sampling frame. Current OpenAlex topic assignments may not represent labels known at historical T. The frozen v1 assignments are a current taxonomy snapshot, not historically as-of labels; pin its 5 Oct 2026 vintage and the classifier version, whose documented availability currently ends 13 Jan 2027.

### Candidates and features at snapshot T

- The proposed production candidate generator is two-hop neighbours plus each concept's 50 nearest embedding neighbours, excluding pairs already linked at T. The primary evaluation population is the full eligible pair universe: all pairs of concepts meeting minimum support at T where both concepts exist and pair weight is below three.
- With the operational edge threshold of three co-occurrences, candidate pairs with 0, 1 or 2 co-occurrences at T remain eligible. Report these strata separately: a pair with weight 1 or 2 is not an established edge, and its label is whether it first crosses the threshold during the forecast horizon. Audit how this choice changes the base rate and popularity-baseline rankings before fixing the headline metric.
- Sample negatives 10:1 for training only. Fit calibration and calculate all primary test metrics on the full eligible pair universe, not on the generator's shortlist or sampled training set. Apply the same universe to the model and every baseline. Report candidate-generator recall separately; if full-universe evaluation cannot be completed, report the limitation and do not claim full-population calibrated probabilities.
- Proposed features: degree and three-year growth; common neighbours, Jaccard, Adamic–Adar, resource allocation, preferential attachment; cosine similarity; path length capped at 4; concept age; paper-count growth; gap rate.
- Audit each feature for publication-time availability. A feature derived from a later snapshot must not enter an earlier prediction.
- Measure candidate recall as the share of all future-positive pairs in the eligible pair universe included by the production candidate generator. The full universe, generator shortlist and their sizes must be recorded in metrics.json.

### Link model and backtest

- Label: for a candidate pair with fewer than three co-occurrences at T, whether it first reaches the three-paper co-occurrence threshold within T+1 to T+3. Pairs with one or two prior co-occurrences are “not yet established,” not “never studied.” Specify whether within-year paper order is available; otherwise the outcome is annual, not event-time.
- The requested test is origin T=2020, with outcomes in 2021–2023. The user has confirmed that the corpus should include pre-2015 data to support this split.
- Purge every split boundary. With inclusive annual outcome windows T+1 through T+3, require `max(T_fit) + 3 <= min(T_calibration)` and `max(T_calibration) + 3 <= min(T_test)`. For a first test origin of 2020, the latest calibration origin is 2017 and the latest fit origin is 2014. Include enough pre-2015 history to provide several fit origins (proposed minimum span 2010–2014); confirm eligible paper counts and disjoint windows before calling the backtest leakage-safe. Record the chosen split and evidence on issue #122.
- The first evaluation origin also constrains concept/model tuning. Freeze and version data, concept extraction, candidate generation and model choices before inspecting the held-out test. Rebuilding snapshot-specific concepts, embeddings and graphs using papers available on or before each origin does not make mutable source metadata historical: use only feature values known at the origin or explicitly label them exogenous/retrospective. Run the held-out test once only after the owner confirms a runnable design and the code/data snapshot are frozen.
- Produce base rate, ROC-AUC, PR-AUC/average precision, Precision@k, calibration and hits/misses on the full eligible pair universe. Compare current co-occurrence weight (0/1/2), degree product, preferential attachment, Adamic–Adar and cosine similarity on this same population. Report base rate and ranking metrics separately for pairs starting at weights 0, 1 and 2, as well as the aggregate.
- Produce top 20 hits with the paper or year in which each pair crosses the threshold, and top 10 misses. If only annual counts are available, do not imply an exact event-time or unique paper caused the threshold crossing.
- Use 20 bootstrap models for p_lo and p_hi only if their interpretation and coverage are validated. State whether intervals describe model uncertainty, temporal variability or another quantity.
- Production scoring may retrain with snapshots through 2023 to score the 2026 graph. This is separate from the held-out backtest and must be labelled.
- If the model does not beat a simple baseline, report that result rather than hiding it.

### Open-problem mining and gap score

- Sentence-split abstracts, then use a regex prefilter for phrases such as future work, remains unclear/open/unexplored, has not been, little is known, limitation, open problem/question, and we leave.
- Apply a zero-shot classifier and keep candidates above confidence 0.6. Before calling this useful, evaluate sentence-level precision and recall on a separately annotated sample, record how disagreements are adjudicated, and link every displayed sentence to its source paper and abstract context. Report measured results; no acceptable threshold has been selected yet.
- Gap rate is the share of a concept's papers that contain a stated open problem.
- Proposed score: p_link × sigmoid(growth_a + growth_b) × (1 − max(cosine, neighbour_overlap)) × (1 + gap_rate_a + gap_rate_b).
- Show every score component next to the score. Do not describe the combined gap score as a probability.
- Show code readiness separately: share of a concept's papers with a linked repository. It is a lower bound and must not be multiplied into gap_score.

### Layout and code layer

- Layout uses a 2D UMAP of concept embeddings; explain that distance is a projection, not a definitive measure of research similarity.
- Load the archived Papers with Code paper-to-code dataset after verifying source, per-file revision/vintage, schema, license and reuse conditions. Its dataset card reports 300,161 rows and a 2025-07-28 snapshot; current hub metadata and repository commit dates differ. Pin the exact revision SHA and inspect each file's maximum dates before stating coverage vintage. The card reports CC-BY-SA-4.0; cite and comply with that license. The distributed artifact and UI must retain appropriate source attribution, the license identifier/link and required notices; review whether any redistributed derived table is an adaptation before release.
- Match papers to repositories using arXiv DOI identifiers when available; title matching is fallback, not proof of identity.
- The selected archived file has 300,161 rows per its dataset card and no last-commit or stars fields. Pin its dataset revision and inspect the actual file. Last-commit/stars require a separate source and are out of scope unless approved.
- For each concept and year, compute code_rate as the share of papers with a linked repository in the archive.
- A dark heatmap cell means low recorded code coverage in this archive, not that no code exists.
- The archive joins by arXiv ID; non-arXiv papers cannot match this source. Display per-year numerator and denominator, and grey out years with low observed coverage or dates outside the pinned archive vintage (the current dump contains no post-28-Jul-2025 coverage). The observed archive is sparse in early years; determine any low-coverage cutoff from the pinned file and show it explicitly.
- Validate precision on a stratified 100-pair sample with a written adjudication rule. Freeze the sample seed and strata (including identifier-based vs title-fallback matches), have reviewers judge whether each paper/repository pair is an identity match using the original paper and repository metadata, and resolve disagreements before scoring. Report sample composition, correct matches, precision and a binomial uncertainty interval on Evidence; this measures precision only, not recall, and is not generalisable beyond this sample design.

## 14. API

| Method | Route | Response |
| --- | --- | --- |
| GET | /api/meta | Year range, counts, headline metrics |
| GET | /api/map?year= | Concept points and predicted edges above a threshold |
| GET | /api/search?q=&k=20 | papers[], concepts[], focus:{x,y} |
| GET | /api/concept/{id} | Counts by year, forecast, top papers, open problems, neighbours |
| GET | /api/gaps?concepts=&min_p=&sort=&limit=50 | Ranked pairs with score components |
| GET | /api/gap/{a}/{b} | Detail, closest papers on each side, shared neighbours, open problems |
| GET | /api/open-problems?concept=&type= | Sentences linked to their papers |
| GET | /api/backtest | Contents of metrics.json |
| POST | /api/questions {a,b} | Streamed SSE research questions, each with grounded status and sources (stretch) |
| POST | /api/from-abstract {text} | Nearest concepts and adjacent gaps (stretch) |
| GET | /api/coverage?year= | code_rate per concept and year, plus dark cells |

Every route except the two stretch POST routes should return in under 300 ms after data structures are loaded.

## 15. Frontend and repository layout

**Routes:** / (Explore), /gaps, /open-problems, /evidence, /coverage. Gap detail opens as a drawer.

**Components:** MapCanvas, SearchBar, ConceptPanel, GapTable, GapDrawer, ScoreBreakdown, OpenProblemList, TrendChart, BacktestCharts, QuestionStream.

**State (Zustand):** year, selectedConcepts, focus, openGap.

Build the web app against web/mock/*.json following the API contract from hour one. No live API is needed for the UI demo.

**Proposed repository layout:**

    whitespace/
      pipeline/ ingest embed concepts graphs features linkpred backtest
                open_problems score umap_layout forecast
      api/      main search questions
      web/      src/{pages,components,store,api.ts} mock/
      artifacts/ Makefile README.md

## Part C: research update (7 Nov)

## 16. Why now

Papers with Code is reported to have shut down in July 2025, with its domain redirecting to Hugging Face Trending Papers. Its final paper-to-code dump is the proposed source for the code layer. The exact shutdown date is not yet confirmed; current site redirects and the public archive is a final snapshot retrieved 2025-07-28. Verify source, schema, license and reuse conditions in issue #122 before making claims.

Existing tools each cover part of the problem: Connected Papers, ResearchRabbit and Litmaps map citation relationships; Elicit, Consensus and Scite support literature search or synthesis; paper pages can link repositories. Whitespace's proposed differentiator is future co-occurrence prediction with a backtest, an open-problem view and historical code coverage. This comparison is a product hypothesis to validate, not a claim that no other tool has similar features.

## 17. Prior art: ERLA (referred to as MAGI in the initial brief)

The official IC Hack 26 entry is titled ERLA. It describes recursively spawned Semantic Scholar research agents, paper summaries, a HaluGate grounding-validation pipeline, and hypothesis generation; the entry claims at least 95% groundedness for summaries that pass. It lists citation-graph traversal as future work. The project repository is [e24z/ic_hack_26](https://github.com/e24z/ic_hack_26), which currently has no declared license; do not reuse its code without permission. Implementation and performance claims beyond the Devpost and repository are unverified. The proposed distinction is temporal link prediction with an out-of-sample evaluation and a code-coverage view—a difference in emphasis, not a claim ERLA could never add these features. F9's grounding check is related; credit ERLA accurately.

**Proposed pitch line:** “ERLA explores literature with hallucination-checked summaries. We forecast where research is heading, backtested, and show where it has no code.” In product copy qualify the last phrase as “no linked code in this archive.”

## 18. Framing by track

- **HRT:** the supplied brief names “Best Use of Data for Predictions & Decision Making.” The official HackTheBurgh XIII site does not confirm the exact track prompt; verify it with the sponsor/workshop before using it as official wording. Lead with the decision (“which gap should I spend my thesis on?”), time-split backtest and calibration.
- **G-Research:** the supplied brief names “Make the invisible visible.” The official HackTheBurgh XIII site does not confirm the exact track prompt; verify it with the sponsor/workshop. Lead with the map and coverage view.
- Use the same evidence and limitations for both tracks; change the opening framing, not the facts.

## 19. Evaluation additions

- Report the base rate (share of eligible candidate pairs that link within three years) beside every ranking metric.
- Report PR-AUC/average precision as well as ROC-AUC because positives are expected to be rare.
- Headline evidence: Precision@100 against current co-occurrence weight, degree product, preferential attachment, Adamic–Adar and cosine on the same full eligible pair universe; calibration; code-link precision on the declared 100-pair sample; and a computed coverage fact, such as the share of fastest-growing concepts since 2020 with no linked code in the archive.
- If results do not beat a baseline, report that plainly.

## 20. Timeline and checkpoints

The supplied Part C plan begins 21:30 Saturday and targets Sunday's 12:00 submission deadline. The official HackTheBurgh itinerary says hacking begins Saturday at 12:00 and submissions close Sunday at 12:00. The product owner set the internal code freeze to **10:30 UTC on Sunday 8 November 2026**. Freeze code, data and configuration before the single held-out test. The event Code of Conduct says only work built during the official hackathon period is eligible for prizes and requires disclosure of AI use and pre-existing code or external contributions.

| Checkpoint | Pipeline / ML | Backend | Frontend / pitch |
| --- | --- | --- | --- |
| 21:30–00:30 | Get OpenAlex API key; ingest; embeddings; concepts | Load Papers with Code dump; code join; mock JSON for each route | Map on mock data |
| 00:30 | Freeze the measured corpus size and year/type scope in the manifest. Any reduction must retain enough pre-2015 fit origins for the purged 2020 test; do not cut to 2018–2026 and still claim that backtest. If the split is infeasible, return to the owner with evidence before changing it. | — | — |
| 00:30–03:00 | Yearly graphs, candidates, features; first LightGBM and baselines | FastAPI routes on real artifacts; open-problem mining | Gap finder, gap detail |
| 03:00 | Use only the 2017 calibration-origin comparison (outcomes 2018–2020) for the go/no-go: if the model does not beat the strongest declared baseline, lead with calibration and map; do not inspect 2019 or held-out test outcomes to make this decision | — | — |
| 03:00–06:00 | Calibration, bootstrap; stagger compute jobs | Coverage data; hand-check 100 code links | Coverage view, Evidence page |
| 06:00–08:00 | Gap score; top hits and misses | Static export; offline mode | Wire real data; polish |
| 08:00–10:30 | Freeze query, corpus manifest, split and model configuration; prepare results and limitations | Prepare immutable artifacts | Rehearse and prepare submission |
| 10:30 UTC | Code freeze; run the held-out 2020 test once and write metrics.json | Freeze data/artifact snapshot | No feature changes after this point |
| 10:30–11:30 | Publish results and limitations | Deploy; README with one command | Rehearse three times; submit by 11:30 |
| 12:30 | Judging | — | — |

## 21. Cut order

Cut first: F9 question generator, F8 trend forecast, F10 start from my paper, F12 build-on readiness.

Never cut: map, Gap Finder, Evidence page and F11 code-coverage view.

## 22. Proposed three-minute demo

- **0:00–0:20 — hook:** “Papers with Code shut down in 2025. Search shows what exists; it cannot show what is missing.” Use only after shutdown and archive facts are verified.
- **0:20–1:20 — map:** click a concept to show its trend and predicted partners, open Code Coverage and click a dark cell.
- **1:20–2:20 — gap:** open Gap Finder, select the top gap, inspect score components and supporting papers, then show Evidence: Precision@100 against baselines and calibration.
- **2:20–2:50 — limitations:** co-occurrence is a proxy; code links are a lower bound; MAGI/ERLA is prior art.
- **2:50–3:00 — close:** “See where research is going, and what nobody has built yet.” Qualify code claims as “no linked code in this archive.”

## 23. Likely judge questions

| Question | Proposed answer |
| --- | --- |
| Doesn't your concept list leak the future? | For each historical snapshot, concepts, embeddings and graphs are rebuilt from papers available by that date. Show the exact pipeline and tests. |
| Are probabilities meaningful after 10:1 negative sampling? | Calibration and scoring use all eligible candidates, not the training sample; show base rate and calibration plot. |
| Why not use preferential attachment? | It is a baseline. Show the same test rows for it and the model. |
| What does a “link” mean? | Co-occurrence in at least three papers, an operational proxy for “studied together.” |
| How was the corpus sampled? | Do not sample by current citation count: it contains future attention. If volume requires sampling, show the seeded random or year-stratified rule and per-year counts. |
| How is this different from MAGI? | MAGI/ERLA explores and summarises literature. Whitespace proposes a backtested temporal forecast and a map of recorded code coverage. Verify before the pitch. |
| Does a dark cell mean there is no code? | No. It means the archive has a low recorded link rate; unlisted implementations may exist. |

## 24. Submission checklist

- Confirm submission platform and whether one project may enter both tracks; do not assume prior-year rules are current.
- Public repository with a README and one command to run the demo from precomputed artifacts.
- Results table, Limitations section and Prior Art section naming MAGI/ERLA, Papers with Code and SciCoQA.
- Disclose AI use and any pre-existing code or external contributions as required by the event Code of Conduct.
- Two-minute backup video; submit by 11:30 only if the official deadline remains 12:00.

## Research sources to cite in spike #122

- [OpenAlex API documentation](https://docs.openalex.org/)
- [OpenAlex authentication and paging](https://help.openalex.org/api/authentication/), [filtering](https://help.openalex.org/api/filtering/), and [topic-classifier updates](https://help.openalex.org/api/tag-aboutness/)
- [Papers with Code data archive](https://github.com/paperswithcode/paperswithcode-data)
- [Papers with Code paper-to-code dataset mirror](https://huggingface.co/datasets/pwc-archive/links-between-paper-and-code)
- [Official ERLA / MAGI IC Hack 26 Devpost entry](https://devpost.com/software/magi-2bhmze)
- [ERLA project repository](https://github.com/e24z/ic_hack_26) (no license is currently declared)
- [HackTheBurgh XIII itinerary](https://hacktheburgh.com/itinerary) and [Code of Conduct](https://hacktheburgh.com/code-of-conduct)
- [SciCoQA, ACL Anthology 2026](https://aclanthology.org/2026.acl-long.1795/)
- Temporal Graph Benchmark (NeurIPS 2023), [paper](https://proceedings.neurips.cc/paper_files/paper/2023/hash/066b98e63313162f6562b35962671288-Abstract.html); rare-event precision-recall evaluation, [Saito & Rehmsmeier 2015](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0118432); and case-control probability correction, [King & Zeng 2002](https://doi.org/10.1002/sim.1032)
- MAGI / ERLA, OxHack 2026 HRT examples, and current event submission rules: add verified primary-source links before using their claims in the demo.
