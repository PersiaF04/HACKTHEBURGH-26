"""Warm the raw-data cache for the backfill window (slow the first time, then instant).

Run: ``python -m turnup.prefetch [START] [END]`` from ``pipeline/``.
"""

from __future__ import annotations

import logging
import sys

from . import fetch
from .backfill_config import WINDOW_END, WINDOW_START

log = logging.getLogger("turnup.prefetch")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    start = argv[0] if argv else WINDOW_START
    end = argv[1] if len(argv) > 1 else WINDOW_END
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    failures = 0
    for day in fetch.daterange(start, end):
        for kind in ("bid", "offer"):
            try:
                rows = fetch.elexon_cashflows(kind, day)
                log.info("%s %s cashflows: %d rows", day, kind, len(rows))
            except Exception as exc:  # noqa: BLE001 - keep going, report at the end
                failures += 1
                log.warning("%s %s cashflows failed: %s", day, kind, exc)
    log.info("done, %d failures", failures)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
