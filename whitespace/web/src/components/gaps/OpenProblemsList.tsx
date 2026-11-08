import type { OpenProblem, OpenProblemRatePoint } from "../../api";
import { safeExternalUrl } from "./GapDrawer";
import "./gaps-drawer.css";

const typeLabels: Record<OpenProblem["type"], string> = {
  future_work: "Future work",
  limitation: "Limitation",
  open_problem: "Open problem",
};

/**
 * Props for OpenProblemsList.
 * - items: sentences from OpenProblemResponse.items (already filtered by the caller).
 * - rates: OpenProblemResponse.rates_by_year; omit or pass [] when unavailable.
 * - conceptLabel: label of the selected concept, shown on each card and in the chart legend.
 *   Items carry no concept id, so the caller supplies the concept it filtered by.
 */
export interface OpenProblemsListProps {
  items: OpenProblem[];
  rates?: OpenProblemRatePoint[] | null;
  conceptLabel?: string | null;
}

const W = 560, H = 200, L = 40, R = 12, T = 10, B = 26;
type RateKey = "concept_rate" | "ai_ml_rate";

function RateChart({ rates, conceptLabel }: { rates: OpenProblemRatePoint[]; conceptLabel: string }) {
  const pts = [...rates].sort((a, b) => a.year - b.year);
  const vals = pts.flatMap((p) => [p.concept_rate, p.ai_ml_rate]).filter((v): v is number => v != null && Number.isFinite(v));
  const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "not available" : `${(v * 100).toFixed(1)}%`);
  if (pts.length === 0 || vals.length === 0) {
    return <p className="open-problems__empty">Rate over time: not available.</p>;
  }
  const max = Math.max(...vals) || 1;
  const y0 = pts[0].year, y1 = pts[pts.length - 1].year;
  const x = (yr: number) => L + (y1 === y0 ? (W - L - R) / 2 : ((yr - y0) / (y1 - y0)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  // Break the line where data is missing rather than interpolating.
  const path = (key: RateKey) => {
    let d = "", pen = false;
    for (const p of pts) {
      const v = p[key];
      if (v == null || !Number.isFinite(v)) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.year).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    }
    return d.trim();
  };
  const dots = (key: RateKey, fill: string) => pts.map((p) => {
    const v = p[key];
    return v == null || !Number.isFinite(v) ? null : <circle key={`${key}-${p.year}`} cx={x(p.year)} cy={y(v)} r={2.5} fill={fill} />;
  });
  const desc = `Share of papers stating an open problem, by year, ${y0} to ${y1}. Maximum ${(max * 100).toFixed(1)} percent. Full values are in the table below.`;
  return (
    <section className="open-problems__chart" aria-labelledby="op-rate-title">
      <h3 id="op-rate-title">How often authors state an open problem, by year</h3>
      <div className="open-problems__legend">
        <span><i />{conceptLabel}</span>
        <span><i className="is-baseline" />All AI/ML</span>
      </div>
      <svg className="open-problems__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="op-rate-svg-title op-rate-svg-desc">
        <title id="op-rate-svg-title">Open-problem rate over time</title>
        <desc id="op-rate-svg-desc">{desc}</desc>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--ws-border-strong)" />
        <line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--ws-border-strong)" />
        <text x={L - 6} y={T + 4} textAnchor="end">{(max * 100).toFixed(0)}%</text>
        <text x={L - 6} y={H - B} textAnchor="end">0%</text>
        <text x={L} y={H - 8} textAnchor="start">{y0}</text>
        <text x={W - R} y={H - 8} textAnchor="end">{y1}</text>
        <path d={path("ai_ml_rate")} fill="none" stroke="var(--ws-muted)" strokeWidth={2} strokeDasharray="5 3" />
        <path d={path("concept_rate")} fill="none" stroke="var(--ws-accent)" strokeWidth={2} />
        {dots("ai_ml_rate", "var(--ws-muted)")}
        {dots("concept_rate", "var(--ws-accent)")}
      </svg>
      <details className="open-problems__table">
        <summary>Show as table</summary>
        <table>
          <caption className="gap-sr-only">Open-problem rate by year</caption>
          <thead><tr><th scope="col">Year</th><th scope="col">{conceptLabel}</th><th scope="col">All AI/ML</th></tr></thead>
          <tbody>
            {pts.map((p) => <tr key={p.year}><th scope="row">{p.year}</th><td>{pct(p.concept_rate)}</td><td>{pct(p.ai_ml_rate)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export function OpenProblemsList({ items, rates, conceptLabel }: OpenProblemsListProps) {
  const label = conceptLabel?.trim() || "";
  return (
    <section className="open-problems" aria-label="Open problems">
      <p className="open-problems__intro">What authors say is still open. Sentences are quoted from papers and tagged by a classifier.</p>
      {items.length === 0 ? (
        <p className="open-problems__empty">Not available: no open-problem sentences returned.</p>
      ) : (
        <ul className="open-problems__cards">
          {items.map((item) => {
            const href = safeExternalUrl(item.paper.url);
            return (
              <li className="open-problems__card" key={`${item.paper.id}-${item.sentence}`}>
                <blockquote>{item.sentence}</blockquote>
                <p className="open-problems__meta">
                  <span className="open-problems__tag">{typeLabels[item.type] ?? item.type}</span>
                  <span>Concept: {label || "not available"}</span>
                  <span>Year: {item.paper.year ?? "not available"}</span>
                  <span>Confidence: {item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : "not available"}</span>
                  {href ? <a href={href} target="_blank" rel="noreferrer">Source: {item.paper.title}</a> : <span>Source: {item.paper.title}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <RateChart rates={rates ?? []} conceptLabel={label || "Selected concept"} />
    </section>
  );
}
