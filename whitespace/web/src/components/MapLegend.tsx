import { fmtText } from "../lib/format";
import "./map.css";

export const GROWTH_STEPS = [
  { color: "#C3C7CF", label: "Shrinking" },
  { color: "#F0C9A0", label: "0 to 15%" },
  { color: "#EDA060", label: "15 to 30%" },
  { color: "#E07432", label: "30 to 45%" },
  { color: "#BF4A0E", label: "45% or more" },
] as const;

type MapLegendProps = {
  /** "3d" adds the height encoding and the 3D controls hint. */
  view: "2d" | "3d" | "none";
  hasLinked?: boolean;
  /** Skeleton: explain the encodings without implying any data is shown. */
  skeleton?: boolean;
};

const HINT: Record<MapLegendProps["view"], string> = {
  "3d": "Drag to rotate, scroll to zoom, right-drag (or shift-drag) to pan. Click a dot for details. Keys: arrows rotate, + and − zoom, 0 resets.",
  "2d": "Drag to pan, scroll to zoom. Click a dot for details.",
  none: "",
};

/** Always-visible key for the map encodings. Shared by the 2D map, the 3D map and the skeleton. */
export function MapLegend({ view, hasLinked = false, skeleton = false }: MapLegendProps) {
  return (
    <div className={skeleton ? "whitespace-map__legend is-skeleton" : "whitespace-map__legend"} role="group" aria-label="Legend">
      <span className="whitespace-map__legend-scale" title="Colour shows how fast the concept's yearly paper count changed over 3 years.">
        <span>Shrinking</span>
        <span className="whitespace-map__legend-swatches">
          {GROWTH_STEPS.map((step) => (
            <i key={step.label} style={{ background: step.color }} title={fmtText(step.label)} aria-hidden="true" />
          ))}
        </span>
        <span>Fast-growing</span>
        <span className="whitespace-map__legend-sub">{"·"} colour = 3-yr paper growth</span>
      </span>
      <span title="Dot size shows how many papers mention the concept.">
        <span className="whitespace-map__legend-sizes" aria-hidden="true">
          <i style={{ width: 6, height: 6 }} /><i style={{ width: 11, height: 11 }} /><i style={{ width: 17, height: 17 }} />
        </span>
        Size = papers
      </span>
      {view === "3d" && <span title="In 3D the height of a dot also shows growth: higher is growing faster.">Height = 3-yr growth</span>}
      {hasLinked && <span><i className="whitespace-map__legend-solid" aria-hidden="true" />Linked {"·"} 3+ shared papers</span>}
      <span title="Predicted: a pair of concepts the model expects to be studied together within 3 years."><i className="whitespace-map__legend-dash" aria-hidden="true" />Predicted link {"·"} next 3 years</span>
      {HINT[view] && <p className="whitespace-map__hint">{HINT[view]}</p>}
    </div>
  );
}
