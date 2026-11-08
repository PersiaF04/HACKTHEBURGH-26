import { useId } from "react";
import "./explore.css";

export type GrowthFilter = "all" | "up" | "down";
export type ExploreFilters = { minPapers: number; growth: GrowthFilter; showPredicted: boolean };
export const DEFAULT_FILTERS: ExploreFilters = { minPapers: 0, growth: "all", showPredicted: true };

export type ResearchArea = { id: string; name: string; count?: number };

type FiltersPanelProps = {
  filters: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  /** Largest paper_count among concepts in the snapshot; sets the slider range. */
  maxPapers: number;
  onReset: () => void;
  /** Research areas, only when the data has them. */
  areas?: ResearchArea[];
  /** Ids of areas currently shown. Defaults to all. */
  selectedAreaIds?: string[];
  onToggleArea?: (id: string) => void;
};

const GROWTH: { id: GrowthFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "up", label: "Growing" },
  { id: "down", label: "Shrinking" },
];

export function FiltersPanel({ filters, onChange, maxPapers, onReset, areas, selectedAreaIds, onToggleArea }: FiltersPanelProps) {
  const uid = useId();
  const max = Math.max(10, Math.ceil(maxPapers / 10) * 10);
  const step = Math.max(1, Math.round(max / 30));
  const set = (patch: Partial<ExploreFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="whitespace-filters">
      <section aria-labelledby={`${uid}-areas`} className="whitespace-filters__section">
        <h2 id={`${uid}-areas`}>Research areas</h2>
        {areas && areas.length > 0 ? (
          areas.map((area) => (
            <label key={area.id} className="whitespace-check">
              <input
                type="checkbox"
                checked={selectedAreaIds ? selectedAreaIds.includes(area.id) : true}
                onChange={() => onToggleArea?.(area.id)}
              />
              <span>{area.name}</span>
              {typeof area.count === "number" && <span className="whitespace-mono">{area.count.toLocaleString()}</span>}
            </label>
          ))
        ) : (
          <p className="whitespace-note">Research areas are not available in this data.</p>
        )}
      </section>

      <section aria-labelledby={`${uid}-filters`} className="whitespace-filters__section">
        <h2 id={`${uid}-filters`}>Filters</h2>
        <div className="whitespace-filters__row">
          <div className="whitespace-filters__label">
            <label htmlFor={`${uid}-min`}>Minimum papers</label>
            <span className="whitespace-mono">{filters.minPapers.toLocaleString()}</span>
          </div>
          <input
            id={`${uid}-min`}
            type="range"
            min={0}
            max={max}
            step={step}
            value={Math.min(filters.minPapers, max)}
            onChange={(event) => set({ minPapers: Number(event.currentTarget.value) })}
          />
        </div>
        <div className="whitespace-filters__row">
          <span id={`${uid}-growth`}>Growth</span>
          <div className="whitespace-seg whitespace-seg--small" role="group" aria-labelledby={`${uid}-growth`}>
            {GROWTH.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filters.growth === option.id}
                onClick={() => set({ growth: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="whitespace-check">
          <input
            type="checkbox"
            checked={filters.showPredicted}
            onChange={(event) => set({ showPredicted: event.currentTarget.checked })}
          />
          <span>Show predicted links</span>
        </label>
        <p className="whitespace-note">Linked edges (3 or more shared papers) are not in this data export, so only predicted links can be drawn.</p>
        <button type="button" className="whitespace-linkbtn" onClick={onReset}>
          Reset filters
        </button>
      </section>
    </div>
  );
}
