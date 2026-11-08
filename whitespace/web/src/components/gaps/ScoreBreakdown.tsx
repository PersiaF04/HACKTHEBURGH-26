import type { GapSummary } from "../../api";
import "./gaps.css";

interface Metric {
  key: string;
  label: string;
  value: number | null | undefined;
  format?: "probability" | "number";
  note?: string;
}

function display(value: number | null | undefined, format: Metric["format"]): string {
  if (value == null || !Number.isFinite(value)) return "not available";
  return format === "probability" ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
}

export function ScoreBreakdown({ gap }: { gap: GapSummary }) {
  const metrics: Metric[] = [
    { key: "p-link", label: "P(link) within three years", value: gap.p_link, format: "probability", note: "Model probability returned for this pair." },
    { key: "growth-a", label: "Growth: first concept", value: gap.growth_a },
    { key: "growth-b", label: "Growth: second concept", value: gap.growth_b },
    { key: "cosine", label: "Cosine similarity", value: gap.cosine },
    { key: "neighbour-overlap", label: "Neighbour overlap", value: gap.neighbour_overlap },
    { key: "gap-rate-a", label: "Stated-gap rate: first concept", value: gap.gap_rate_a, format: "probability" },
    { key: "gap-rate-b", label: "Stated-gap rate: second concept", value: gap.gap_rate_b, format: "probability" },
    { key: "momentum", label: "Momentum", value: gap.momentum },
    { key: "novelty", label: "Novelty", value: gap.novelty },
    { key: "gap-rate", label: "Stated-gap rate", value: gap.gap_rate, format: "probability" },
    { key: "gap-score", label: "Gap score", value: gap.gap_score, note: "Combined ranking score. It is not a probability." },
  ];

  const intervalValidation = gap.interval_validation;
  const hasValidatedInterval = intervalValidation?.validated === true
    && Boolean(intervalValidation.interpretation?.trim())
    && intervalValidation.coverage != null
    && Number.isFinite(intervalValidation.coverage)
    && gap.p_lo != null
    && gap.p_hi != null
    && Number.isFinite(gap.p_lo)
    && Number.isFinite(gap.p_hi)
    && gap.p_lo <= gap.p_hi;

  return (
    <section className="gap-score" aria-labelledby="gap-score-title">
      <h3 id="gap-score-title">Score breakdown</h3>
      <p className="gap-score__formula">
        Proposed PRD formula: <code>gap_score = P(link) × sigmoid(growth_a + growth_b) × (1 − max(cosine, neighbour_overlap)) × (1 + gap_rate_a + gap_rate_b)</code>.
        The formula's inputs below are shown as returned; missing inputs are not inferred.
      </p>
      <dl className="gap-score__list">
        {!hasValidatedInterval && (
          <div className="gap-score__row">
            <dt>Model interval</dt>
            <dd>not available</dd>
            <p className="gap-score__note">The interval's interpretation and coverage have not both been validated.</p>
          </div>
        )}
        {hasValidatedInterval && (
          <div className="gap-score__row">
            <dt>Validated model interval</dt>
            <dd>{display(gap.p_lo, "probability")}–{display(gap.p_hi, "probability")}</dd>
            <p className="gap-score__note">{intervalValidation.interpretation}. Reported coverage: {intervalValidation.coverage}.</p>
          </div>
        )}
        {metrics.map((metric) => (
          <div className="gap-score__row" key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>{display(metric.value, metric.format)}</dd>
            {metric.note && <p className="gap-score__note">{metric.note}</p>}
          </div>
        ))}
      </dl>
    </section>
  );
}
