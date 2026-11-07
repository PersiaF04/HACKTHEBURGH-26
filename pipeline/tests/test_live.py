import datetime as dt

from turnup import live

UTC = dt.timezone.utc


def seg(unit, t0, t1, a, b, acc=None):
    row = {"bmUnit": unit, "timeFrom": t0, "timeTo": t1, "levelFrom": a, "levelTo": b}
    if acc is not None:
        row["acceptanceNumber"] = acc
    return row


def test_latest_acceptance_supersedes_earlier():
    start = dt.datetime(2026, 11, 7, 12, 0, tzinfo=UTC)
    rows = [seg("T_X", "2026-11-07T11:00:00Z", "2026-11-07T13:00:00Z", 80, 80, acc=1),
            seg("T_X", "2026-11-07T11:30:00Z", "2026-11-07T13:00:00Z", 20, 20, acc=2)]
    assert live.latest_acceptance_level(rows, start, start + dt.timedelta(minutes=30)) == 20


def test_build_live_estimates_curtailment_and_stops_at_now():
    now = dt.datetime(2026, 11, 7, 1, 10, tzinfo=UTC)  # GMT day: SP1 00:00, SP2 00:30, SP3 01:00

    def physical(ds, day, sp, refresh=False):
        t0 = (dt.datetime(2026, 11, 7, tzinfo=UTC) + dt.timedelta(minutes=30 * (sp - 1)))
        t1 = t0 + dt.timedelta(minutes=30)
        iso = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
        return [seg("T_X", iso(t0), iso(t1), 100, 100), seg("T_OTHER", iso(t0), iso(t1), 5, 5)]

    def boalf(start, end):
        return [seg("T_X", "2026-11-07T00:30:00Z", "2026-11-07T01:00:00Z", 40, 40, acc=7)]

    scotex = {"2026-11-07T00:30:00Z": (5900.0, 7000.0)}
    out = live.build_live(now, {"T_X"}, physical=physical, boalf=boalf, scotex=scotex)
    assert out["periods"][1]["scotex_flow_mw"] == 7000.0 and out["periods"][0]["scotex_limit_mw"] is None
    assert out["meta"]["retrospective"] is False
    assert [p["sp"] for p in out["periods"]] == [1, 2, 3]
    sp1, sp2 = out["periods"][0]["farms"]["T_X"], out["periods"][1]["farms"]["T_X"]
    assert sp1["state"] == "generating" and sp1["curtailed_mwh"] == 0
    assert sp2 == {"pn_mw": 100, "level_mw": 40, "curtailed_mwh": 30, "paid_gbp": None, "state": "instructed"}
    assert "T_OTHER" not in out["periods"][0]["farms"]


def test_recent_periods_bypass_the_cache_and_old_ones_do_not():
    now = dt.datetime(2026, 11, 7, 6, 10, tzinfo=UTC)  # SP13 started 06:00; the window is the last 2 hours
    calls = {}

    def physical(ds, day, sp, refresh=False):
        calls[(ds, sp)] = refresh
        return []

    live.build_live(now, {"T_X"}, physical=physical, boalf=lambda a, b: [], scotex={})
    assert calls[("PN", 13)] is True and calls[("MELS", 13)] is True      # current period: always fresh
    assert calls[("PN", 10)] is True                                      # 04:30, inside the 2 h window
    assert calls[("PN", 1)] is False and calls[("MELS", 5)] is False      # settled history: cached
