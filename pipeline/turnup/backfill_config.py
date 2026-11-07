"""Backfill window and replay days (#27)."""

WINDOW_START = "2026-04-01"
# Last full day for which Elexon indicative cashflows exist (they are published the next morning).
WINDOW_END = "2026-11-06"
# Fixed demo storm day; a second storm day is chosen from the data (the heaviest other day).
REPLAY_FIXED_DAYS = ["2026-10-14"]
