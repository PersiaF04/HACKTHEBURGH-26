import type { BacktestHit, BacktestResponse, CalibrationBin, RankingMetrics } from "../api";
import { ModelNote } from "../components/ModelNote";
import { PaperLink } from "../components/PaperLink";
import { EmptyNote, SkeletonBlock } from "../components/Skeleton";
import { NA, fmtDec, fmtInt, fmtText, fmtYear, isNum } from "../lib/format";
import "./evidence.css";

export const EVIDENCE_CAPTION = "Evidence appears once the held-out backtest has run: the model is tested once, on a test year, and the result is published whichever way it falls.";

const METRIC_CARDS: [string, string][] = [
  ["Average precision", "How high the pairs that really became links sit in the ranked list."],
  ["Precision@k", "Share of the top k ranked pairs that became real links."],
  ["Calibration", "Whether a predicted probability matches how often it happened."],
  ["Base rate", "Share of all candidate pairs that became links with no model at all."],
  ["vs each baseline", "The model's result next to each simple rule, on the same pairs."],
];
const BASELINE_NAMES = ["Current weight", "Degree product", "Preferential attachment", "Adamic-Adar", "Cosine"];

function hasMetric(value: unknown): boolean {
  return isNum(value as number) || (typeof value === "string" && value.trim() !== "");
}

function EvidenceSkeleton({ loading }: { loading: boolean }) {
  return (
    <div className="evidence-skeleton" aria-label="Evidence layout, not yet measured">
      <div className="ws-skel-card-grid">
        {METRIC_CARDS.map(([title, text]) => (
          <div className="ws-skel-card" key={title}><h3>{title}</h3><p className="ws-skel-value">{NA}</p><p>{text}</p></div>
        ))}
      </div>
      <section className="ws-skel-panel" aria-labelledby="skel-baselines"><h2 id="skel-baselines">Baseline comparison</h2>
        <div className="evidence-table-scroll"><table className="ws-skel-table"><thead><tr><th scope="col">Method</th><th scope="col">Average precision</th><th scope="col">Precision@100</th></tr></thead>
          <tbody>
            <tr><th scope="row">Model</th><td><SkeletonBlock className="ws-skel--bar" /></td><td><SkeletonBlock className="ws-skel--bar" /></td></tr>
            {BASELINE_NAMES.map((name) => <tr key={name}><th scope="row">{name}</th><td><SkeletonBlock className="ws-skel--bar" /></td><td><SkeletonBlock className="ws-skel--bar" /></td></tr>)}
          </tbody></table></div>
      </section>
      <div className="ws-skel-pair">
        <section className="ws-skel-panel" aria-labelledby="skel-cal"><h2 id="skel-cal">Calibration</h2>
          <svg className="ws-skel-chart" viewBox="0 0 220 220" role="img" aria-label="Empty calibration chart frame">
            <rect x="30" y="10" width="180" height="170" style={{ fill: "var(--ws-track)", stroke: "var(--ws-border-strong)" }} />
            <line x1="30" y1="180" x2="210" y2="10" style={{ stroke: "var(--ws-border-strong)" }} strokeDasharray="4 4" />
            <text x="120" y="204" textAnchor="middle">Predicted probability</text>
            <text x="12" y="95" textAnchor="middle" transform="rotate(-90 12 95)">Observed rate</text>
          </svg></section>
        <section className="ws-skel-panel" aria-labelledby="skel-hits"><h2 id="skel-hits">Hits and misses</h2>
          {["Top hits", "Misses"].map((title) => <div key={title}><strong>{title}</strong>
            {[0, 1, 2].map((i) => <div className="ws-skel-row" key={i}><SkeletonBlock height={10} width={i === 1 ? "70%" : "90%"} /><SkeletonBlock height={10} /></div>)}</div>)}
        </section>
      </div>
      <p className="ws-skel-caption" role="status">{loading ? "Loading evidence… " : ""}{EVIDENCE_CAPTION}</p>
    </div>
  );
}


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
  const hasData = !!aggregate && [aggregate.average_precision, aggregate.precision_at_100, aggregate.pr_auc, aggregate.roc_auc].some(hasMetric);

  return (
    <section className="evidence-page" aria-label="Evidence">
      <header className="evidence-header">
        <p>See what was measured, which baselines were compared, and where evidence is still missing.</p>
      </header>

      <ModelNote />

      {placeholder && (
        <p className="evidence-notice" role="status">
          Placeholder data - evaluation artifacts have not been loaded. No forecast performance is claimed.
        </p>
      )}
            {status === "error" && <EmptyNote role="alert">{errorMessage || "Evidence could not be loaded."}</EmptyNote>}

      {!hasData && status !== "error" && <EvidenceSkeleton loading={status === "loading"} />}
      {hasData && <>
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
            <strong>{NA}</strong>
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

      </>}

      <section className="evidence-section">
        <h2>Paper-to-code matching</h2>
        <p>Code-link precision: <strong>{formatMetric(codeLink?.precision)}</strong></p>
        <p>Binomial precision interval: <strong>{codeLink?.interval_method === "binomial" ? `${formatMetric(codeLink.lower)} to ${formatMetric(codeLink.upper)}` : NA}</strong></p>
        <p>Hand-checked sample size: <strong>{fmtInt(codeLink?.sample_size)}</strong></p>
        <p>Correct matches: <strong>{fmtInt(codeLink?.correct_matches)}</strong></p>
        <p>Sampling protocol: <strong>{fmtText(codeLink?.protocol)}</strong></p>
        <div>
          <strong>Sample composition</strong>
          {codeLink?.sample_composition && Object.keys(codeLink.sample_composition).length > 0
            ? <ul>{Object.entries(codeLink.sample_composition).map(([kind, count]) => <li key={kind}>{kind}: {count}</li>)}</ul>
            : <p>{NA}</p>}
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
        <line x1="12" y1="188" x2="188" y2="12" style={{ stroke: "var(--ws-rule)" }} strokeDasharray="4 4" />
        <line x1="12" y1="188" x2="188" y2="188" style={{ stroke: "var(--ws-muted)" }} />
        <line x1="12" y1="12" x2="12" y2="188" style={{ stroke: "var(--ws-muted)" }} />
        {bins.map((bin, index) => {
          const cx = 12 + Math.max(0, Math.min(1, bin.predicted)) * 176;
          const cy = 188 - Math.max(0, Math.min(1, bin.observed)) * 176;
          return <circle key={`${bin.predicted}-${index}`} cx={cx} cy={cy} r={Math.max(3, Math.min(8, 2 + Math.sqrt(bin.count)))} style={{ fill: "var(--ws-ok-chart)" }} />;
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
        <tbody>{bins.map((bin, index) => <tr key={`${bin.predicted}-${index}`}><td>{formatMetric(bin.predicted)}</td><td>{formatMetric(bin.observed)}</td><td>{fmtInt(bin.count)}</td></tr>)}</tbody>
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
      </div> : <p className="evidence-empty">{NA} for this starting weight.</p>}
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
            <tbody>{rows.map((row, index) => <tr key={`${row.a}-${row.b}-${index}`}><td>{row.a} / {row.b}{row.paper && <><br /><PaperLink paper={row.paper} /></>}</td><td>{formatMetric(row.score)}</td><td>{fmtInt(row.starting_weight)}</td><td>{fmtYear(row.year)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p>{empty}</p>}
    </div>
  );
}

function formatMetric(value: unknown): string {
  if (typeof value === "number") return fmtDec(value, 3);
  return fmtText(typeof value === "string" ? value : null);
}
