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
}

const columns: Array<{ key: GapSortKey; label: string; description: string }> = [
  { key: "p_link", label: "P(link)", description: "Modelled probability the pair links within three years" },
  { key: "momentum", label: "Momentum", description: "Recent growth signal in the model" },
  { key: "novelty", label: "Novelty", description: "Novelty component returned by the model" },
  { key: "gap_rate", label: "Stated-gap rate", description: "Share of papers with a stated open problem" },
  { key: "gap_score", label: "Gap score", description: "Combined ranking score; this is not a probability" },
];

function formatValue(value: number | null | undefined, key: GapSortKey): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  if (key === "p_link" || key === "gap_rate") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(3);
}

function gapId(gap: GapSummary): string {
  return `${gap.a}::${gap.b}`;
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
}: GapTableProps) {
  if (loading) return <p className="gap-state" role="status">Loading ranked gaps…</p>;
  if (error) return <p className="gap-state gap-state--error" role="alert">Could not load gaps: {error}</p>;
  if (items.length === 0) {
    return <p className="gap-state">{placeholder ? "No gap results are included in these placeholder fixtures." : "No gaps match these filters."}</p>;
  }

  return (
    <div className="gap-table-wrap">
      {placeholder && <p className="gap-placeholder" role="note">Placeholder data — these values are examples, not measured results.</p>}
      <table className="gap-table">
        <caption className="visually-hidden">Ranked concept pairs and model score components</caption>
        <thead>
          <tr>
            <th scope="col">Concept pair</th>
            {columns.map(({ key, label, description }) => (
              <th
                scope="col"
                key={key}
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
          {items.slice(0, 50).map((gap) => {
            const id = gapId(gap);
            return (
              <tr key={id} className={selectedId === id ? "is-selected" : undefined}>
                <th scope="row">
                  <button className="gap-pair" type="button" onClick={() => onSelect(gap)} aria-label={`Open gap: ${gap.a_label} and ${gap.b_label}`}>
                    <span>{gap.a_label}</span><span className="gap-pair__join" aria-hidden="true">↔</span><span>{gap.b_label}</span>
                  </button>
                </th>
                {columns.map(({ key }) => (
                  <td key={key} className={key === "gap_score" ? "gap-score-cell" : undefined}>
                    {formatValue(gap[key], key)}
                    {key === "gap_score" && <span className="visually-hidden">, ranking score, not a probability</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="gap-table-note">P(link) is a model probability. Gap score is a separate ranking score.</p>
    </div>
  );
}
