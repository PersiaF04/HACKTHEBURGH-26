"""Backfill window and replay days (#27)."""

WINDOW_START = "2026-04-01"
# Last full day for which Elexon indicative cashflows exist (they are published the next morning).
WINDOW_END = "2026-11-06"
# Fixed demo storm day, plus the heaviest other Scottish curtailment days from the data.
REPLAY_FIXED_DAYS = ["2026-10-14"]
REPLAY_EXTRA_DAYS = 2
# Public raw URL of live.json (an unlisted GitHub Gist the live poller updates), so the hosted site
# can show live mode. Empty means the local replay/live.json file only.
LIVE_URL = "https://gist.githubusercontent.com/varshil247/79a5156614171e58934c6ec3fc32beec/raw/live.json"
