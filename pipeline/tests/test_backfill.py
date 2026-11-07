import datetime as dt

import pytest

from turnup import backfill as b
from turnup.geo import osgb_to_wgs84
from turnup.validate import compare


def test_settlement_periods_handle_clock_changes():
    assert b.periods_in_day("2026-10-14") == 48
    assert b.periods_in_day("2026-10-25") == 50   # clocks go back
    assert b.periods_in_day("2026-03-29") == 46   # clocks go forward
    assert b.iso_z(b.sp_start_utc("2026-10-14", 1)) == "2026-10-13T23:00:00Z"   # BST
    assert b.iso_z(b.sp_start_utc("2026-10-14", 30)) == "2026-10-14T13:30:00Z"
    assert b.iso_z(b.sp_start_utc("2026-11-01", 1)) == "2026-11-01T00:00:00Z"   # GMT
    assert b.iso_z(b.sp_start_utc("2026-10-25", 1)) == "2026-10-24T23:00:00Z"   # starts in BST
    assert b.iso_z(b.sp_start_utc("2026-10-25", 50)) == "2026-10-25T23:30:00Z"  # last SP before GMT midnight


def test_avg_level_time_weights_linear_segments():
    start = dt.datetime(2026, 4, 1, 19, 30, tzinfo=dt.timezone.utc)
    segs = [
        {"timeFrom": "2026-04-01T19:30:00Z", "timeTo": "2026-04-01T19:45:00Z", "levelFrom": 20, "levelTo": 20},
        {"timeFrom": "2026-04-01T19:45:00Z", "timeTo": "2026-04-01T20:00:00Z", "levelFrom": 20, "levelTo": 0},
    ]
    assert b._avg_level(segs, start, start + dt.timedelta(minutes=30)) == pytest.approx(15.0)
    assert b._avg_level([], start, start + dt.timedelta(minutes=30)) is None


@pytest.mark.parametrize("pn,mel,curt,state", [
    (100, 100, 10, "instructed"),
    (100, 100, 0, "generating"),
    (100, 40, 0, "unavailable"),
    (0, 0, 0, "unavailable"),
    (0, 200, 0, "unknown"),
    (None, None, 0, "unknown"),
])
def test_classify_states(pn, mel, curt, state):
    assert b.classify(pn, mel, curt) == state


def test_repd_name_matching_prefers_operational_and_aliases():
    repd = [
        {"Site Name": "Seagreen Phase 1A", "Country": "Scotland", "Development Status (short)": "Awaiting Construction",
         "Installed Capacity (MWelec)": "540"},
        {"Site Name": "Seagreen", "Country": "Scotland", "Development Status (short)": "Operational",
         "Installed Capacity (MWelec)": "1075"},
        {"Site Name": "Moray East", "Country": "Scotland", "Development Status (short)": "Operational",
         "Installed Capacity (MWelec)": "950"},
    ]
    assert b.match_repd("Seagreen 6", repd, True)[0]["Site Name"] == "Seagreen"
    assert b.match_repd("Moray Firth Eastern 1", repd, True)[0]["Site Name"] == "Moray East"
    assert b.match_repd("Nowhere Hill", repd, True)[0] is None


def test_osgb_conversion_matches_ordnance_survey_example():
    lat, lon = osgb_to_wgs84(651409.903, 313177.270)
    assert lat == pytest.approx(52.658, abs=1e-3) and lon == pytest.approx(1.716, abs=1e-3)


def test_build_dfs_filters_live_upwards_system_and_sums_accepted():
    req = [
        {"Event ID": "7", "DFS Submission Time_Local": "08/10/2026 11:00", "Event Type": "Upwards", "Event Tag": "System",
         "Delivery Date": "08/10/2026", "From_Local": "17:00", "To_Local": "17:30", "Service Requirement MW": "500",
         "Service Requirement Type": "Live", "Zonal Cap": "Z1:500,Z2:500,Z3:0"},
        {"Event ID": "8", "DFS Submission Time_Local": "08/10/2026 11:00", "Event Type": "Downwards", "Event Tag": "Energy",
         "Delivery Date": "08/10/2026", "From_Local": "17:00", "To_Local": "17:30", "Service Requirement MW": "500",
         "Service Requirement Type": "Live", "Zonal Cap": ""},
        {"Event ID": "9", "DFS Submission Time_Local": "09/10/2026 11:00", "Event Type": "Upwards", "Event Tag": "System",
         "Delivery Date": "09/10/2026", "From_Local": "17:00", "To_Local": "17:30", "Service Requirement MW": "500",
         "Service Requirement Type": "Test", "Zonal Cap": "Z1:500"},
    ]
    util = [
        {"Event ID": "7", "Delivery Date": "08/10/2026", "From_Local": "17:00", "Status": "Accepted",
         "Service Requirement Type": "Live", "DFS Procured MW": "1.5", "Utilisation Price GBP per MWh": "60"},
        {"Event ID": "7", "Delivery Date": "08/10/2026", "From_Local": "17:00", "Status": "Accepted",
         "Service Requirement Type": "Live", "DFS Procured MW": "0.5", "Utilisation Price GBP per MWh": "80"},
        {"Event ID": "7", "Delivery Date": "08/10/2026", "From_Local": "17:00", "Status": "Rejected",
         "Service Requirement Type": "Live", "DFS Procured MW": "9", "Utilisation Price GBP per MWh": "999"},
    ]
    out = b.build_dfs(req, util)["requests"]
    assert len(out) == 1
    r = out[0]
    assert r["event_id"] == "DFS-2026-10-08-7"
    assert r["start_utc"] == "2026-10-08T16:00:00Z" and r["end_utc"] == "2026-10-08T16:30:00Z"
    assert r["auction_close_utc"] == "2026-10-08T10:00:00Z"
    assert r["procured_mw"] == 2.0 and r["accepted_price_median_gbp_per_mwh"] == 70
    assert r["zone_caps_mw"] == {"Z1": 500, "Z2": 500}


def test_pearson():
    assert b.pearson([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)
    assert b.pearson([1, 2], [1, 2]) is None


def test_contract_compare_allows_null_numbers_and_flags_missing_keys():
    expected = {"days": [{"date": "2026-01-01", "curtailed_mwh": 1}]}
    assert compare(expected, {"days": [{"date": "2026-01-02", "curtailed_mwh": None}]}) == []
    assert compare(expected, {"days": [{"date": "2026-01-02"}]}) == ["days[].curtailed_mwh: missing"]
