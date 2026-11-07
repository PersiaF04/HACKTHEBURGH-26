"""Offline tests for whitespace.pipeline.ingest: canned pages, no network."""
import datetime as dt
import json
import logging
import urllib.error
import urllib.parse

import pytest

from whitespace.pipeline import ingest

KEY = "sekret-key-123"
TODAY = dt.date(2026, 11, 7)


def words(n):
    return {f"w{i}": [i] for i in range(n)}


def work(i, n_words=60, arxiv=None, date="2020-05-05", typ="article", doi=None):
    locs = [{"landing_page_url": f"https://arxiv.org/abs/{arxiv}v2"}] if arxiv else []
    return {
        "id": f"https://openalex.org/W{i}",
        "doi": doi,
        "title": f"t{i}",
        "type": typ,
        "publication_year": int(date[:4]),
        "publication_date": date,
        "cited_by_count": 1,
        "abstract_inverted_index": words(n_words),
        "keywords": [{"display_name": "k"}],
        "primary_topic": {"id": "https://openalex.org/T1"},
        "locations": locs,
    }


# ----------------------------------------------------------------- planning


def make_counter(per_day_total):
    """Fake API: every day in 2010..2026 holds a fixed number of works; counts any filter window."""

    calls = []

    def count(a, b):
        return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days + 1

    def fetch(url):
        calls.append(url)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        flt = dict(p.split(":", 1) for p in q["filter"][0].split(","))
        a, b = flt["from_publication_date"], flt["to_publication_date"]
        if "group_by" in q:
            groups = []
            for y in range(2010, 2027):
                lo, hi = max(a, f"{y}-01-01"), min(b, f"{y}-12-31")
                if lo <= hi:
                    groups.append({"key": str(y), "count": count(lo, hi) * per_day_total})
            return {"meta": {"count": sum(g["count"] for g in groups)}, "group_by": groups}
        return {"meta": {"count": count(a, b) * per_day_total}, "results": []}

    return fetch, calls


def test_windows_split_until_within_limit():
    fetch, calls = make_counter(per_day_total=20)  # ~7,300 per year: fits
    plan = ingest.plan_windows(fetch, TODAY)
    assert plan["count_requests"] == 1
    assert all(not w["needs_cursor"] for w in plan["windows"])

    fetch, calls = make_counter(per_day_total=50)  # ~18,250 per year: needs one split
    plan = ingest.plan_windows(fetch, TODAY)
    assert all(w["count"] <= ingest.BASIC_LIMIT for w in plan["windows"])
    assert plan["count_requests"] > 1 and plan["count_requests"] <= 30 + 1
    # windows tile the range without overlap
    ends = [w["end"] for w in plan["windows"][:-1]]
    starts = [w["start"] for w in plan["windows"][1:]]
    for e, s in zip(ends, starts):
        assert dt.date.fromisoformat(s) == dt.date.fromisoformat(e) + dt.timedelta(days=1)
    assert plan["total_works"] == plan["total_works_meta"]


def test_windows_flagged_when_budget_runs_out():
    fetch, calls = make_counter(per_day_total=500)  # far too many to split into <=10k windows
    plan = ingest.plan_windows(fetch, TODAY, max_count_requests=6)
    assert plan["count_requests"] <= 6
    assert any(w["needs_cursor"] for w in plan["windows"])
    assert plan["list_calls"] == sum(-(-w["count"] // 100) for w in plan["windows"])
    assert "needs cursor" in ingest.format_plan(plan)


# ----------------------------------------------------------------- download


def paged_fetch(pages_by_window, log=None):
    """pages_by_window[start] = list of result lists; cursor is the page index."""

    def fetch(url):
        if log is not None:
            log.append(url)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        start = q["filter"][0].split("from_publication_date:")[1].split(",")[0]
        pages = pages_by_window[start]
        idx = 0 if q["cursor"][0] == "*" else int(q["cursor"][0])
        nxt = str(idx + 1) if idx + 1 < len(pages) else None
        return {"meta": {"count": sum(map(len, pages)), "next_cursor": nxt}, "results": pages[idx]}

    return fetch


W1, W2 = ("2010-01-01", "2010-12-31"), ("2011-01-01", "2011-12-31")
PAGES = {
    "2010-01-01": [[work(1), work(2)], [work(3)]],
    "2011-01-01": [[work(4)], [work(5)]],
}


def test_resume_does_not_refetch_finished_windows(tmp_path):
    log = []
    fetch = paged_fetch(PAGES, log)
    with pytest.raises(ingest.BudgetExceeded):
        ingest.download(fetch, [W1, W2], tmp_path, max_calls=3)  # W1 takes 2 calls, W2 stops after 1
    assert (tmp_path / "raw" / "2010-01-01_2010-12-31" / "done.json").exists()
    assert not (tmp_path / "raw" / "2011-01-01_2011-12-31" / "done.json").exists()

    log.clear()
    res = ingest.download(fetch, [W1, W2], tmp_path, max_calls=10)
    assert res["calls"] == 2  # only the interrupted window was fetched again
    assert all("2011-01-01" in u for u in log)
    assert len(list(ingest.iter_raw_works(tmp_path))) == 5


def test_budget_guard_stops_before_exceeding(tmp_path):
    log = []
    with pytest.raises(ingest.BudgetExceeded):
        ingest.download(paged_fetch(PAGES, log), [W1, W2], tmp_path, max_calls=1)
    assert len(log) == 1


# ----------------------------------------------------------------- key safety


def test_key_never_in_logs_manifest_or_stored_urls(tmp_path, monkeypatch, caplog):
    monkeypatch.setenv(ingest.KEY_ENV, KEY)
    seen_urls = []
    fetch = paged_fetch(PAGES, seen_urls)
    with caplog.at_level(logging.DEBUG):
        ingest.download(fetch, [W1, W2], tmp_path, max_calls=10)
        manifest = ingest.build_corpus(tmp_path, "2026-11-07")
    assert KEY not in caplog.text
    assert not any(KEY in u or "api_key" in u for u in seen_urls)
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert KEY not in path.read_text(encoding="utf-8"), path
    assert KEY not in json.dumps(manifest)


def test_strip_key():
    assert ingest.strip_key("https://x/works?a=1&api_key=abc&b=2") == "https://x/works?a=1&b=2"
    assert ingest.strip_key("https://x/works?api_key=abc") == "https://x/works"
    assert ingest.strip_key("https://x/works?a=1&api_key=abc") == "https://x/works?a=1"


def test_real_fetcher_adds_key_but_scrubs_errors(monkeypatch):
    monkeypatch.setenv(ingest.KEY_ENV, KEY)
    requested = []

    def opener(req, timeout=0):
        requested.append(req.full_url)
        raise urllib.error.HTTPError(req.full_url, 403, "no", {}, None)

    fetch = ingest.make_fetcher(KEY, opener=opener, sleep=lambda s: None)
    with pytest.raises(RuntimeError) as exc:
        fetch("https://api.openalex.org/works?filter=x")
    assert "api_key=" + KEY in requested[0]
    assert KEY not in str(exc.value)


def test_real_fetcher_backs_off_on_429_and_5xx():
    codes = [429, 503, None]
    sleeps = []

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"ok": 1}'

    def opener(req, timeout=0):
        code = codes.pop(0)
        if code:
            raise urllib.error.HTTPError(req.full_url, code, "x", {}, None)
        return Resp()

    fetch = ingest.make_fetcher(None, opener=opener, sleep=sleeps.append)
    assert fetch("https://api.openalex.org/works?x=1") == {"ok": 1}
    assert sleeps == [1.0, 2.0]


def test_urls_carry_mailto_and_no_key():
    url = ingest.page_url(W1, "*")
    assert "mailto=" in url and "api_key" not in url
    assert "per_page=100" in url and "primary_topic.subfield.id:1702" in url
    assert "type:article|preprint|conference-paper" in url and "has_abstract:true" in url


# ----------------------------------------------------------------- records


def test_abstract_reconstruction_orders_by_position():
    inv = {"world": [1, 3], "hello": [0], "again": [2]}
    assert ingest.reconstruct_abstract(inv) == "hello world again world"
    assert ingest.reconstruct_abstract(None) == ""


def test_short_abstracts_dropped():
    assert ingest.to_record(work(1, n_words=49)) is None
    assert ingest.to_record(work(1, n_words=50)) is not None


def test_arxiv_id_from_doi_and_locations():
    assert ingest.arxiv_id_of({"doi": "https://doi.org/10.48550/arXiv.2101.00001v3"}) == "2101.00001"
    assert ingest.arxiv_id_of(work(1, arxiv="2102.00002")) == "2102.00002"
    assert ingest.arxiv_id_of({"locations": [{"pdf_url": "https://arxiv.org/pdf/2103.00003v1.pdf"}]}) == "2103.00003"
    assert ingest.arxiv_id_of(work(1)) is None


def test_date_rule_arxiv_month_else_openalex_date():
    with_id = ingest.to_record(work(1, arxiv="2003.01234", date="2021-01-01"))
    assert with_id["date"] == "2020-03-01" and with_id["year"] == 2020
    without = ingest.to_record(work(2, date="2019-07-15"))
    assert without["date"] == "2019-07-15"


def test_dedup_by_arxiv_id_prefers_preprint_record():
    journal = ingest.to_record(work(9, arxiv="2001.00001", typ="article"))
    pre = ingest.to_record(work(10, arxiv="2001.00001", typ="preprint"))
    other = ingest.to_record(work(11))
    out = ingest.dedupe([journal, pre, other, other])
    assert sorted(r["id"] for r in out) == sorted([pre["id"], other["id"]])


def test_build_corpus_end_to_end(tmp_path):
    pages = {
        "2010-01-01": [[work(1, arxiv="1001.0001"), work(2, n_words=10)]],
        "2011-01-01": [[work(3, arxiv="1001.0001", typ="preprint")]],
    }
    ingest.download(paged_fetch(pages), [W1, W2], tmp_path, max_calls=5)
    m = ingest.build_corpus(tmp_path, "2026-11-07")
    assert m["counts"] == {"works_seen": 3, "kept_after_abstract_rule": 2, "after_dedup": 1}
    assert m["retrieval_date"] == "2026-11-07" and m["input_pages"]
    first = next(iter(m["input_pages"].values()))
    assert len(first["sha256"]) == 64 and first["url"].startswith("https://api.openalex.org")
    assert len((tmp_path / "corpus.jsonl").read_text().splitlines()) == 1


# ----------------------------------------------------------------- sampling (issue #152)


def sample_fetch(per_day, log=None):
    """Fake API with per_day works per day. Sampled list requests return a seed-determined sample."""
    import random

    count_fetch, _ = make_counter(per_day)

    def fetch(url):
        if log is not None:
            log.append(url)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        if "sample" not in q:
            return count_fetch(url)
        flt = dict(p.split(":", 1) for p in q["filter"][0].split(","))
        a = dt.date.fromisoformat(flt["from_publication_date"])
        b = dt.date.fromisoformat(flt["to_publication_date"])
        total = ((b - a).days + 1) * per_day
        n, seed, page = int(q["sample"][0]), int(q["seed"][0]), int(q["page"][0])
        picked = random.Random(f"{seed}:{a}:{b}").sample(range(total), n)
        ids = picked[(page - 1) * 100 : page * 100]
        return {"meta": {"count": n}, "results": [work(f"{a}-{i}") for i in ids]}

    return fetch


def test_fraction_arithmetic_and_rounding():
    assert ingest.sample_size(0.1, 1000) == 100
    assert ingest.sample_size(0.1, 105) == 11  # 10.5 rounds half up, not to even
    assert ingest.sample_size(0.1, 104) == 10
    assert ingest.sample_size(0.5, 3) == 2
    assert ingest.sample_size(1.0, 7) == 7
    assert ingest.sample_size(0.1, 0) == 0
    for bad in (0, -0.1, 1.5):
        with pytest.raises(ValueError):
            ingest.parse_fraction(bad)


def test_window_splitting_at_the_10000_cap():
    # 40 works/day: ~14,600 a year; at F=0.5 a year samples ~7,300 (fits), at F=0.9 ~13,100 (split)
    plan = ingest.plan_sample(sample_fetch(40), TODAY, 0.5, 1, first_year=2020)
    y2020 = [w for w in plan["windows"] if w["year"] == 2020]
    assert len(y2020) == 1 and y2020[0]["sample_size"] == ingest.sample_size(0.5, y2020[0]["count"])

    plan = ingest.plan_sample(sample_fetch(40), TODAY, 0.9, 1, first_year=2020)
    y2020 = [w for w in plan["windows"] if w["year"] == 2020]
    assert len(y2020) == 2
    assert y2020[0]["end"] == "2020-06-30" and y2020[1]["start"] == "2020-07-01"  # month boundary
    assert sum(w["count"] for w in y2020) == 366 * 40
    for w in plan["windows"]:
        assert w["sample_size"] <= ingest.BASIC_LIMIT and not w["over_cap"]
        assert w["sample_size"] == ingest.sample_size(0.9, w["count"])  # same fraction everywhere
    assert plan["total_sample"] == sum(w["sample_size"] for w in plan["windows"])
    assert plan["list_calls"] == sum(-(-w["sample_size"] // 100) for w in plan["windows"])
    out = ingest.format_sample_plan(plan)
    assert "fraction 0.9" in out and "total list calls" in out


def test_split_window_months_boundaries():
    assert ingest.split_window_months(("2020-01-01", "2020-12-31")) == [
        ("2020-01-01", "2020-06-30"),
        ("2020-07-01", "2020-12-31"),
    ]
    assert ingest.split_window_months(("2020-01-01", "2020-02-29")) == [
        ("2020-01-01", "2020-01-31"),
        ("2020-02-01", "2020-02-29"),
    ]
    left, right = ingest.split_window_months(("2020-03-01", "2020-03-31"))  # inside a month: by days
    assert left[0] == "2020-03-01" and right[1] == "2020-03-31"


def test_planned_query_set_reproducible_for_fixed_seed():
    p1 = ingest.plan_sample(sample_fetch(40), TODAY, 0.9, 20261107, first_year=2020)
    p2 = ingest.plan_sample(sample_fetch(40), TODAY, 0.9, 20261107, first_year=2020)
    assert p1 == p2

    def urls(p, seed):
        return [ingest.sample_page_url((w["start"], w["end"]), w["sample_size"], seed, 1) for w in p["windows"]]

    assert urls(p1, 20261107) == urls(p2, 20261107)
    p3 = ingest.plan_sample(sample_fetch(40), TODAY, 0.9, 7, first_year=2020)
    assert p3["sampling"]["seed"] == 7 and urls(p3, 7) != urls(p1, 20261107)


def test_per_year_override_refused(tmp_path):
    for bad in ({2020: 0.1, 2021: 0.2}, "2020=0.1", "0.1,0.2", [0.1, 0.2]):
        with pytest.raises(ValueError, match="per-year"):
            ingest.parse_fraction(bad)
        with pytest.raises(ValueError, match="per-year"):
            ingest.plan_sample(sample_fetch(1), TODAY, bad, 1, first_year=2020)
    assert ingest.main(["plan", "--sample-fraction", "2020=0.1", "--seed", "1", "--out", str(tmp_path)]) == 2
    assert ingest.main(["plan", "--sample-fraction", "0.1", "--out", str(tmp_path)]) == 2  # seed required

    plan = ingest.plan_sample(sample_fetch(1), TODAY, 0.1, 1, first_year=2025)
    other = ingest.plan_sample(sample_fetch(1), TODAY, 0.1, 1, first_year=2025)
    with pytest.raises(ValueError, match="different fraction"):
        ingest.check_sample_plan(other, 0.2, 1)
    plan["windows"][0]["sample_size"] += 5  # hand-edited per-window override
    with pytest.raises(ValueError, match="global fraction"):
        ingest.download_sampled(sample_fetch(1), plan, tmp_path, max_calls=10)


def small_plan(seed=5, fraction=0.5):
    return ingest.plan_sample(sample_fetch(1), TODAY, fraction, seed, first_year=2024)


def test_sampled_download_never_cursors_and_is_reproducible(tmp_path):
    plan = small_plan()
    log = []
    ingest.download_sampled(sample_fetch(1, log), plan, tmp_path / "a", max_calls=50)
    page_urls = [u for u in log if "sample=" in u]
    assert page_urls and all("cursor" not in u and "page=" in u and "seed=5" in u for u in page_urls)
    assert not any("api_key" in u for u in log)
    ingest.download_sampled(sample_fetch(1), plan, tmp_path / "b", max_calls=50)

    def ids(d):
        return sorted(w["id"] for w in ingest.iter_raw_works(d))

    assert ids(tmp_path / "a") == ids(tmp_path / "b") and len(ids(tmp_path / "a")) > 0
    ingest.download_sampled(sample_fetch(1), small_plan(seed=6), tmp_path / "c", max_calls=50)
    assert ids(tmp_path / "c") != ids(tmp_path / "a")


def test_sampled_manifest_fields(tmp_path):
    plan = small_plan(seed=5, fraction=0.5)
    ingest.download_sampled(sample_fetch(1), plan, tmp_path, max_calls=50)
    m = ingest.build_corpus(tmp_path, "2026-11-07", plan)
    s = m["sampling"]
    assert s["fraction"] == 0.5 and s["seed"] == 5 and "uniform" in s["rule"]
    assert s["requested_total"] == plan["total_sample"] == s["returned_total"]
    assert all(w["requested"] == w["returned"] for w in m["windows"])
    assert [w["requested"] for w in m["windows"]] == [w["sample_size"] for w in plan["windows"]]


def test_sampled_download_resumes_and_refuses_mixed_samples(tmp_path):
    plan = ingest.plan_sample(sample_fetch(1), TODAY, 0.5, 5, first_year=2023)  # a window per year
    n_windows = len(plan["windows"])
    assert n_windows >= 2
    log = []
    with pytest.raises(ingest.BudgetExceeded):
        ingest.download_sampled(sample_fetch(1, log), plan, tmp_path, max_calls=3)
    done = list((tmp_path / "raw").glob("*/done.json"))
    assert 0 < len(done) < n_windows
    log.clear()
    res = ingest.download_sampled(sample_fetch(1, log), plan, tmp_path, max_calls=50)
    finished_first = plan["windows"][: len(done)]
    assert not any(f"from_publication_date:{w['start']}," in u for w in finished_first for u in log)
    assert res["calls"] > 0 and len(list((tmp_path / "raw").glob("*/done.json"))) == n_windows
    other = ingest.plan_sample(sample_fetch(1), TODAY, 0.5, 9, first_year=2023)
    with pytest.raises(ValueError, match="different sampling"):
        ingest.download_sampled(sample_fetch(1), other, tmp_path, max_calls=50)


def test_sampled_urls_carry_no_key(monkeypatch):
    monkeypatch.setenv(ingest.KEY_ENV, KEY)
    url = ingest.sample_page_url(W1, 300, 20261107, 2)
    assert "sample=300" in url and "seed=20261107" in url and "page=2" in url
    assert KEY not in url and "api_key" not in url and "cursor" not in url

def test_planning_end_caps_at_the_end_of_the_chosen_year():
    import datetime as dt

    from whitespace.pipeline import ingest as ing

    today = dt.date(2026, 11, 7)
    assert ing.planning_end(today, None) == today
    assert ing.planning_end(today, 2023) == dt.date(2023, 12, 31)
    assert ing.planning_end(today, 2030) == today  # a future year never extends the plan
