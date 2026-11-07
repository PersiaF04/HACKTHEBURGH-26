"""Tests for the shared Whitespace types and time rules (issue #139)."""
import datetime as dt

import pytest

from whitespace.pipeline import common as c


def test_normalise_arxiv_id_strips_prefix_version_and_case():
    assert c.normalise_arxiv_id("arXiv:1706.03762v5") == "1706.03762"
    assert c.normalise_arxiv_id("  1706.03762V2 ") == "1706.03762"
    assert c.normalise_arxiv_id("2401.00001") == "2401.00001"
    assert c.normalise_arxiv_id("") is None
    assert c.normalise_arxiv_id(None) is None


def test_arxiv_month_reads_new_style_ids_only():
    assert c.arxiv_month("1706.03762") == dt.date(2017, 6, 1)
    assert c.arxiv_month("arXiv:2501.12948v1") == dt.date(2025, 1, 1)
    assert c.arxiv_month("0704.0001") == dt.date(2007, 4, 1)  # first new-style month
    assert c.arxiv_month("hep-th/9901001") is None  # old style
    assert c.arxiv_month("0601.12345") is None  # before new-style ids began
    assert c.arxiv_month("1713.00001") is None  # month 13 is not valid
    assert c.arxiv_month(None) is None


def test_paper_date_prefers_the_arxiv_month_over_the_openalex_date():
    placeholder = dt.date(2022, 1, 1)  # OpenAlex year-placeholder seen on merged records
    assert c.paper_date("2201.11903", placeholder) == dt.date(2022, 1, 1)
    assert c.paper_date("2005.14165", dt.date(2021, 1, 1)) == dt.date(2020, 5, 1)
    assert c.paper_date(None, dt.date(2010, 3, 4)) == dt.date(2010, 3, 4)
    with pytest.raises(ValueError):
        c.paper_date(None, None)


def test_snapshot_end_and_label_window_are_inclusive_calendar_years():
    assert c.snapshot_end(2020) == dt.date(2020, 12, 31)
    assert c.label_window(2020) == (dt.date(2021, 1, 1), dt.date(2023, 12, 31))
    assert c.label_window(2017, horizon=2) == (dt.date(2018, 1, 1), dt.date(2019, 12, 31))
    # a paper dated on the snapshot boundary belongs to the snapshot, not to the window
    assert c.snapshot_end(2020) < c.label_window(2020)[0]


def test_work_is_immutable_and_hashable():
    work = c.Work("W1", dt.date(2019, 5, 1), ("a", "b"))
    with pytest.raises(AttributeError):
        work.id = "W2"  # type: ignore[misc]
    assert hash(work) == hash(c.Work("W1", dt.date(2019, 5, 1), ("a", "b")))


def test_purge_rule_accepts_the_agreed_split():
    c.assert_purged(fit=range(2010, 2015), calibration=[2017], test=[2020])


def test_purge_rule_rejects_every_overlap():
    with pytest.raises(ValueError, match="fit origin 2015"):
        c.assert_purged(fit=range(2010, 2016), calibration=[2017], test=[2020])
    with pytest.raises(ValueError, match="calibration origin 2019"):
        c.assert_purged(fit=range(2010, 2015), calibration=[2017, 2019], test=[2020])
    with pytest.raises(ValueError, match="calibration origin 2018"):
        c.assert_purged(fit=[2010], calibration=[2018], test=[2020])


def test_purge_rule_needs_all_three_stages():
    with pytest.raises(ValueError, match="non-empty"):
        c.assert_purged(fit=[], calibration=[2017], test=[2020])
    with pytest.raises(ValueError, match="non-empty"):
        c.assert_purged(fit=[2010], calibration=[2017], test=[])


def test_purge_rule_follows_the_horizon():
    c.assert_purged(fit=[2014], calibration=[2016], test=[2018], horizon=2)
    with pytest.raises(ValueError):
        c.assert_purged(fit=[2014], calibration=[2016], test=[2018], horizon=3)
