import type { GapSummary } from "../../api";
import "./gaps.css";

export type GapSortKey = "p_link" | "momentum" | "novelty" | "gap_rate" | "gap_score";

export interface GapTableProps {
  items: GapSummary[];
  selectedId?: string | null;
  sort?: GapSortKey;
  sortDirection?: "asc" | "desc";
  loading?: boolean;
  error?: string | null;
  placeholder?: boolean;
  onSort?: (key: GapSortKey) => void;
  onSelect: (gap: GapSummary) => void;
  /** Optional concept id to research area label map, shown as chips under the pair. */
  areas?: Record<string, string | undefined>;
}

const columns: Array<{ key: GapSortKey; label: string; description: string; numeric?: boolean }> = [
  { key: "p_link", label: "P(link)", description: "Modelled probability the pair links within three years" },
  { key: "momentum", label: "Momentum", description: "Recent growth signal in the model", numeric: true },
  { key: "novelty", label: "Novelty", description: "Novelty component returned by the model", numeric: true },
  { key: "gap_rate", label: "Stated gaps", description: "Share of papers with a stated open problem", numeric: true },
  { key: "gap_score", label: "Gap score", description: "Combined ranking score; this is not a probability" },
];

const NA = "not available";

function num(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function formatValue(value: number | null | undefined, key: GapSortKey): string {
  if (!num(value)) return NA;
  if (key === "p_link" || key === "gap_rate") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(3);
}

function pct(value: number): number {
  return Math.max(0, Math.min(100, value * 100));
}

function gapId(gap: GapSummary): string {
  return `${gap.a}::${gap.b}`;
}

function Areas({ gap, areas }: { gap: GapSummary; areas?: GapTableProps["areas"] }) {
  const list = [areas?.[gap.a], areas?.[gap.b]].filter((x): x is string => Boolean(x));
  const unique = Array.from(new Set(list));
  if (unique.length === 0) return null;
  return (
    <span className="gap-areas">
      {unique.map((area) => <span className="gap-chip" key={area}>{area}</span>)}
    </span>
  );
}

export function GapTable({
  items,
  selectedId,
  sort,
  sortDirection = "desc",
  loading = false,
  error,
  placeholder = false,
  onSort,
  onSelect,
  areas,
}: GapTableProps) {
  if (loading) return <p className="gap-state" role="status">Loading ranked gaps…</p>;
  if (error) return <p className="gap-state gap-state--error" role="alert">Could not load gaps: {error}</p>;
  if (items.length === 0) {
    return (
      <p className="gap-state gap-state--empty">
        {placeholder
          ? "No gap results are included in these placeholder fixtures."
          : "No gaps pass these filters. Lower the minimum P(link), pick another area or clear the concept."}
      </p>
    );
  }

  const shown = items.slice(0, 50);
  const maxScore = Math.max(0, ...shown.map((g) => (num(g.gap_score) ? g.gap_score : 0)));

  return (
    <div className="gap-table-wrap">
      {placeholder && <p className="gap-placeholder" role="note">Placeholder data — these values are examples, not measured results.</p>}
      <table className="gap-table">
        <caption className="visually-hidden">Ranked concept pairs and model score components</caption>
        <thead>
          <tr>
            <th scope="col" className="gap-col-rank">#</th>
            <th scope="col">Concept pair</th>
            {columns.map(({ key, label, description, numeric }) => (
              <th
                scope="col"
                key={key}
                className={numeric ? "gap-num" : undefined}
                aria-sort={sort === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                <button
                  className="gap-sort"
                  type="button"
                  onClick={() => onSort?.(key)}
                  aria-label={`Sort by ${label}${key === "gap_score" ? "; this is not a probability" : ""}`}
                  title={description}
                >
                  {label}{sort === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((gap, index) => {
            const id = gapId(gap);
            const selected = selectedId === id;
            const lo = gap.p_lo;
            const hi = gap.p_hi;
            const interval = num(lo) && num(hi) && lo <= hi && num(gap.p_link) ? { lo, hi } : null;
            return (
              <tr key={id} className={selected ? "is-selected" : undefined} onClick={() => onSelect(gap)}>
                <td className="gap-col-rank">{index + 1}</td>
                <th scope="row">
                  <button
                    className="gap-pair"
                    type="button"
                    aria-pressed={selected}
                    onClick={(e) => { e.stopPropagation(); onSelect(gap); }}
                    aria-label={`Open gap: ${gap.a_label} and ${gap.b_label}`}
                  >
                    <span className="gap-pair__names">
                      <span>{gap.a_label}</span><span className="gap-pair__join" aria-hidden="true">↔</span><span>{gap.b_label}</span>
                    </span>
                    <Areas gap={gap} areas={areas} />
                  </button>
                </th>
                <td>
                  <span className="gap-plink">
                    <span className="gap-plink__value">{formatValue(gap.p_link, "p_link")}</span>
                    {interval && (
                      <>
                        <span className="gap-interval" aria-hidden="true">
                          <span className="gap-interval__range" style={{ left: `${pct(interval.lo)}%`, width: `${pct(interval.hi) - pct(interval.lo)}%` }} />
                          <span className="gap-interval__point" style={{ left: `${pct(gap.p_link)}%` }} />
                        </span>
                        <span className="visually-hidden">, interval {(interval.lo * 100).toFixed(1)}% to {(interval.hi * 100).toFixed(1)}%</span>
                      </>
                    )}
                  </span>
                </td>
                <td className="gap-num">{formatValue(gap.momentum, "momentum")}</td>
                <td className="gap-num">{formatValue(gap.novelty, "novelty")}</td>
                <td className="gap-num">{formatValue(gap.gap_rate, "gap_rate")}</td>
                <td className="gap-score-cell">
                  <span className="gap-scorebar">
                    <span className="gap-scorebar__value">{formatValue(gap.gap_score, "gap_score")}</span>
                    {num(gap.gap_score) && maxScore > 0 && (
                      <span className="gap-scorebar__track" aria-hidden="true">
                        <span className="gap-scorebar__fill" style={{ width: `${pct(gap.gap_score / maxScore)}%` }} />
                      </span>
                    )}
                    <span className="visually-hidden">, ranking score, not a probability</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="gap-table-note">P(link) is a model probability. Gap score is a separate ranking score, not a probability. Intervals appear only where the data provides them.</p>
    </div>
  );
}
