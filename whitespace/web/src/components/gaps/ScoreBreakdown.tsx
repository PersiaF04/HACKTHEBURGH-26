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
  if (value == null || !Number.isFinite(value)) return "Not available";
  return format === "probability" ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
}

export function ScoreBreakdown({ gap }: { gap: GapSummary }) {
  const metrics: Metric[] = [
    { key: "p-link", label: "P(link) within three years", value: gap.p_link, format: "probability", note: "Model probability returned for this pair." },
    { key: "interval", label: "Reported model interval", value: null },
    { key: "momentum", label: "Momentum", value: gap.momentum },
    { key: "novelty", label: "Novelty", value: gap.novelty },
    { key: "gap-rate", label: "Stated-gap rate", value: gap.gap_rate, format: "probability" },
    { key: "gap-score", label: "Gap score", value: gap.gap_score, note: "Combined ranking score. It is not a probability." },
  ];

  // p_lo / p_hi describe a model interval only if both were supplied and ordered.
  const interval = Number.isFinite(gap.p_lo) && Number.isFinite(gap.p_hi) && (gap.p_lo as number) <= (gap.p_hi as number)
    ? `${display(gap.p_lo, "probability")}–${display(gap.p_hi, "probability")}`
    : "Not available";

  return (
    <section className="gap-score" aria-labelledby="gap-score-title">
      <h3 id="gap-score-title">Score breakdown</h3>
      <dl className="gap-score__list">
        {metrics.map((metric) => (
          <div className="gap-score__row" key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>{metric.key === "interval" ? interval : display(metric.value, metric.format)}</dd>
            {metric.note && <p className="gap-score__note">{metric.note}</p>}
          </div>
        ))}
      </dl>
    </section>
  );
}
