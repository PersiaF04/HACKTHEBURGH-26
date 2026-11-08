import type { KeyboardEvent } from "react";
import type { GapSummary } from "../../api";
import { NA, fmtDec, fmtPct, fmtText, isNum } from "../../lib/format";
import { HelpTip } from "./HelpTip";

export interface GapRow {
  gap: GapSummary;
  rank: number;
}

export type GapSortKey = "gap_score" | "p_link" | "momentum" | "novelty";

export interface GapTableProps {
  sort?: GapSortKey;
  onSort?: (key: GapSortKey) => void;
  rows: GapRow[];
  maxScore: number;
  selectedId: string | null;
  loading?: boolean;
  error?: string | null;
  onSelect: (gap: GapSummary) => void;
  /** Clears the minimum P(link) and the concept filter. */
  onReset?: () => void;
}

/** Relative to the top gap in the list, so the label never claims an absolute meaning. */
const strength = (v: number | null | undefined, max: number) => !isNum(v) || max <= 0 ? NA : v / max >= 2 / 3 ? "Strong" : v / max >= 1 / 3 ? "Moderate" : "Weak";
const clamp = (v: number) => Math.max(0, Math.min(100, v * 100));
const fmtScore = (v: number | null | undefined) => isNum(v) ? new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 }).format(v) : NA;

/** Stated-gaps multiplier: 1 + both concepts' stated-gap rates, only when both are in the data. */
/** Display-only stated-gap rates for the two concepts, e.g. "3.4% · 5.1%"; null unless both are in the data. */
export function ratePair(g: GapSummary): string | null {
  return isNum(g.gap_rate_a) && isNum(g.gap_rate_b) ? `${(g.gap_rate_a * 100).toFixed(1)}% · ${(g.gap_rate_b * 100).toFixed(1)}%` : null;
}

export function statedGapsFactor(g: GapSummary): number | null {
  return isNum(g.gap_rate_a) && isNum(g.gap_rate_b) ? 1 + g.gap_rate_a + g.gap_rate_b : null;
}

/** "×1.23", or the shared missing-value mark. */
export const fmtFactor = (v: number | null | undefined): string => (isNum(v) ? `×${fmtDec(v)}` : NA);

export const gapKey = (g: GapSummary) => `${g.a}::${g.b}`;

const COLUMNS: Array<{ label: string; cls: string; help: string; align?: "right"; sort?: GapSortKey }> = [
  { label: "#", cls: "gx-th--rank", sort: "gap_score", help: "Position in the full ranking by gap score, whatever the current filters." },
  { label: "Concept pair", cls: "", help: "Two research concepts that do not yet share three or more papers." },
  { label: "Likelihood", cls: "gx-th--p", sort: "p_link", help: "The model's estimate that these two topics will share 3+ papers within three years. Calibration is imperfect, so read it as a ranking rather than an exact chance." },
  { label: "Momentum", cls: "gx-th--r", align: "right", sort: "momentum", help: "How quickly paper counts for the two concepts are growing. Faster growth scores higher." },
  { label: "Novelty", cls: "gx-th--r", align: "right", sort: "novelty", help: "How little the two concepts' neighbourhoods already overlap. Higher means a fresher combination." },
  { label: "Stated gaps", cls: "gx-th--r", align: "right", help: "Display only, not part of the gap score. The share of each concept's papers whose abstract states an open problem (concept A, then B); this export counts open-problem statements only." },
  { label: "Strength", cls: "gx-th--score", align: "right", sort: "gap_score", help: "Strong, moderate or weak compared with the top gap in this list. It combines likelihood, momentum and novelty and is not a probability. Hover a value to see the exact score." },
];

/** Header row with real column names and a (?) explanation on each. */
export function GapTableHead({ sort, onSort }: { sort?: GapSortKey; onSort?: (key: GapSortKey) => void } = {}) {
  return (
    <thead>
      <tr>
        {COLUMNS.map((c) => (
          <th key={c.label} scope="col" className={`gx-th ${c.cls}`.trim()} aria-sort={onSort && c.sort ? (sort === c.sort ? "descending" : "none") : undefined}>
            <span className="gx-th__in">
              {onSort && c.sort && c.label !== "#"
                ? <button type="button" className={sort === c.sort ? "gx-sortbtn is-on" : "gx-sortbtn"} title={`Sort by ${c.label.toLowerCase()}, highest first`} onClick={() => onSort(c.sort as GapSortKey)}>{c.label}<span aria-hidden="true" className="gx-sortbtn__ar">{sort === c.sort ? "▼" : "↕"}</span></button>
                : c.label}
              <HelpTip label={c.label} text={c.help} align={c.align ?? "left"} />
            </span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

const SKELETON_ROWS = 8;

export interface GapTableSkeletonProps {
  loading?: boolean;
  error?: string | null;
}

/** Neutral stand-in for the ranked table: no numbers, no names. */
export function GapTableSkeleton({ loading, error }: GapTableSkeletonProps) {
  return (
    <div className={`gx-tablecard gx-skel${loading ? " is-loading" : ""}`} aria-busy={loading || undefined}>
      <table className="gx-table">
        <GapTableHead />
        <tbody aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <tr key={i} className="gx-row gx-row--skel">
              <td className="gx-td gx-td--rank"><span className="gx-bar gx-bar--xs" /></td>
              <td className="gx-td"><span className="gx-bar gx-bar--pair" style={{ width: `${58 + ((i * 17) % 30)}%` }} /></td>
              <td className="gx-td"><span className="gx-bar gx-bar--full" /></td>
              <td className="gx-td gx-td--r"><span className="gx-bar gx-bar--sm" /></td>
              <td className="gx-td gx-td--r"><span className="gx-bar gx-bar--sm" /></td>
              <td className="gx-td gx-td--r"><span className="gx-bar gx-bar--sm" /></td>
              <td className="gx-td gx-td--score"><span className="gx-bar gx-bar--full" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {error
        ? <p className="gx-empty" role="alert">Could not load gaps: {error}</p>
        : <p className="gx-empty" role="status">{loading ? "Loading ranked gaps…" : "Ranked gaps appear here when the pipeline export is loaded"}</p>}
    </div>
  );
}

export function GapTable({ rows, maxScore, selectedId, loading, error, onSelect, onReset, sort, onSort }: GapTableProps) {
  function onKey(e: KeyboardEvent<HTMLTableRowElement>, gap: GapSummary) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(gap); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const sib = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLTableRowElement | null;
    sib?.focus();
    const idx = rows.findIndex((r) => gapKey(r.gap) === gapKey(gap)) + (e.key === "ArrowDown" ? 1 : -1);
    if (rows[idx]) onSelect(rows[idx].gap);
  }
  return (
    <div className={`gx-tablecard${loading ? " is-loading" : ""}`} aria-busy={loading || undefined}>
      <table className="gx-table">
        <GapTableHead sort={sort} onSort={onSort} />
        <tbody>
          {rows.map(({ gap, rank }) => {
            const key = gapKey(gap);
            const sel = selectedId === key;
            const hasInterval = isNum(gap.p_lo) && isNum(gap.p_hi) && gap.p_lo <= gap.p_hi;
            const pair = `${fmtText(gap.a_label)} and ${fmtText(gap.b_label)}`;
            return (
              <tr
                key={key}
                className={sel ? "gx-row is-selected" : "gx-row"}
                tabIndex={0}
                aria-current={sel ? "true" : undefined}
                aria-label={`Rank ${rank}: ${pair}${sel ? ", selected" : ""}`}
                onClick={() => onSelect(gap)}
                onKeyDown={(e) => onKey(e, gap)}
              >
                <td className="gx-td gx-td--rank">{rank}</td>
                <td className="gx-td gx-td--pair">
                  <span className="gx-pair">
                    <span className="gx-pair__names">{fmtText(gap.a_label)} <span className="gx-pair__join">↔</span> {fmtText(gap.b_label)}</span>
                    {sel && <span className="gx-pair__sel">Selected · details on the right</span>}
                  </span>
                </td>
                <td className="gx-td">
                  <div className="gx-plink">
                    <span className="gx-plink__v">{fmtPct(gap.p_link)}</span>
                    <span className="gx-plink__bar" aria-hidden="true">
                      <span className="gx-plink__line" />
                      {hasInterval && <span className="gx-plink__range" style={{ left: `${clamp(gap.p_lo as number)}%`, width: `${clamp(gap.p_hi as number) - clamp(gap.p_lo as number)}%` }} />}
                      {isNum(gap.p_link) && <span className="gx-plink__pt" style={{ left: `${clamp(gap.p_link)}%` }} />}
                    </span>
                  </div>
                </td>
                <td className="gx-td gx-td--r gx-mono">{fmtDec(gap.momentum)}</td>
                <td className="gx-td gx-td--r gx-mono">{fmtDec(gap.novelty)}</td>
                <td className="gx-td gx-td--r gx-mono gx-rates">{ratePair(gap) === null ? <span className="gx-pending" title="Author-stated open problems are not available for this pair in the export yet.">Not yet</span> : <span title="Share of each concept's papers with a stated open problem. Display only, not in the gap score.">{ratePair(gap)}</span>}</td>
                <td className="gx-td gx-td--score">
                  <div className="gx-score">
                    <span className="gx-score__v" title={`Gap score ${fmtScore(gap.gap_score)}`}>{strength(gap.gap_score, maxScore)}</span>
                    <span className="gx-score__track"><span className="gx-score__fill" style={{ width: `${isNum(gap.gap_score) && maxScore > 0 ? Math.round((gap.gap_score / maxScore) * 100) : 0}%` }} /></span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && <p className="gx-empty" role="status">Loading ranked gaps…</p>}
      {error && <p className="gx-empty" role="alert">Could not load gaps: {error}</p>}
      {!loading && !error && rows.length === 0 && (
        <div className="gx-empty gx-empty--filters" role="status">
          <p className="gx-empty__t">No gaps pass these filters</p>
          <p>Lower the minimum likelihood or clear the concept filter.</p>
          {onReset && <button type="button" className="gx-btn" onClick={onReset}>Reset filters</button>}
        </div>
      )}
    </div>
  );
}
