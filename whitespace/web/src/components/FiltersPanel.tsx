export type GrowthFilter = "all" | "up" | "down";
export type ExploreFilters = { minPapers: number; growth: GrowthFilter; showPredicted: boolean };
export const DEFAULT_FILTERS: ExploreFilters = { minPapers: 0, growth: "all", showPredicted: true };

export type FiltersPanelProps = {
  filters: ExploreFilters;
  /** Largest paper_count among concepts in the snapshot, for the slider range. */
  maxPapers: number;
  onChange: (filters: ExploreFilters) => void;
  onReset: () => void;
};

/** Placeholder implementation; the "panels" helper replaces this with the design port. */
export function FiltersPanel({ filters, maxPapers, onChange, onReset }: FiltersPanelProps) {
  return (
    <section aria-labelledby="ex-filters" className="ex__section">
      <h2 id="ex-filters" className="ex__h">Filters</h2>
      <label>Minimum papers {filters.minPapers}
        <input type="range" min={0} max={Math.max(1, maxPapers)} value={filters.minPapers}
          onChange={(e) => onChange({ ...filters, minPapers: Number(e.currentTarget.value) })} />
      </label>
      <label><input type="checkbox" checked={filters.showPredicted}
        onChange={(e) => onChange({ ...filters, showPredicted: e.currentTarget.checked })} /> Show predicted links</label>
      <button type="button" onClick={onReset}>Reset filters</button>
    </section>
  );
}
