import { useId } from "react";
import { fmtInt } from "../lib/format";
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
  /** Skeleton state: controls are shown but cannot be used until data loads. */
  disabled?: boolean;
  /** Graph controls (depth per branch and gaps), shown as their own cards. */
  graph?: GraphControls;
};

export type GraphControls = {
  perBranch: number; onPerBranch: (n: number) => void;
  showGaps: boolean; onShowGaps: (on: boolean) => void;
  gapCount: number; onGapCount: (n: number) => void;
};

const GROWTH: { id: GrowthFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "up", label: "Growing" },
  { id: "down", label: "Shrinking" },
];

export const GROWTH_HELP = "Growth is the change in a concept's yearly paper count over the last 3 years. Growing: more papers than 3 years ago. Shrinking: fewer.";
export const MIN_PAPERS_HELP = "Hide concepts with fewer papers than this in the corpus. Raise it to see only well-established topics.";

export function FiltersPanel({ filters, onChange, maxPapers, onReset, areas, selectedAreaIds, onToggleArea, disabled = false, graph }: FiltersPanelProps) {
  const uid = useId();
  const max = Math.max(10, Math.ceil(maxPapers / 10) * 10);
  const step = Math.max(1, Math.round(max / 30));
  const set = (patch: Partial<ExploreFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className={disabled ? "whitespace-filters is-disabled" : "whitespace-filters"} data-tour="map-filters">
      {areas && areas.length > 0 && (
        <section aria-labelledby={`${uid}-areas`} className="whitespace-filters__section whitespace-filters__areas">
          <div className="whitespace-filters__heading">
            <h2 id={`${uid}-areas`}>Topic areas</h2>
            <p>Choose the parts of the map to keep visible.</p>
          </div>
          {areas.map((area) => (
            <label key={area.id} className="whitespace-check">
              <input
                type="checkbox"
                checked={selectedAreaIds ? selectedAreaIds.includes(area.id) : true}
                onChange={() => onToggleArea?.(area.id)}
              />
              <span>{area.name}</span>
              <span className="whitespace-mono" title="Concepts in this area">{fmtInt(area.count)}</span>
            </label>
          ))}
        </section>
      )}

      <section className="whitespace-filters__section" aria-labelledby={`${uid}-min-l`}>
        <div className="whitespace-filters__label">
          <label id={`${uid}-min-l`} htmlFor={`${uid}-min`} title={MIN_PAPERS_HELP}>Minimum papers</label>
          <span className="whitespace-mono">{disabled ? "—" : fmtInt(filters.minPapers)}</span>
        </div>
        <input
          id={`${uid}-min`}
          type="range"
          min={0}
          max={max}
          step={step}
          disabled={disabled}
          value={Math.min(filters.minPapers, max)}
          title={MIN_PAPERS_HELP}
          aria-describedby={`${uid}-min-help`}
          onChange={(event) => set({ minPapers: Number(event.currentTarget.value) })}
        />
        <p className="whitespace-help" id={`${uid}-min-help`}>Hide concepts with fewer papers than this.</p>
      </section>

      <section className="whitespace-filters__section" aria-labelledby={`${uid}-growth`}>
        <span id={`${uid}-growth`} className="whitespace-filters__title" title={GROWTH_HELP}>Growth</span>
        <div className="whitespace-seg" role="group" aria-labelledby={`${uid}-growth`} aria-describedby={`${uid}-growth-help`} title={GROWTH_HELP}>
          {GROWTH.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={filters.growth === option.id}
              onClick={() => set({ growth: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="whitespace-help" id={`${uid}-growth-help`}>Change in papers over the last 3 years.</p>
      </section>

      {graph && (
        <>
          <section className="whitespace-filters__section" aria-labelledby={`${uid}-per`}>
            <div className="whitespace-filters__label">
              <label id={`${uid}-per`} htmlFor={`${uid}-per-in`}>Concepts per branch</label>
              <span className="whitespace-mono">{fmtInt(graph.perBranch)}</span>
            </div>
            <input id={`${uid}-per-in`} type="range" min={10} max={1000} step={10} value={graph.perBranch} onChange={(event) => graph.onPerBranch(Number(event.currentTarget.value))} />
            <p className="whitespace-help">How many of each branch&rsquo;s largest sub-areas to draw.</p>
          </section>

          <section className="whitespace-filters__section" aria-labelledby={`${uid}-gaps`}>
            <div className="whitespace-filters__label">
              <label htmlFor={`${uid}-gap-n`}>Gaps shown</label>
              <span className="whitespace-mono">{graph.gapCount}</span>
            </div>
            <input id={`${uid}-gap-n`} type="range" min={3} max={50} step={1} value={graph.gapCount} disabled={!graph.showGaps} onChange={(event) => graph.onGapCount(Number(event.currentTarget.value))} />
            <label className="whitespace-check whitespace-check--switch">
              <input type="checkbox" checked={graph.showGaps} onChange={(event) => graph.onShowGaps(event.currentTarget.checked)} />
              <span><strong id={`${uid}-gaps`}>Show gaps and their links</strong><small>Draw the top ranked gaps as bridges between two topics.</small></span>
            </label>
          </section>
        </>
      )}

      <section className="whitespace-filters__section">
        <label className="whitespace-check whitespace-check--switch">
          <input
            type="checkbox"
            disabled={disabled}
            checked={filters.showPredicted}
            onChange={(event) => set({ showPredicted: event.currentTarget.checked })}
          />
          <span><strong>Predicted links</strong><small>Show the model's possible next connections.</small></span>
        </label>
      </section>

      <button type="button" className="whitespace-filters__reset" disabled={disabled} onClick={onReset}>
        Reset filters
      </button>
      {disabled && <p className="whitespace-help">Filters switch on once the pipeline export is loaded.</p>}
    </div>
  );
}
