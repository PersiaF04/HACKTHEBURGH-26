import type { OpenProblem, OpenProblemRatePoint } from "../../api";
import { fmtDec, fmtPct, fmtText, fmtYear, isNum } from "../../lib/format";
import { safeExternalUrl } from "./GapDetailPanel";

export interface ConceptSeries {
  id: string;
  label: string;
  /** concept_rate draws the line; ai_ml_rate draws the dotted baseline. */
  rates: OpenProblemRatePoint[];
}

export type ProblemFilter = "all" | OpenProblem["type"];

export interface CardItem extends OpenProblem {
  conceptLabel: string;
  dot: string;
}

export interface OpenProblemsCardProps {
  subtitle: string;
  series: ConceptSeries[];
  items: CardItem[];
  filter: ProblemFilter;
  onFilter: (f: ProblemFilter) => void;
  loading?: boolean;
  error?: string | null;
}

export const SERIES_COLORS = ["var(--ws-chart-ink)", "var(--ws-chart-2)"];
const typeLabels: Record<OpenProblem["type"], string> = { open_problem: "Open problem", limitation: "Limitation", future_work: "Future work" };
const W = 720, X0 = 48, X1 = 700, Y0 = 150, Y1 = 15;
type Key = "concept_rate" | "ai_ml_rate";

function lastRate(points: OpenProblemRatePoint[], key: Key): number | null {
  const sorted = [...points].sort((a, b) => a.year - b.year);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i][key];
    if (isNum(v)) return v;
  }
  return null;
}

function Chart({ series }: { series: ConceptSeries[] }) {
  const all = series.flatMap((s) => s.rates);
  const vals = all.flatMap((p) => [p.concept_rate, p.ai_ml_rate]).filter(isNum);
  if (all.length === 0 || vals.length === 0) return null;
  const years = all.map((p) => p.year);
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const ymax = Math.max(0.3, Math.ceil(Math.max(...vals) * 10 / 3) * 0.3);
  const X = (y: number) => X0 + (y1 === y0 ? (X1 - X0) / 2 : ((y - y0) / (y1 - y0)) * (X1 - X0));
  const Y = (v: number) => Y0 - (v / ymax) * (Y0 - Y1);
  const line = (pts: OpenProblemRatePoint[], key: Key) =>
    [...pts].filter((p) => isNum(p[key])).sort((a, b) => a.year - b.year).map((p) => `${X(p.year).toFixed(1)},${Y(p[key] as number).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let y = y0; y <= y1; y += 2) ticks.push(y);
  const grid = [0, 1, 2, 3].map((i) => (ymax / 3) * i);
  const avg = line(series[0].rates, "ai_ml_rate");
  const label = `Share of papers stating an open problem, ${y0} to ${y1}, for ${series.map((s) => s.label).join(" and ")}`;
  return (
    <svg viewBox={`0 0 ${W} 180`} role="img" aria-label={label} className="gx-chart">
      <g fontFamily="IBM Plex Mono, monospace" fontSize="11" style={{ fill: "var(--ws-muted)" }}>
        {grid.map((v, i) => <line key={i} x1={X0} y1={Y(v)} x2={X1} y2={Y(v)} style={{ stroke: i === 0 ? "var(--ws-border-strong)" : "var(--ws-soft)" }} />)}
        {grid.map((v, i) => <text key={`t${i}`} x={40} y={Y(v) + 4} textAnchor="end">{fmtPct(v)}</text>)}
        {ticks.map((y) => <text key={y} x={X(y)} y={170} textAnchor="middle">{y}</text>)}
      </g>
      {avg && <polyline points={avg} fill="none" style={{ stroke: "var(--ws-rule)" }} strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />}
      {series.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => {
        const pts = line(s.rates, "concept_rate");
        return pts ? <polyline key={s.id} points={pts} fill="none" style={{ stroke: SERIES_COLORS[i % 2] }} strokeWidth="2.5" strokeLinejoin="round" /> : null;
      })}
    </svg>
  );
}

export function OpenProblemsCard({ subtitle, series, items, filter, onFilter, loading, error }: OpenProblemsCardProps) {
  const shown = items.filter((i) => filter === "all" || i.type === filter);
  const aiRate = series.length ? lastRate(series[0].rates, "ai_ml_rate") : null;
  const chips: Array<[ProblemFilter, string]> = [["all", "All"], ["open_problem", "Open problem"], ["limitation", "Limitation"], ["future_work", "Future work"]];
  return (
    <section id="open-problems" className="gx-open" aria-labelledby="op-h">
      <div className="gx-open__head">
        <div className="gx-open__titles">
          <h2 id="op-h" className="gx-open__h">What authors say is still open</h2>
          <span className="gx-open__sub">{subtitle}</span>
        </div>
        <div className="gx-legend">
          {series.map((s, i) => {
            const r = lastRate(s.rates, "concept_rate");
            return <span key={s.id} className="gx-legend__i"><span className="gx-legend__sw" style={{ borderTop: `2.5px solid ${SERIES_COLORS[i % 2]}` }} />{fmtText(s.label)}{isNum(r) ? ` · ${fmtPct(r)}` : ""}</span>;
          })}
          {isNum(aiRate) && <span className="gx-legend__i"><span className="gx-legend__sw" style={{ borderTop: "2px dotted var(--ws-rule)" }} />All AI/ML · {fmtPct(aiRate)}</span>}
        </div>
      </div>
      <Chart series={series} />
      <div className="gx-filters">
        {chips.map(([key, name]) => {
          const n = key === "all" ? items.length : items.filter((i) => i.type === key).length;
          return <button key={key} type="button" className="gx-fchip" aria-pressed={filter === key} onClick={() => onFilter(key)}>{name} · {n}</button>;
        })}
      </div>
      {loading && <p className="gx-empty" role="status">Loading open problems…</p>}
      {error && <p className="gx-empty" role="alert">{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="gx-empty">{items.length === 0 ? "Open problems are not extracted yet; sentences appear once the pipeline mines them." : "No statements of this type for this selection. Choose All to see the rest."}</p>
      )}
      {!loading && !error && shown.length > 0 && (
        <ul className="gx-sents">
          {shown.map((it) => {
            const href = safeExternalUrl(it.paper.url);
            return (
              <li key={`${it.paper.id}-${it.sentence}`} className="gx-sent">
                <span className="gx-sent__t">“{fmtText(it.sentence)}”</span>
                <span className="gx-sent__meta">
                  <span className="gx-sent__type">{typeLabels[it.type] ?? it.type}</span>
                  <span className="gx-sent__concept"><span className="gx-sent__dot" style={{ background: it.dot }} />{it.conceptLabel}</span>
                  <span className="gx-mono gx-ink">{fmtYear(it.paper.year)}{isNum(it.confidence) ? ` · conf ${fmtDec(it.confidence)}` : ""}</span>
                  <span className="gx-grow" />
                  {href && <a href={href} target="_blank" rel="noreferrer" className="gx-sent__a">View paper →</a>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Neutral stand-in until a gap or concept is selected. Draws no data. */
export function OpenProblemsSkeleton({ loading }: { loading?: boolean }) {
  return (
    <section id="open-problems" className={`gx-open gx-skel${loading ? " is-loading" : ""}`} aria-labelledby="op-h" aria-busy={loading || undefined}>
      <div className="gx-open__head">
        <div className="gx-open__titles">
          <h2 id="op-h" className="gx-open__h">What authors say is still open</h2>
          <span className="gx-open__sub">Appears for the selected gap</span>
        </div>
      </div>
      <div className="gx-chartframe" aria-hidden="true">
        <span className="gx-chartframe__y" />
        <span className="gx-chartframe__x" />
      </div>
      <p className="gx-skel__cap">Line chart: the share of papers each year that state an open problem, for each concept in the pair against all AI/ML papers.</p>
      <ul className="gx-sents" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="gx-sent gx-sent--skel">
            <span className="gx-bar gx-bar--line" />
            <span className="gx-bar gx-bar--line gx-bar--short" />
            <span className="gx-bar gx-bar--xs" />
          </li>
        ))}
      </ul>
      <p className="gx-skel__cap">Sentences from paper abstracts, tagged as open problem, limitation or future work, appear here with a link to each paper.</p>
    </section>
  );
}
