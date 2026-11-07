"""Offline tests for ingest budget, completion and fingerprint rules (review of PR #150)."""
import json
import urllib.error

import pytest

from whitespace.pipeline import ingest
from whitespace.tests.test_ingest import PAGES, W1, W2, paged_fetch, work

KEY = "sekret-key-123"


class Resp:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b"{}"


def test_budget_counts_http_attempts_including_retries():
    codes = [503, 429, None]

    def opener(req, timeout=0):
        code = codes.pop(0)
        if code:
            raise urllib.error.HTTPError(req.full_url, code, "x", {}, None)
        return Resp()

    budget = ingest.CallBudget(3)
    fetch = ingest.make_fetcher(None, opener=opener, sleep=lambda s: None, budget=budget)
    fetch("https://api.openalex.org/works?x=1")
    assert budget.used == 3
    with pytest.raises(ingest.BudgetExceeded):  # a fourth attempt is refused
        fetch("https://api.openalex.org/works?x=1")
    assert budget.used == 3


def counted_pages(n, truncate_at=None):
    works = [work(i) for i in range(n)]
    pages = [works[i : i + 10] for i in range(0, n, 10)]
    return pages[:truncate_at] if truncate_at is not None else pages


def test_window_ending_early_stays_incomplete_and_build_refuses(tmp_path):
    expected = {W1: 100}
    # the last page we get has a null cursor but only 60 of 100 rows arrived
    res = ingest.download(
        paged_fetch({"2010-01-01": counted_pages(100, truncate_at=6)}), [W1], tmp_path, 10, expected=expected
    )
    wdir = tmp_path / "raw" / "2010-01-01_2010-12-31"
    assert res["incomplete"] == ["2010-01-01_2010-12-31"]
    assert not (wdir / "done.json").exists() and (wdir / "partial.json").exists()
    with pytest.raises(ingest.IncompleteCorpus):
        ingest.build_corpus(tmp_path, "2026-11-07")
    res = ingest.download(paged_fetch({"2010-01-01": counted_pages(100)}), [W1], tmp_path, 20, expected=expected)
    done = json.loads((wdir / "done.json").read_text())
    assert res["incomplete"] == [] and done["terminal_cursor"] is True
    assert (done["expected_count"], done["returned"], done["delta"]) == (100, 100, 0)


def test_small_drift_accepted_and_far_drift_rejected(tmp_path):
    for returned in (99, 101):
        d = tmp_path / str(returned)
        res = ingest.download(paged_fetch({"2010-01-01": counted_pages(returned)}), [W1], d, 20, expected={W1: 100})
        assert res["incomplete"] == []
        done = json.loads((d / "raw" / "2010-01-01_2010-12-31" / "done.json").read_text())
        assert done["delta"] == returned - 100
    assert ingest.tolerance(100) == 5 and ingest.tolerance(100_000) == 100
    res = ingest.download(
        paged_fetch({"2010-01-01": counted_pages(90)}), [W1], tmp_path / "far", 20, expected={W1: 100}
    )
    assert res["incomplete"]


def test_changed_type_list_refuses_old_plan_and_windows(tmp_path, monkeypatch):
    plan = {"windows": [{"start": W1[0], "end": W1[1], "count": 3, "needs_cursor": False}]}
    plan["fingerprint"] = ingest.query_fingerprint(ingest.plan_scope(plan))
    ingest.check_plan(plan)
    ingest.download(paged_fetch(PAGES), [W1], tmp_path, 10, fingerprint=plan["fingerprint"])
    monkeypatch.setattr(ingest, "TYPES", ("article", "preprint"))
    with pytest.raises(ingest.FingerprintMismatch):
        ingest.check_plan(plan)
    with pytest.raises(ingest.FingerprintMismatch):
        ingest.download(paged_fetch(PAGES), [W1], tmp_path, 10)
    new_plan = dict(plan, fingerprint=ingest.query_fingerprint(ingest.plan_scope(plan)))
    rep = ingest.verify(tmp_path, new_plan)  # a plan under the new config does not match old windows
    assert not rep["ok"] and rep["windows"][0]["status"] == "fingerprint"


def test_fingerprint_ignores_key_and_mailto_but_not_scope(monkeypatch):
    a = ingest.query_fingerprint(("2010-01-01", "2020-12-31"))
    monkeypatch.setenv(ingest.KEY_ENV, KEY)
    assert ingest.query_fingerprint(("2010-01-01", "2020-12-31")) == a
    assert ingest.query_fingerprint(("2010-01-01", "2021-12-31")) != a


def test_verify_ok_and_legacy(tmp_path):
    ingest.download(paged_fetch(PAGES), [W1, W2], tmp_path, 10)
    plan = {"windows": [{"start": W1[0], "end": W1[1], "count": 3}, {"start": W2[0], "end": W2[1], "count": 2}]}
    plan["fingerprint"] = ingest.query_fingerprint(ingest.plan_scope(plan))
    rep = ingest.verify(tmp_path, plan)
    assert rep["ok"] and rep["summary"] == {"ok": 2}
    f = tmp_path / "raw" / "2011-01-01_2011-12-31" / "done.json"
    d = json.loads(f.read_text())
    for k in ("fingerprint", "terminal_cursor", "expected_count", "returned", "delta"):
        d.pop(k)
    f.write_text(json.dumps(d))
    assert not ingest.verify(tmp_path, plan)["ok"]
    rep = ingest.verify(tmp_path, plan, legacy=True)
    assert rep["ok"] and rep["summary"] == {"ok": 1, "legacy": 1}
    assert "VERIFIED" in ingest.format_verify(rep)
    with pytest.raises(ingest.IncompleteCorpus):
        ingest.build_corpus(tmp_path, "2026-11-07", plan)
    ingest.build_corpus(tmp_path, "2026-11-07", plan, legacy=True)
