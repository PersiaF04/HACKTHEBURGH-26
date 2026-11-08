import { useEffect, useMemo, useRef, useState } from "react";
import type { GapDetailResponse, GapListResponse, GapSummary } from "../api";
import { GapDetailPanel, GapTable, GapTableSkeleton, gapKey } from "../components/gaps";
import type { GapRow } from "../components/gaps";
import { ModelNote } from "../components/ModelNote";
import { NA, fmtDec, fmtGrowth, fmtInt, fmtPct, fmtText, isNum } from "../lib/format";
import "../components/gaps/gaps.css";
import "./whitespace-pages.css";

export interface GapsPageProps {
  response: GapListResponse;
  loadDetail: (gap: GapSummary) => Promise<GapDetailResponse>;
  loading?: boolean;
  error?: string | null;
}

type SortKey = "gap_score" | "p_link" | "momentum" | "novelty";

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
    .filter((g) => !focus || g.a === focus || g.b === focus)
    .sort((l, r) => {
      const a = sortValue(l, sort);
      const b = sortValue(r, sort);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return b - a;
    })
    .map((gap) => ({ gap, rank: ranks.get(gapKey(gap)) ?? 0 })), [response.items, focus, sort, ranks]);

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
  function resetFilters() { setFocus(null); }
  const focusLabel = focus ? concepts.find((c) => c.id === focus)?.label ?? focus : null;

  const medianP = median(rows.map((r) => r.gap.p_link).filter(isNum));
  const maxScore = Math.max(0, ...response.items.map((g) => g.gap_score ?? 0));
  const summary: Array<[string, string, boolean, string]> = [
    ["Gaps shown", empty ? NA : fmtInt(rows.length), false, "Pairs that pass the filters"],
    ["Typical likelihood", empty ? NA : fmtPct(medianP), true, "Median model estimate among them"],
    ["Focused area", focusLabel ? fmtText(focusLabel) : "All concepts", false, "Use the left rail to narrow the list"],
  ];
  const shrinking = concepts.filter((c) => c.growth != null && c.growth < 0).length;
  const gapCount = new Map<string, { label: string; n: number }>();
  for (const g of response.items) for (const [id, label] of [[g.a, g.a_label], [g.b, g.b_label]] as const) gapCount.set(id, { label, n: (gapCount.get(id)?.n ?? 0) + 1 });
  const busiest = [...gapCount.values()].sort((x, y) => y.n - x.n)[0];
  const strongest = [...response.items].sort((x, y) => (y.gap_score ?? 0) - (x.gap_score ?? 0))[0];
  const glance: Array<[string, string, string]> = empty ? [] : [
    ["Concepts in gaps", fmtInt(concepts.length), "Distinct topics that appear in at least one gap"],
    ["Predicted gaps", fmtInt(response.items.length), "Pairs with under 3 shared papers that the model expects to connect"],
    ["Growing / shrinking", `${fmtInt(growing.length)} / ${fmtInt(shrinking)}`, `${concepts.length ? Math.round((growing.length / concepts.length) * 100) : 0}% of these concepts are growing`],
    ["Fastest growing", fastest ? fmtText(fastest.label) : NA, fastest ? `${fmtGrowth(fastest.growth)} over three years` : ""],
    ["Most gaps", busiest ? fmtText(busiest.label) : NA, busiest ? `Appears in ${fmtInt(busiest.n)} of the ${fmtInt(response.items.length)} gaps` : ""],
    ["Strongest gap", strongest ? `${fmtText(strongest.a_label)} × ${fmtText(strongest.b_label)}` : NA, strongest ? `Gap score ${fmtDec(strongest.gap_score)}` : ""],
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

        <section className="gx-sec" aria-labelledby="gf-ov">
          <h2 id="gf-ov" className="gx-label">All areas at a glance</h2>
          {empty ? <p className="gx-help">Totals across every concept in the export</p> : (
            <>
              <p className="gx-help">{fmtInt(response.items.length)} predicted gaps connect {fmtInt(concepts.length)} concepts; {fmtInt(growing.length)} of them are growing.</p>
              <dl className="gx-glance">
                {glance.map(([label, v, note]) => (
                  <div key={label} className="gx-glance__row"><dt>{label}</dt><dd>{v}</dd><dd className="gx-glance__note">{note}</dd></div>
                ))}
              </dl>
            </>
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
                    <span className="gx-concept__row"><span>{fmtText(c.label)}</span><span className="gx-mono">{fmtGrowth(c.growth)}</span></span>
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
          <p className="gx-desc gx-question">Which pairs of AI topics aren't studied together yet, but probably will be?</p>
          <p className="gx-desc">Each row is two topics with fewer than 3 shared papers so far.{!empty && <> <span className="gx-mono gx-ink">{fmtInt(rows.length)}</span> gaps shown.</>}</p>
        </div>

        <ul className="gx-factors" aria-label="What the ranking combines">
          <li><strong>Likelihood</strong>: will the two topics connect? It is high on every row because this list shows only the highest-scoring pairs; read it as a ranking, not a chance.</li>
          <li><strong>Momentum</strong>: are both topics growing?</li>
          <li><strong>Novelty</strong>: is the combination still uncrowded?</li>
          <li><strong>Stated gaps</strong> (shown, not scored): how often authors writing on either topic say problems remain open.</li>
        </ul>

        <details className="gx-how">
          <summary>How this is measured</summary>
          <ModelNote />
          {response.held_out_test === false && response.label && <p className="gx-note" role="note">{response.label}</p>}
        </details>

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
          : <GapTable sort={sort} onSort={(k) => setSort(k)} rows={rows} maxScore={maxScore} selectedId={selKey} loading={loading} error={error} onSelect={(g) => setSelectedId(gapKey(g))} onReset={resetFilters} />}

      </section>

      <div className="gx-detailcol" data-tour="gap-detail"><GapDetailPanel gap={selGap} rank={selected?.rank ?? null} total={response.items.length} detail={detail} loading={detailLoading} error={detailError} empty={empty} /></div>
    </div>
  );
}

