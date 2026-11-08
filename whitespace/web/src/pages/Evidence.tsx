import type { BacktestHit, BacktestResponse, CalibrationBin, RankingMetrics } from "../api";
import "./evidence.css";

type EvidencePageProps = {
  response: BacktestResponse | null;
  status: "loading" | "ready" | "empty" | "error";
  errorMessage?: string;
};

export default function EvidencePage({ response, status, errorMessage }: EvidencePageProps) {
  const placeholder = response?.placeholder === true;
  const aggregate: RankingMetrics | null = response ? response.by_starting_weight?.all ?? {
    base_rate: response.base_rate,
    roc_auc: response.roc_auc,
    pr_auc: response.pr_auc,
    average_precision: response.average_precision,
    precision_at_100: response.precision_at_100,
    baselines: response.baselines,
  } : null;
  const strata = [
    { key: "all", label: "All eligible pairs", metrics: aggregate },
    { key: "0", label: "Pairs with 0 shared papers at origin", metrics: response?.by_starting_weight?.["0"] ?? null },
    { key: "1", label: "Pairs with 1 shared paper at origin", metrics: response?.by_starting_weight?.["1"] ?? null },
    { key: "2", label: "Pairs with 2 shared papers at origin", metrics: response?.by_starting_weight?.["2"] ?? null },
  ] as const;
  const bins = response?.calibration.bins ?? [];
  const hits = response?.hits ?? [];
  const misses = response?.misses ?? [];
  const codeLink = response?.code_link_evaluation;

  return (
    <section className="evidence-page" aria-label="Evidence">
      <header className="evidence-header">
        <p>See what was measured, which baselines were compared, and where evidence is still missing.</p>
      </header>

      {placeholder && (
        <p className="evidence-notice" role="status">
          Placeholder data - evaluation artifacts have not been loaded. No forecast performance is claimed.
        </p>
      )}
      {status === "loading" && <p role="status">Loading evaluation evidence...</p>}
      {status === "error" && <p className="evidence-error" role="alert">{errorMessage || "Evidence could not be loaded."}</p>}

      <section aria-labelledby="ranking-title" className="evidence-section">
        <h2 id="ranking-title">Ranking quality</h2>
        <p className="evidence-muted">Metrics are reported for the full eligible pair set and separately by starting pair weight. Each ranking value is shown beside its own base rate.</p>
        <div className="evidence-strata">
          {strata.map((stratum) => <RankingTable key={stratum.key} label={stratum.label} metrics={stratum.metrics} />)}
        </div>
      </section>

      <section aria-labelledby="calibration-title" className="evidence-section">
        <h2 id="calibration-title">Calibration</h2>
        {bins.length ? <CalibrationPlot bins={bins} /> : (
          <div className="evidence-empty">
            <strong>Not yet measured</strong>
            <p>A calibration plot appears only when predicted probabilities and observed outcomes are present in the evaluation artifact.</p>
          </div>
        )}
        <details>
          <summary>Calibration data table</summary>
          {bins.length ? <CalibrationTable bins={bins} /> : <p className="evidence-muted">No calibration bins are available yet.</p>}
        </details>
      </section>

      <section className="evidence-section evidence-tables" aria-label="Evaluation examples">
        <EvidenceTable title="Top hits" rows={hits} empty="No measured hits are available yet." error={status === "error"} />
        <EvidenceTable title="Misses" rows={misses} empty="No measured misses are available yet." error={status === "error"} />
      </section>

      <section className="evidence-section">
        <h2>Paper-to-code matching</h2>
        <p>Code-link precision: <strong>{formatMetric(codeLink?.precision)}</strong></p>
        <p>Binomial precision interval: <strong>{codeLink?.interval_method === "binomial" ? `${formatMetric(codeLink.lower)} to ${formatMetric(codeLink.upper)}` : "Not yet measured"}</strong></p>
        <p>Hand-checked sample size: <strong>{formatMetric(codeLink?.sample_size)}</strong></p>
        <p>Correct matches: <strong>{formatMetric(codeLink?.correct_matches)}</strong></p>
        <p>Sampling protocol: <strong>{codeLink?.protocol || "Not yet available"}</strong></p>
        <div>
          <strong>Sample composition</strong>
          {codeLink?.sample_composition && Object.keys(codeLink.sample_composition).length > 0
            ? <ul>{Object.entries(codeLink.sample_composition).map(([kind, count]) => <li key={kind}>{kind}: {count}</li>)}</ul>
            : <p>Not yet available.</p>}
        </div>
        <p className="evidence-muted">Coverage is a lower bound from an incomplete historical archive. "No linked code in this archive" does not mean no implementation exists.</p>
      </section>
    </section>
  );
}

function CalibrationPlot({ bins }: { bins: CalibrationBin[] }) {
  const points = bins.map((bin) => `${12 + Math.max(0, Math.min(1, bin.predicted)) * 176},${188 - Math.max(0, Math.min(1, bin.observed)) * 176}`).join(" ");
  return (
    <figure className="evidence-plot">
      <svg viewBox="0 0 200 210" role="img" aria-label="Calibration plot comparing predicted and observed probabilities">
        <line x1="12" y1="188" x2="188" y2="12" stroke="#84948a" strokeDasharray="4 4" />
        <line x1="12" y1="188" x2="188" y2="188" stroke="#60736a" />
        <line x1="12" y1="12" x2="12" y2="188" stroke="#60736a" />
        {bins.map((bin, index) => {
          const cx = 12 + Math.max(0, Math.min(1, bin.predicted)) * 176;
          const cy = 188 - Math.max(0, Math.min(1, bin.observed)) * 176;
          return <circle key={`${bin.predicted}-${index}`} cx={cx} cy={cy} r={Math.max(3, Math.min(8, 2 + Math.sqrt(bin.count)))} fill="#34775d" />;
        })}
      </svg>
      <figcaption>Predicted probability (horizontal) and observed rate (vertical). Dashed line: perfect calibration.</figcaption>
      <span className="sr-only">Calibration point values: {points}</span>
    </figure>
  );
}

function CalibrationTable({ bins }: { bins: CalibrationBin[] }) {
  return (
    <div className="evidence-table-scroll" tabIndex={0} aria-label="Scrollable calibration data">
      <table><caption>Predicted and observed probability by bin</caption><thead><tr><th scope="col">Predicted</th><th scope="col">Observed</th><th scope="col">Pairs</th></tr></thead>
        <tbody>{bins.map((bin, index) => <tr key={`${bin.predicted}-${index}`}><td>{formatMetric(bin.predicted)}</td><td>{formatMetric(bin.observed)}</td><td>{formatMetric(bin.count)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function RankingTable({ label, metrics }: { label: string; metrics: RankingMetrics | null }) {
  const metricRows: [string, unknown][] = metrics ? [
    ["Model Precision@100", metrics.precision_at_100],
    ["Model PR-AUC", metrics.pr_auc],
    ["Model ROC-AUC", metrics.roc_auc],
    ["Model average precision", metrics.average_precision],
    ["Current co-occurrence weight Precision@100", metrics.baselines.current_weight?.precision_at_100],
    ["Degree product Precision@100", metrics.baselines.degree_product?.precision_at_100],
    ["Preferential attachment Precision@100", metrics.baselines.preferential_attachment?.precision_at_100],
    ["Adamic-Adar Precision@100", metrics.baselines.adamic_adar?.precision_at_100],
    ["Cosine Precision@100", metrics.baselines.cosine?.precision_at_100],
  ] : [];
  return (
    <section className="evidence-stratum" aria-label={label}>
      <h3>{label}</h3>
      {metrics ? <div className="evidence-table-scroll" tabIndex={0} aria-label={`Scrollable ranking metrics for ${label}`}>
        <table><caption>Ranking metrics and corresponding base rate</caption><thead><tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Base rate</th></tr></thead>
          <tbody>{metricRows.map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{formatMetric(value)}</td><td>{formatMetric(metrics.base_rate)}</td></tr>)}</tbody>
        </table>
      </div> : <p className="evidence-empty">Not yet measured for this starting weight.</p>}
    </section>
  );
}

function EvidenceTable({ title, rows, empty, error }: { title: string; rows: BacktestHit[]; empty: string; error: boolean }) {
  return (
    <div>
      <h2>{title}</h2>
      {error ? <p>Unable to load examples.</p> : rows.length ? (
        <div className="evidence-table-scroll" tabIndex={0} aria-label={`Scrollable ${title.toLowerCase()} table`}>
          <table><caption>{title} from the evaluation artifact</caption><thead><tr><th scope="col">Concept pair</th><th scope="col">Score</th><th scope="col">Starting weight</th><th scope="col">Year</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${row.a}-${row.b}-${index}`}><td>{row.a} / {row.b}</td><td>{formatMetric(row.score)}</td><td>{formatMetric(row.starting_weight)}</td><td>{formatMetric(row.year)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p>{empty}</p>}
    </div>
  );
}

function formatMetric(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "Not yet measured";
}
