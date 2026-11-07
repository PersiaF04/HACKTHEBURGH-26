"""Shared types and time rules for the Whitespace pipeline (issue #139).

Every other pipeline module codes against these definitions, which come from PRD.md
sections 8 and 13 and the spike findings on issue #122:

* An origin ``T`` is a calendar year. The snapshot ``G_T`` holds works dated on or before
  31 December ``T``. The label window is ``T+1`` to ``T+horizon`` inclusive.
* A paper's date is the arXiv-id month when it has one: OpenAlex ``publication_date`` is
  unreliable for records merged with a journal version (placeholders such as 1 January,
  dates months away from the preprint).
* The purge rule keeps the label windows of earlier splits from overlapping later ones.
"""
from __future__ import annotations

import datetime as dt
import re
from collections.abc import Iterable
from dataclasses import dataclass

HORIZON_YEARS = 3  # label window length after an origin
LINK_THRESHOLD = 3  # a pair is "linked" once it co-occurs in this many works
MIN_PAPERS = 30  # a concept needs this many works at T to be eligible


@dataclass(frozen=True)
class Work:
    """One paper: an id, the date it counts from, and its normalised concepts."""

    id: str
    date: dt.date
    concepts: tuple[str, ...]


_NEW_STYLE = re.compile(r"^(\d{2})(\d{2})\.\d{4,5}$")


def normalise_arxiv_id(raw: str | None) -> str | None:
    """Lower-case, drop an ``arXiv:`` prefix and a ``vN`` suffix. ``None`` for empty input."""
    if not raw:
        return None
    text = raw.strip().lower()
    if text.startswith("arxiv:"):
        text = text[len("arxiv:") :]
    text = re.sub(r"v\d+$", "", text)
    return text or None


def arxiv_month(arxiv_id: str | None) -> dt.date | None:
    """First day of the month encoded in a new-style arXiv id (``YYMM.NNNNN``), else ``None``.

    New-style ids start in April 2007, so ``YY`` is read as ``2000 + YY``. Old-style ids
    (``hep-th/9901001``) are not parsed.
    """
    text = normalise_arxiv_id(arxiv_id)
    if text is None:
        return None
    match = _NEW_STYLE.match(text)
    if not match:
        return None
    year, month = 2000 + int(match.group(1)), int(match.group(2))
    if year < 2007 or not 1 <= month <= 12:
        return None
    return dt.date(year, month, 1)


def paper_date(arxiv_id: str | None, fallback: dt.date | None = None) -> dt.date:
    """The date a paper counts from: the arXiv-id month if present, else ``fallback``."""
    from_id = arxiv_month(arxiv_id)
    if from_id is not None:
        return from_id
    if fallback is None:
        raise ValueError("no arXiv-id month and no fallback date")
    return fallback


def snapshot_end(origin: int) -> dt.date:
    """Last day included in the snapshot for origin ``T``: 31 December ``T``."""
    return dt.date(origin, 12, 31)


def label_window(origin: int, horizon: int = HORIZON_YEARS) -> tuple[dt.date, dt.date]:
    """Inclusive ``(first_day, last_day)`` of the outcome window: ``T+1`` to ``T+horizon``."""
    return dt.date(origin + 1, 1, 1), dt.date(origin + horizon, 12, 31)


def assert_purged(
    fit: Iterable[int],
    calibration: Iterable[int],
    test: Iterable[int],
    horizon: int = HORIZON_YEARS,
) -> None:
    """Raise ``ValueError`` unless no outcome window reaches into a later split.

    Requires ``max(fit) + horizon <= min(calibration)`` and
    ``max(calibration) + horizon <= min(test)`` (PRD section 13). With a first test origin
    of 2020 and a horizon of 3, calibration may use origins up to 2017 and fitting up to 2014.
    """
    fit, calibration, test = sorted(fit), sorted(calibration), sorted(test)
    if not fit or not calibration or not test:
        raise ValueError("fit, calibration and test origins must all be non-empty")
    if fit[-1] + horizon > calibration[0]:
        raise ValueError(
            f"fit origin {fit[-1]} + {horizon} years reaches calibration origin {calibration[0]}: "
            "its outcome window overlaps the next stage"
        )
    if calibration[-1] + horizon > test[0]:
        raise ValueError(
            f"calibration origin {calibration[-1]} + {horizon} years reaches test origin {test[0]}: "
            "its outcome window overlaps the test outcomes"
        )
