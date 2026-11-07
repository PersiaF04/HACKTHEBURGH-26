"""GB settlement-period time helpers (no tz database needed).

A settlement day starts at local midnight; period 1 is the first half-hour.
BST runs from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last
Sunday of October, so a settlement day's start in UTC is midnight minus the
offset in force at that local midnight.
"""
from __future__ import annotations

import datetime as dt

HALF_HOUR = dt.timedelta(minutes=30)


def _last_sunday(year: int, month: int) -> dt.date:
    d = dt.date(year, month + 1, 1) - dt.timedelta(days=1) if month < 12 else dt.date(year, 12, 31)
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)


def is_bst_midnight(day: dt.date) -> bool:
    """True when local midnight at the start of ``day`` is on British Summer Time."""
    return _last_sunday(day.year, 3) < day <= _last_sunday(day.year, 10)


def day_start_utc(day: dt.date) -> dt.datetime:
    midnight = dt.datetime(day.year, day.month, day.day)
    return midnight - dt.timedelta(hours=1 if is_bst_midnight(day) else 0)


def sp_start_utc(day: dt.date, sp: int) -> dt.datetime:
    return day_start_utc(day) + (sp - 1) * HALF_HOUR


def iso_z(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def sp_from_clock(hhmm: str) -> int:
    """Settlement period for a local wall-clock 'HH:MM' on a normal 48-period day."""
    return int(hhmm[:2]) * 2 + int(hhmm[3:5]) // 30 + 1


def parse_date(s: str) -> dt.date:
    return dt.date.fromisoformat(s[:10])


def shift(day: str, days: int) -> str:
    return (parse_date(day) + dt.timedelta(days=days)).isoformat()
