# How Whitespace works

A plain-language technical breakdown for the team. It explains what each part does,
why it is built that way, and what the numbers mean. Code lives in `whitespace/pipeline/`
(Python) and `whitespace/web/` (the website).

## The one-sentence version

We read 730,671 AI papers, work out which research topics are written about together,
learn from history which topic pairs tend to "meet" a few years later, and use that to
point at pairs that haven't met yet but probably will: the gaps.

## The big picture

```text
OpenAlex papers ──► topics (phrases) ──► "who appears with whom" graph per year
      │                                              │
      │                                    features for every topic pair
      │                                              │
      │                              model learns which pairs later connect
      │                                              │
      │                     ┌──── backtest: test it on years it never saw
      │                     └──── production: score today's unconnected pairs
      │                                              │
      └── Papers with Code join    open-problem sentences    gap list
                         \               |               /
                          static JSON files (whitespace/web/public/data)
                                         │
                            website (React + Three.js) on Vercel
```

Everything heavy runs **once, offline** on a laptop. The website only reads finished
JSON files, so the demo never calls any outside service and can't break during judging.

## Step 1: Get the papers (`ingest.py`)

- **Source:** [OpenAlex](https://openalex.org), a free, open catalogue of research papers.
- **What we take:** works whose main field is Artificial Intelligence (OpenAlex subfield
  1702), with title, abstract text, year and IDs. That's 730,671 works in the live export.
- **How:** downloaded in checkpointed chunks with a manifest (a receipt listing every chunk),
  so a crash halfway doesn't lose work and anyone can check exactly what was used.
- Raw abstracts are **never** committed to Git or published. The site only shows titles,
  links, and (on Open problems) single quoted sentences of at most 400 characters.

## Step 2: Turn papers into topics (`concepts.py`)

We need "topics" to connect. We don't use AI embeddings here; we use something simple and
checkable:

- Split each title and abstract into words, lower-case them and lightly stem them.
- Every run of **1 to 3 words** that doesn't start or end with a filler word ("the", "of",
  "we") is a candidate phrase: "graph neural network", "quantum circuit", "self attention".
- Keep the phrases that appear in enough papers. The live map has **5,000 concepts**.
- **No peeking at the future:** the vocabulary for year T is built only from papers up to T.

Honest limitation: this produces some junk phrases ("vice versa", "located"). That's why
there's a stoplist later. Concept quality is not measured.

## Step 3: Build a "who appears with whom" graph (`graphs.py`)

For each year (a **snapshot**), we build a graph:

- **Nodes** are concepts.
- **Edge weight** is how many papers mention both concepts.
- Two concepts are **linked** once they appear together in **at least 3 papers**. This is
  our working definition of "these topics have met". It measures attention, not
  importance or truth.

A **gap** is a pair of concepts with **0, 1 or 2** shared papers so far: not linked yet.

## Step 4: Describe every pair with numbers (`features.py`, `baselines.py`)

For each not-yet-linked pair at year T, we compute features using only data up to T:

| Feature | Plain meaning |
| --- | --- |
| `weight` | How many papers already mention both (0, 1 or 2) |
| Common neighbours | How many topics both are already linked to ("friends in common") |
| Adamic–Adar | Common neighbours, but rare shared friends count more |
| Jaccard | Shared friends as a fraction of all their friends |
| Degree product, preferential attachment | Big, popular topics tend to link to everything |
| `log_count` min/max | How big each topic is (number of papers) |
| `growth` min/max | Is each topic growing? log(papers in last 3 years) minus log(papers in the 3 before) |
| `age` min/max | How long each topic has existed |

The six structural scores are also used **on their own as baselines**: simple rules the
model must beat to be worth anything.

## Step 5: The model (`model.py`, `labels.py`)

- **Question it answers:** "Will this pair reach 3+ shared papers within the next 3 years?"
- **Labels:** for a snapshot year T, we look at T+1 to T+3 and mark which pairs did link.
- **Model:** a regularised **logistic regression**, a simple, well-understood model
  (weighted sum of features → probability), written in plain NumPy. Not a neural network.
- **Calibration:** **Platt scaling** adjusts the raw scores so "0.7" is meant to mean
  about 70% of such pairs link. It's fitted on a separate year so it isn't graded on the
  data it learned from.

## Step 6: The backtest, our evidence (`backtest.py`, `metrics.py`)

This is the core of the HRT pitch: **we tested the forecast on years it had never seen,
once, with the rules written down in advance.**

### Time travel without cheating

| Role | Snapshot years | What happens |
| --- | --- | --- |
| Fit | 2010–2014 | The model learns |
| Calibrate | 2017 | Probabilities are adjusted; the best baseline is chosen here |
| Test (once) | 2020 → outcomes 2021–2023 | The model is graded, one time only |

"Purged" means the windows don't overlap: no outcome the model is graded on was visible
when it trained. The test was run **once**, at a frozen code commit (`93448d2`), and we
published whatever came out (issue #122).

### The pre-registered rule

Before scoring, we fixed the headline as the model's **average precision (AP)** minus
the best baseline's AP, with a 95% bootstrap interval. The verdict is "beats" only if the
whole interval is above zero.

### Result

| Measure | Model | Best baseline (`current_weight`) |
| --- | --- | --- |
| Average precision (all pairs) | **0.6876** | 0.5984 |
| Difference | **+0.0892**, 95% interval [0.0845, 0.0945] | |
| ROC AUC | 0.867 | 0.818 |
| Precision@100 | 1.00 | 0.66 (but other baselines reach 0.91–1.00) |

Over 3.9 million eligible pairs, with base rate 0.281: 28% of pairs linked anyway.

### What the jargon means

- **Average precision:** sort pairs from most to least likely; AP is high when the pairs
  that really linked are near the top. A random ranking scores about the base rate (0.28).
- **ROC AUC:** the chance the model ranks a random real link above a random non-link (0.5 = coin flip).
- **Precision@100:** of the top 100 predictions, how many came true.
- **ECE (calibration error):** how far "the model said 70%" is from "70% happened". Ours
  is 0.143, which is imperfect. The model under-predicts at the top end: it said 0.53 where 0.78 happened.
- **Concept-block bootstrap:** we resample whole concepts, not single pairs, so the interval
  isn't fooled by one concept appearing in thousands of pairs.

### The honest caveat (say this to judges)

The win is **aggregate only**. Inside each group of pairs with the same starting weight
(0, 1 or 2 shared papers), the simpler graph baselines (common neighbours, Adamic–Adar
and so on) are **better** than the model. Much of the overall gain comes from the mix of
those groups. We report this openly on the Evidence page.

## Step 7: Scoring today's gaps (`export_map_gaps.py`)

The backtest model is frozen for evaluation. For the live site we use a **production
model** fitted on 2010–2014 and 2017 and calibrated on 2020, then score every unlinked pair
in the **2023** snapshot.

Important: this production model has **no held-out test of its own**, because 2020 was the test
year. So the site's "Likelihood %" should be read as a **ranking**, not a real chance.

### The gap score

```text
gap score = likelihood × momentum × novelty
momentum  = sigmoid(2 × the weaker topic's growth)      → both topics must be growing
novelty   = 1 − how much their neighbourhoods already overlap
```

It's a ranking heuristic, not a probability. Then three display-only clean-ups:

1. **Stoplist:** 534 generic phrases ("already", "vice versa", "menggunakan metode") are hidden.
2. **Diversity cap:** no concept appears in more than 3 listed gaps. Each concept contributes
   at most 10 candidates to a pool of 2,000. This stops "covid ↔ everything" filling the list.
3. **Stated gaps:** each topic's share of papers stating an open problem, shown for
   context only. It is **not** part of the score.

None of these change the model, the backtest or the headline.

## Step 8: Open problems (`open_problems.py`)

- A fast pattern matcher scans every abstract for sentences like "remains an open
  question", "it is unclear whether", or "future work should". It runs over 731k papers in about 27 seconds.
- Each hit is tagged with the concepts it mentions.
- The site shows **911 short quotes** of the `open_problem` type, each linked to its paper.
- **Quality:** an AI labelled 100 sample sentences. Open-problem sentences were right
  24/34 times (71%). Future-work (24%) and limitation (15%) sentences were mostly noise, so we
  dropped them. The same AI built the extractor, so this is **not independent and not
  human-validated**.

## Step 9: Code coverage (`code_layer.py`, `code_join_local.py`)

- Papers are matched to the **Papers with Code archive** (a frozen 2025 snapshot), offline,
  by arXiv ID.
- 43,581 of 731,511 works had a linked code repository (5.96%).
- That's a **lower bound**: only 139,613 works even have an arXiv ID, and the archive stops
  in mid-2025. "No link" means "not in this archive", not "no code exists".

## Step 10: Export and validation (`export_all.py`)

All results are written as static JSON files: map, gaps, gap details, concepts, coverage,
backtest, open problems and meta. Every file is flagged real or placeholder, and checked
by a validator before it ships. A manifest records file hashes and the exact commit used,
so the data on the site can be traced back to code.

## Step 11: The website (`whitespace/web/`)

- **Stack:** Vite, React, TypeScript, Three.js (the 3D map), IBM Plex fonts.
- **Data:** loads the JSON files from `/data/`. If they're placeholders, every page says so.
- **Pages:**
  - **Research map:** 3D branch → concept → hypothesis graph. Map positions come from a
    maths summary of the co-occurrence graph (PPMI + SVD), so related topics sit nearby.
    Click a concept for its papers, growth and linked open problems.
  - **Gap finder:** ranked gaps with Likelihood %, Strength (strong, moderate or weak relative
    to the top gap), momentum, novelty, stated-gap context, header sorting and gap details.
  - **Open problems:** filterable quotes, a trend chart, and links to source papers.
  - **Evidence** (footer): the verdict card first, technical tables collapsed.
  - **Code coverage** (footer): a concept × year heatmap of linked-code share.

## Step 12: How it gets to the internet

1. Code is merged into `main` on GitHub through pull requests. CI runs Markdown lint,
   the web build and the pipeline tests.
2. A GitHub Action (`.github/workflows/deploy.yml`) builds the site and deploys it to
   **Vercel** whenever `whitespace/web/` changes on `main`.
3. Live at <https://whitespace-hacktheburgh-26.vercel.app>.

## How the team worked

- **Humans** (Persia, Varshil, Sanam) decided scope, priorities and merges.
- **Claude Code agents** wrote code on issue branches and opened pull requests.
- **Codex agents** reviewed pull requests against the PRD.
- A small message hub (over Tailscale) and a Discord bridge let the agents hand work to
  each other; GitHub issues and PRs stayed the record of truth.

## Likely judge questions, in one line each

- **"How do you know it works?"** One pre-registered, purged test on unseen years: +0.089 AP over the pre-registered baseline, interval above zero.
- **"Does it beat simple methods?"** Overall yes, but within each stratum the classic graph baselines are stronger. We say so.
- **"Are the percentages real?"** Treat them as rankings; the live model has no held-out test and calibration is imperfect.
- **"Is this new?"** Forecasting topic links isn't (Krenn et al., arXiv:2210.00881; ERLA at IC Hack 26). Our part is the leakage-safe evaluation plus a usable decision tool.
- **"Why so much covid?"** It's a huge, fast-growing hub topic; the cap limits it to 3 gaps.

## What's next

Better concepts (embeddings), better calibration, a held-out test for the production
model, human-validated open problems, and 2024–2026 papers with a consistent topic vintage.
