import type { GapSummary } from "../../api";
import { f2, isNum } from "./format";

export interface GapRow {
  gap: GapSummary;
  rank: number;
}

export interface GapTableProps {
  rows: GapRow[];
  maxScore: number;
  selectedId: string | null;
  loading?: boolean;
  error?: string | null;
  onSelect: (gap: GapSummary) => void;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v * 100));

/** Stated-gaps multiplier: 1 + both concepts' stated-gap rates, only when both are in the data. */
export function statedGapsFactor(g: GapSummary): number | null {
  return isNum(g.gap_rate_a) && isNum(g.gap_rate_b) ? 1 + g.gap_rate_a + g.gap_rate_b : null;
}

export const gapKey = (g: GapSummary) => `${g.a}::${g.b}`;

export function GapTable({ rows, maxScore, selectedId, loading, error, onSelect }: GapTableProps) {
  return (
    <div className="gx-tablecard">
      <table className="gx-table">
        <thead>
          <tr>
            <th scope="col" className="gx-th gx-th--rank">#</th>
            <th scope="col" className="gx-th">Concept pair</th>
            <th scope="col" className="gx-th gx-th--p">P(link) · bootstrap interval</th>
            <th scope="col" className="gx-th gx-th--r">Momentum</th>
            <th scope="col" className="gx-th gx-th--r">Novelty</th>
            <th scope="col" className="gx-th gx-th--r">Stated gaps</th>
            <th scope="col" className="gx-th gx-th--score">Gap score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ gap, rank }) => {
            const sel = selectedId === gapKey(gap);
            const hasInterval = isNum(gap.p_lo) && isNum(gap.p_hi) && gap.p_lo <= gap.p_hi;
            const sg = statedGapsFactor(gap);
            return (
              <tr key={gapKey(gap)} className={sel ? "gx-row is-selected" : "gx-row"}>
                <td className="gx-td gx-td--rank">{rank}</td>
                <td className="gx-td gx-td--pair">
                  <button type="button" className="gx-pair" aria-pressed={sel} onClick={() => onSelect(gap)}>
                    <span className="gx-pair__names">{gap.a_label} <span className="gx-pair__join">↔</span> {gap.b_label}</span>
                  </button>
                </td>
                <td className="gx-td">
                  <div className="gx-plink">
                    <span className="gx-plink__v">{f2(gap.p_link)}</span>
                    <span className="gx-plink__bar" aria-hidden="true">
                      <span className="gx-plink__line" />
                      {hasInterval && <span className="gx-plink__range" style={{ left: `${clamp(gap.p_lo as number)}%`, width: `${clamp(gap.p_hi as number) - clamp(gap.p_lo as number)}%` }} />}
                      {isNum(gap.p_link) && <span className="gx-plink__pt" style={{ left: `${clamp(gap.p_link)}%` }} />}
                    </span>
                  </div>
                </td>
                <td className="gx-td gx-td--r gx-mono">{f2(gap.momentum)}</td>
                <td className="gx-td gx-td--r gx-mono">{f2(gap.novelty)}</td>
                <td className="gx-td gx-td--r gx-mono">{sg == null ? "—" : `×${sg.toFixed(2)}`}</td>
                <td className="gx-td gx-td--score">
                  <div className="gx-score">
                    <span className="gx-score__v">{f2(gap.gap_score)}</span>
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
      {!loading && !error && rows.length === 0 && <p className="gx-empty">No gaps pass these filters. Lower the minimum P(link) or clear the concept.</p>}
    </div>
  );
}
