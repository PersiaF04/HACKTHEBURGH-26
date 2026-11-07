import type { BacktestResponse } from "../api";
import "./evidence.css";

type EvidencePageProps = {
  response: BacktestResponse | null;
  status: "loading" | "ready" | "empty" | "error";
  errorMessage?: string;
};

const rankingMetrics = ["Precision@100", "PR-AUC", "Adamic–Adar comparison", "Preferential attachment comparison", "Cosine comparison"];

export default function EvidencePage({ response, status, errorMessage }: EvidencePageProps) {
  const placeholder = response?.placeholder === true;
  const metrics = response?.metrics ?? {};

  return (
    <main className="evidence-page">
      <header className="evidence-header">
        <p className="evidence-eyebrow">Methods and evaluation</p>
        <h1>Evidence</h1>
        <p>See what was measured, which baselines were compared, and where evidence is still missing.</p>
      </header>

      {placeholder && (
        <p className="evidence-notice" role="status">
          Placeholder data — evaluation artifacts have not been loaded. No forecast performance is claimed.
        </p>
      )}
      {status === "loading" && <p role="status">Loading evaluation evidence…</p>}
      {status === "error" && <p className="evidence-error" role="alert">{errorMessage || "Evidence could not be loaded."}</p>}

      <section aria-labelledby="ranking-title" className="evidence-section">
        <h2 id="ranking-title">Ranking quality</h2>
        <p className="evidence-muted">Every ranking metric must be read alongside the share of eligible pairs that link within three years (the base rate).</p>
        <div className="evidence-metric-list">
          {rankingMetrics.map((label) => (
            <div className="evidence-metric" key={label}>
              <span>{label}</span>
              <strong>{formatMetric(metrics[label])}</strong>
              <span className="evidence-base-rate">Base rate: {formatMetric(metrics.base_rate)}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="calibration-title" className="evidence-section">
        <h2 id="calibration-title">Calibration</h2>
        <div className="evidence-empty">
          <strong>Not yet measured</strong>
          <p>A calibration plot will appear only when observed outcomes and predicted probabilities are in the evaluation artifact.</p>
        </div>
        <details>
          <summary>Calibration data table</summary>
          <p className="evidence-muted">No calibration bins are available yet.</p>
        </details>
      </section>

      <section className="evidence-section evidence-tables" aria-label="Evaluation examples">
        <div>
          <h2>Top hits</h2>
          <p>{status === "error" ? "Unable to load hit examples." : "No measured hits are available yet."}</p>
        </div>
        <div>
          <h2>Misses</h2>
          <p>{status === "error" ? "Unable to load miss examples." : "No measured misses are available yet."}</p>
        </div>
      </section>

      <section className="evidence-section">
        <h2>Paper-to-code matching</h2>
        <p>Code-link precision and its sampling protocol: <strong>{formatMetric(metrics.code_link_precision)}</strong>.</p>
        <p className="evidence-muted">Coverage is a lower bound from an incomplete historical archive. “No linked code in this archive” does not mean no implementation exists.</p>
      </section>
    </main>
  );
}

function formatMetric(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "Not yet measured";
}
