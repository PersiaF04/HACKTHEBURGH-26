# Data licence and attribution

This directory holds the data files behind the Whitespace web app. The MIT licence of the code (`LICENSE` at the repository root) does not cover these data files. The terms below apply to them.

## Papers with Code archive (code links and coverage)

Code-link and coverage information comes from the Papers with Code archive, `pwc-archive/links-between-paper-and-code` on Hugging Face (<https://huggingface.co/datasets/pwc-archive/links-between-paper-and-code>), revision `56cc5c1938678c33dedebf5f74fc4e62e2c35381`, snapshot retrieved 28 July 2025, licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0): <https://creativecommons.org/licenses/by-sa/4.0/>

Modification statement: the archive was joined to OpenAlex works by arXiv id and aggregated by concept and year by Whitespace. The coverage files are released under CC BY-SA 4.0 as well. A paper without a link has no linked code in this archive; that is not evidence that no code exists.

## OpenAlex (papers and concepts)

Paper metadata comes from OpenAlex (<https://openalex.org>), whose records are released under CC0. Attribution is given as a courtesy. Topic assignments are OpenAlex classifier output as in use when the corpus was downloaded (after the October 2026 classifier change; the exact classifier version and retrieval date are not recorded in the export), not as known at each origin year.

No full abstracts are included in these files. Paper titles and links only, plus the short quoted sentences described below.

## Quoted open-problem sentences

Short excerpts quoted from abstracts indexed by OpenAlex; copyright remains with the publishers/authors. OpenAlex metadata is CC0. No full abstracts are included. Each quoted sentence is at most 400 characters, is a single sentence taken whole (never an entire abstract), and is attributed to and linked to its paper (id, title, year and URL) in `open-problems.json` and in the `open_problems` fields of `gap-details.json` and `concepts.json`. The sentences were picked by a regex prefilter whose precision is unmeasured unless a measurement is stated in `meta.json`; a quoted sentence is a lead to read the paper, not a verified research gap.

## Other files

Maps, gaps, backtest results and the manifest were produced by Whitespace from the sources above. No separate licence has been set for the derived files other than coverage; the repository's MIT licence covers code only.
