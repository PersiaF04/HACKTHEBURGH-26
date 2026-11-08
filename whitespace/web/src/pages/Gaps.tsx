import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { GapDetailResponse, GapListResponse, GapSummary, OpenProblemResponse } from "../api";
import { GapDrawer } from "../components/gaps/GapDrawer";
import { GapTable } from "../components/gaps/GapTable";
import type { GapSortKey } from "../components/gaps/GapTable";
import { OpenProblemsPage } from "./OpenProblemsPage";
import "../components/gaps/gaps.css";
import "./whitespace-pages.css";

export interface GapsPageProps {
  response: GapListResponse;
  loadDetail: (gap: GapSummary) => Promise<GapDetailResponse>;
  loading?: boolean;
  error?: string | null;
}

const sorters: Record<GapSortKey, (gap: GapSummary) => number | null> = {
  p_link: (gap) => gap.p_link,
  momentum: (gap) => gap.momentum,
  novelty: (gap) => gap.novelty,
  gap_rate: (gap) => gap.gap_rate,
  gap_score: (gap) => gap.gap_score,
};

const sortOptions: Array<[GapSortKey, string]> = [
  ["gap_score", "Gap score"], ["p_link", "P(link)"], ["momentum", "Momentum"], ["novelty", "Novelty"], ["gap_rate", "Stated-gap rate"],
];

function id(gap: GapSummary): string {
  return `${gap.a}::${gap.b}`;
}

interface ConceptRate { id: string; label: string; rate: number }

/** Per-concept stated-gap rate, taken from the gap rows that carry it. Absent rates are skipped, not zeroed. */
function conceptRates(items: GapSummary[]): ConceptRate[] {
  const map = new Map<string, ConceptRate>();
  for (const g of items) {
    if (g.gap_rate_a != null && Number.isFinite(g.gap_rate_a)) map.set(g.a, { id: g.a, label: g.a_label, rate: g.gap_rate_a });
    if (g.gap_rate_b != null && Number.isFinite(g.gap_rate_b)) map.set(g.b, { id: g.b, label: g.b_label, rate: g.gap_rate_b });
  }
  return [...map.values()].sort((x, y) => y.rate - x.rate);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[m - 1] + s[m]) / 2;
}

export function GapsPage({ response, loadDetail, loading = false, error }: GapsPageProps) {
  const [query, setQuery] = useState("");
  const [minimumProbability, setMinimumProbability] = useState(0);
  const [sort, setSort] = useState<GapSortKey>("gap_score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [focus, setFocus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<GapSummary | null>(null);
  const [detail, setDetail] = useState<GapDetailResponse>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [problems, setProblems] = useState<OpenProblemResponse | null>(null);
  const [problemStatus, setProblemStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [problemError, setProblemError] = useState<string>();
  const [problemType, setProblemType] = useState<"all" | "future_work" | "limitation" | "open_problem">("all");
  const [problemConcept, setProblemConcept] = useState("");
  const [problemRetry, setProblemRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setProblemStatus("loading");
    api.openProblems(problemConcept, problemType === "all" ? "" : problemType)
      .then((value) => { if (current) { setProblems(value); setProblemStatus("ready"); } })
      .catch((reason: unknown) => {
        if (current) {
          setProblemStatus("error");
          setProblemError(reason instanceof Error ? reason.message : "Statements could not be loaded.");
        }
      });
    return () => { current = false; };
  }, [problemConcept, problemType, problemRetry]);

  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return response.items
      .filter((gap) => gap.p_link >= minimumProbability)
      .filter((gap) => !q || `${gap.a_label} ${gap.b_label}`.toLocaleLowerCase().includes(q))
      .filter((gap) => !focus || gap.a === focus || gap.b === focus)
      .sort((left, right) => {
        const a = sorters[sort](left);
        const b = sorters[sort](right);
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return (a - b) * (sortDirection === "asc" ? 1 : -1);
      })
      .slice(0, 50);
  }, [response.items, query, minimumProbability, focus, sort, sortDirection]);

  const rates = useMemo(() => conceptRates(response.items), [response.items]);
  const maxRate = rates[0]?.rate || 1;
  const shownRates = showAll ? rates : rates.slice(0, 8);
  const focusLabel = focus
    ? response.items.find((g) => g.a === focus)?.a_label ?? response.items.find((g) => g.b === focus)?.b_label ?? focus
    : null;

  const conceptCount = useMemo(() => new Set(response.items.flatMap((g) => [g.a, g.b])).size, [response.items]);
  const medianP = median(items.map((g) => g.p_link));
  const topScore = items.reduce<number | null>((m, g) => g.gap_score != null && (m == null || g.gap_score > m) ? g.gap_score : m, null);
  const bothSides = items.filter((g) => (g.gap_rate_a ?? 0) >= 0.1 && (g.gap_rate_b ?? 0) >= 0.1).length;
  const fmt = (v: number | null) => v == null ? "not available" : v.toFixed(2);

  useEffect(() => {
    if (!selected) return;
    const currentRequest = ++requestId.current;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    loadDetail(selected)
      .then((result) => { if (currentRequest === requestId.current) setDetail(result); })
      .catch((reason: unknown) => {
        if (currentRequest === requestId.current) setDetailError(reason instanceof Error ? reason.message : "The detail could not be loaded.");
      })
      .finally(() => { if (currentRequest === requestId.current) setDetailLoading(false); });
    return () => { requestId.current += 1; };
  }, [selected, loadDetail]);

  const handleSort = useCallback((key: GapSortKey) => {
    if (sort === key) setSortDirection((d) => d === "asc" ? "desc" : "asc");
    else { setSort(key); setSortDirection("desc"); }
  }, [sort]);

  function closeDetail() {
    requestId.current += 1;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  const summary: Array<[string, string]> = [
    ["Gaps shown", String(items.length)],
    ["Median P(link)", fmt(medianP)],
    ["Top gap score", fmt(topScore)],
    ["Open problems on both sides", String(bothSides)],
  ];

  return (
    <div className="gaps-layout">
      <aside className="gaps-rail" aria-label="Filters and overview">
        <label className="gaps-field">
          <span>Concept</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search concept labels" />
        </label>
        <p className="gaps-field__note">Research-area grouping is not available in the data yet, so filtering is by concept name.</p>
        <label className="gaps-field">
          <span className="gaps-field__row">Minimum P(link)<span className="gap-mono">{minimumProbability.toFixed(2)}</span></span>
          <input type="range" min="0" max="0.8" step="0.05" value={minimumProbability} onChange={(e) => setMinimumProbability(Number(e.currentTarget.value))} />
        </label>
        <label className="gaps-field">
          <span>Sort gaps by</span>
          <select value={sort} onChange={(e) => { setSort(e.currentTarget.value as GapSortKey); setSortDirection("desc"); }}>
            {sortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>

        <section aria-labelledby="gf-ov" className="gaps-rail__section">
          <h2 id="gf-ov">At a glance</h2>
          <dl className="gaps-ov">
            <div><dt>Concepts</dt><dd className="gap-mono">{conceptCount}</dd></div>
            <div><dt>Predicted gaps</dt><dd className="gap-mono">{response.items.length}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="gf-conc" className="gaps-rail__section">
          <h2 id="gf-conc">Concepts by stated-gap rate</h2>
          {rates.length === 0 ? <p className="gaps-field__note">Not available: no concept in the data carries a stated-gap rate.</p> : (
            <>
              <p className="gaps-field__note">Share of a concept's papers that name an open problem. Pick one to see its gaps.</p>
              <ul className="gaps-concepts">
                {shownRates.map((c) => (
                  <li key={c.id}>
                    <button type="button" aria-pressed={focus === c.id} onClick={() => setFocus((cur) => cur === c.id ? null : c.id)}>
                      <span className="gaps-concepts__row"><span>{c.label}</span><span className="gap-mono">{Math.round(c.rate * 100)}%</span></span>
                      <span className="gaps-concepts__bar"><span style={{ width: `${Math.round((c.rate / maxRate) * 100)}%` }} /></span>
                    </button>
                  </li>
                ))}
              </ul>
              {rates.length > 8 && <button type="button" className="gaps-link" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show all ${rates.length}`}</button>}
            </>
          )}
        </section>
      </aside>

      <div className="gaps-centre">
        <div className="gaps-head">
          <p className="gaps-page__intro">Concept pairs not yet linked (fewer than 3 shared papers), ranked, with what authors themselves say is unsolved. P(link) is the model's predicted probability; the gap score is a separate ranking score, not a probability.</p>
          {response.placeholder && <span className="gaps-badge">Placeholder data, not results</span>}
        </div>
        <dl className="gaps-summary">
          {summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="gap-mono">{value}</dd></div>)}
        </dl>
        {focus && (
          <p className="gaps-focus" aria-live="polite">Gaps involving <strong>{focusLabel}</strong>
            <button type="button" onClick={() => setFocus(null)} aria-label="Clear concept filter">Clear</button></p>
        )}
        <GapTable
          items={items}
          selectedId={selected ? id(selected) : null}
          sort={sort}
          sortDirection={sortDirection}
          loading={loading}
          error={error}
          placeholder={response.placeholder && items.length === 0}
          onSort={handleSort}
          onSelect={setSelected}
        />
        <div id="open-problems">
          <OpenProblemsPage
            response={problems}
            selectedConcept={problemConcept}
            onConceptChange={setProblemConcept}
            selectedType={problemType}
            onTypeChange={setProblemType}
            status={problemStatus}
            errorMessage={problemError}
            onRetry={() => setProblemRetry((n) => n + 1)}
          />
        </div>
      </div>

      <GapDrawer
        open={selected !== null}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        placeholder={response.placeholder}
        onClose={closeDetail}
      />
    </div>
  );
}
