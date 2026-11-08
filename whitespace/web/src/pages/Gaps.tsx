import { useEffect, useMemo, useRef, useState } from "react";
import type { GapDetailResponse, GapListResponse, GapSummary } from "../api";
import { GapDetailPanel, GapTable, GapTableSkeleton, gapKey } from "../components/gaps";
import type { GapRow } from "../components/gaps";
import { ModelNote } from "../components/ModelNote";
import { NA, fmtDec, fmtInt, fmtP, fmtText, isNum } from "../lib/format";
import "../components/gaps/gaps.css";
import "./whitespace-pages.css";

export interface GapsPageProps {
  response: GapListResponse;
  loadDetail: (gap: GapSummary) => Promise<GapDetailResponse>;
  loading?: boolean;
  error?: string | null;
}

type SortKey = "gap_score" | "p_link" | "momentum" | "novelty";

const sortOptions: Array<[SortKey, string]> = [
  ["gap_score", "Gap score"], ["p_link", "P(link)"], ["momentum", "Momentum"], ["novelty", "Novelty"],
];

function sortValue(g: GapSummary, key: SortKey): number | null {
  return g[key];
}

interface ConceptInfo { id: string; label: string; growth: number | null }

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[m - 1] + s[m]) / 2;
}

export function GapsPage({ response, loadDetail, loading = false, error }: GapsPageProps) {
  const [minimumProbability, setMinimumProbability] = useState(0);
  const [sort, setSort] = useState<SortKey>("gap_score");
  const [focus, setFocus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GapDetailResponse>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Rank is over the whole list by gap score, independent of the sort and filters.
  const ranks = useMemo(() => {
    const map = new Map<string, number>();
    [...response.items]
      .sort((a, b) => (b.gap_score ?? -Infinity) - (a.gap_score ?? -Infinity))
      .forEach((g, i) => map.set(gapKey(g), i + 1));
    return map;
  }, [response.items]);

  const rows: GapRow[] = useMemo(() => response.items
    .filter((g) => minimumProbability <= 0 || (isNum(g.p_link) && g.p_link >= minimumProbability - 1e-9))
    .filter((g) => !focus || g.a === focus || g.b === focus)
    .sort((l, r) => {
      const a = sortValue(l, sort);
      const b = sortValue(r, sort);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return b - a;
    })
    .map((gap) => ({ gap, rank: ranks.get(gapKey(gap)) ?? 0 })), [response.items, minimumProbability, focus, sort, ranks]);

  const concepts = useMemo(() => {
    const map = new Map<string, ConceptInfo>();
    const touch = (id: string, label: string, growth: number | null | undefined) => {
      const cur = map.get(id) ?? { id, label, growth: null };
      if (isNum(growth)) cur.growth = growth;
      map.set(id, cur);
    };
    for (const g of response.items) {
      touch(g.a, g.a_label, g.growth_a);
      touch(g.b, g.b_label, g.growth_b);
    }
    return [...map.values()];
  }, [response.items]);
  const growing = useMemo(() => concepts.filter((c) => c.growth != null && c.growth > 0).sort((x, y) => (y.growth as number) - (x.growth as number)), [concepts]);
  const maxGrowth = growing[0]?.growth || 1;
  const shownGrowing = showAll ? growing : growing.slice(0, 8);
  const fastest = growing[0];

  // Nothing is selected until the reader picks a row; a filtered-out pick clears itself.
  const selected = rows.find((r) => gapKey(r.gap) === selectedId) ?? null;
  const selGap = selected?.gap ?? null;
  const selKey = selGap ? gapKey(selGap) : null;

  useEffect(() => {
    if (!selGap) { setDetail(null); return; }
    const current = ++requestId.current;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    loadDetail(selGap)
      .then((result) => { if (current === requestId.current) setDetail(result); })
      .catch((reason: unknown) => { if (current === requestId.current) setDetailError(reason instanceof Error ? reason.message : "The detail could not be loaded."); })
      .finally(() => { if (current === requestId.current) setDetailLoading(false); });
    return () => { requestId.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, loadDetail]);

  const empty = response.items.length === 0;
  function resetFilters() { setMinimumProbability(0); setFocus(null); }
  const focusLabel = focus ? concepts.find((c) => c.id === focus)?.label ?? focus : null;

  const medianP = median(rows.map((r) => r.gap.p_link).filter(isNum));
  const topScore = rows.reduce<number | null>((m, r) => isNum(r.gap.gap_score) && (m == null || r.gap.gap_score > m) ? r.gap.gap_score : m, null);
  const hasMomentum = response.items.some((g) => isNum(g.momentum) && g.momentum !== 0);
  const topProbability = rows.reduce<number | null>((m, r) => isNum(r.gap.p_link) && (m == null || r.gap.p_link > m) ? r.gap.p_link : m, null);
  const maxScore = Math.max(0, ...response.items.map((g) => g.gap_score ?? 0));
  const summary: Array<[string, string, boolean, string]> = [
    ["Gaps shown", empty ? NA : fmtInt(rows.length), false, "Pairs that pass the filters"],
    ["Median P(link)", empty ? NA : fmtP(medianP), true, "Typical chance of linking among them"],
    [hasMomentum ? "Top gap score" : "Top P(link)", empty ? NA : hasMomentum ? fmtScore(topScore) : fmtP(topProbability), false, hasMomentum ? "Highest score among them" : "Gap score unavailable; highest predicted link probability"],
    ["Focused area", focusLabel ? fmtText(focusLabel) : "All concepts", false, "Use the left rail to narrow the list"],
  ];
  const stats: Array<[string, string]> = [
    ["Concepts", empty ? NA : fmtInt(concepts.length)],
    ["Predicted gaps", empty ? NA : fmtInt(response.items.length)],
    ["Growing concepts", empty ? NA : fmtInt(growing.length)],
  ];

  function pick(c: ConceptInfo) {
    if (focus === c.id) { setFocus(null); return; }
    setFocus(c.id);
    const first = response.items.filter((g) => g.a === c.id || g.b === c.id).sort((x, y) => (y.gap_score ?? 0) - (x.gap_score ?? 0))[0];
    if (first) setSelectedId(gapKey(first));
  }

  return (
    <div className="gx">
      <aside className="gx-rail" aria-label="Filters and overview" data-tour="gap-filters">
        <div className="gx-field">
          <div className="gx-field__row"><label htmlFor="gf-minp">Minimum P(link)</label><span className="gx-mono">{empty ? NA : fmtDec(minimumProbability)}</span></div>
          <input id="gf-minp" type="range" min="0" max="0.8" step="0.05" value={minimumProbability} disabled={empty} aria-describedby="gf-minp-h" onChange={(e) => setMinimumProbability(Number(e.currentTarget.value))} />
          <p id="gf-minp-h" className="gx-help">Hide pairs the model rates below this chance of linking</p>
        </div>
        <div className="gx-field">
          <label htmlFor="gf-sort">Sort gaps by</label>
          <select id="gf-sort" value={sort} disabled={empty} aria-describedby="gf-sort-h" onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
            {sortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <p id="gf-sort-h" className="gx-help">Choose which measure orders the table</p>
        </div>

        <section className="gx-sec" aria-labelledby="gf-ov">
          <h2 id="gf-ov" className="gx-label">All areas at a glance</h2>
          {empty && <p className="gx-help">Totals across every concept in the export</p>}
          <div className="gx-stats">
            {stats.map(([label, v]) => (
              <div key={label} className="gx-stat"><span className="gx-stat__l">{label}</span><span className="gx-stat__v">{v}</span></div>
            ))}
          </div>
          {fastest && (
            <p className="gx-fast">
              {fastest && <>Fastest growing: <strong>{fmtText(fastest.label)}</strong>. </>}
            </p>
          )}
        </section>

        {growing.length > 0 && (
          <section className="gx-sec gx-sec--6" aria-labelledby="gf-conc">
            <h2 id="gf-conc" className="gx-label">Concepts by recent growth</h2>
            <p className="gx-help">Choose a concept to focus the gap list on pairs involving it.</p>
            <ul className="gx-concepts">
              {shownGrowing.map((c) => (
                <li key={c.id}>
                  <button type="button" aria-pressed={focus === c.id} className="gx-concept" onClick={() => pick(c)}>
                    <span className="gx-concept__row"><span>{fmtText(c.label)}</span><span className="gx-mono">{fmtDec(c.growth)}</span></span>
                    <span className="gx-concept__bar"><span style={{ width: `${Math.round(((c.growth as number) / maxGrowth) * 100)}%` }} /></span>
                  </button>
                </li>
              ))}
            </ul>
            {growing.length > 8 && <button type="button" className="gx-more" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show all ${growing.length} concepts`}</button>}
          </section>
        )}
      </aside>

      <section className="gx-centre" aria-labelledby="gf-h">
        <div className="gx-titles" data-tour="gap-list">
          <h1 id="gf-h" className="gx-h1">Gap Finder</h1>
          <p className="gx-desc">Concept pairs not yet linked (fewer than 3 shared papers), ranked by model probability, momentum and novelty.{!empty && <> <span className="gx-mono gx-ink">{fmtInt(rows.length)}</span> gaps shown.</>}</p>
        </div>

        <ModelNote />

        <div className="gx-summary">
          {summary.map(([label, v, blue, cap]) => (
            <div key={label} className="gx-summary__c"><span className="gx-summary__l">{label}</span><span className="gx-summary__v" style={blue && !empty ? { color: "var(--ws-accent)" } : undefined}>{v}</span><span className="gx-summary__cap">{cap}</span></div>
          ))}
        </div>

        {focus && (
          <div className="gx-focus">
            <span>Gaps involving</span>
            <span className="gx-focus__pill">{fmtText(focusLabel)}
              <button type="button" aria-label="Clear concept filter" onClick={() => setFocus(null)}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" style={{ stroke: "var(--ws-on-ink)" }} strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </span>
          </div>
        )}

        {empty
          ? <GapTableSkeleton loading={loading} error={error} />
          : <GapTable rows={rows} maxScore={maxScore} selectedId={selKey} loading={loading} error={error} onSelect={(g) => setSelectedId(gapKey(g))} onReset={resetFilters} />}

      </section>

      <div data-tour="gap-detail"><GapDetailPanel gap={selGap} rank={selected?.rank ?? null} total={response.items.length} detail={detail} loading={detailLoading} error={detailError} empty={empty} /></div>
    </div>
  );
}

function fmtScore(value: number | null): string {
  return value == null ? NA : new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 }).format(value);
}
