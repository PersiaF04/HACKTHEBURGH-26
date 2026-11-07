# Whitespace pipeline

Python code for the Whitespace research-discovery pipeline (spike [#122](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/122), requirements in [`PRD.md`](../PRD.md)). This folder holds **code and tests only**. It contains no data and no results: nothing here is a measured forecast, and no claim of accuracy is made until a purged backtest has been run once, after the code freeze.

## Layout

| Path | Purpose |
| --- | --- |
| `pipeline/common.py` | Shared `Work` record, arXiv-id and date rules, origin and label windows, the purge check |
| `pipeline/graphs.py`, `labels.py`, `baselines.py` | Snapshot graphs, eligible pairs, labels, baselines (issue #140) |
| `pipeline/metrics.py` | Ranking metrics and calibration (issue #141) |
| `pipeline/code_layer.py` | Papers with Code join and coverage (issue #142) |
| `tests/` | Offline tests; no network, no downloaded data |

Heavy intermediates (raw OpenAlex pages, snapshots, embeddings) stay out of Git and are referenced by checksum in an artifact manifest. Raw abstracts are never committed or published.

## Run the tests

```sh
python -m pip install -r whitespace/requirements.txt
python -m pytest -q whitespace
```

Run both commands from the repository root.

## Concepts (`pipeline/concepts.py`, issue #148)

Concepts are normalised keyword phrases of 1 to 3 words taken from title plus abstract. `build_vocabulary(docs, origin, min_papers=30)` counts **document** frequency over papers dated on or before 31 December `origin` only; `assign_concepts(text, vocabulary)` returns the sorted tuple of vocabulary phrases in a paper. `assign_concepts_flagged(..., fallback_topic=id)` returns `topic:<id>` with `used_fallback=True` only when a paper has no vocabulary phrase.

Not implemented here: the PRD's embedding-based near-duplicate merge (cosine above 0.92) and KeyBERT. Both need an embedding model and belong to a later issue; until then only deterministic normalisation (case, hyphens, plurals) merges variants. Phrases come from text rather than OpenAlex topics because topic assignments are retroactive. No claim is made about concept quality on real papers.

### Concept selection (issue #154)

`select_vocabulary(docs, origin, max_concepts=5000)` (or `select_concepts(doc_freq, n_docs, ...)` on counts from `document_frequencies`) shrinks the vocabulary to at most 5,000 concepts, using only papers dated on or before 31 December `origin`. Rules, in order: keep phrases with at least `min_papers` papers and at most 2% of all papers at T; drop phrases that begin or end with a stop word, contain a digit-only token or repeat a word; single words need 3 times `min_papers`; drop a shorter phrase when a longer one containing it has at least 90% of its document frequency ("graph neural" goes, "graph neural network" stays); rank by document frequency (times 1.2 for 2 to 3 word phrases), ties alphabetical, and keep the top `max_concepts`. All thresholds are parameters. They are untuned defaults; concept quality on real papers has not been judged.

## Shared rules

- **Origin.** `T` is a calendar year. The snapshot holds works dated on or before 31 December `T`. The outcome window is `T+1` to `T+3`, inclusive.
- **Link.** A pair is linked once it co-occurs in at least three works. Pairs with weight 0, 1 or 2 at `T` are eligible. A pair is a positive if it reaches weight 3 by the end of `T+3`.
- **Paper date.** The arXiv-id month when the paper has one; OpenAlex `publication_date` is not trusted for records merged with a journal version.
- **Purge.** `max(fit) + 3 <= min(calibration)` and `max(calibration) + 3 <= min(test)`. With a first test origin of 2020, calibrate on 2017 and fit through 2014. `assert_purged` enforces this.
- **Population.** Primary metrics use the full eligible pair universe, for the model and every baseline alike, reported separately for starting weights 0, 1 and 2.
- **Baselines.** Current weight, degree product, preferential attachment, common neighbours, Adamic-Adar and Jaccard score the same pairs with the same tie-breaking.
- **Code coverage.** A missing Papers with Code link means no linked code in that archive, never that no code exists.
