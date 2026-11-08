import type { ConceptPoint, ConceptResponse, GapSummary } from "../api";
import "./explore.css";

type ConceptPanelProps = {
  /** The selected concept's map point. */
  concept: ConceptPoint | undefined;
  /** api.concept(id): undefined while loading, null when the export has no entry. */
  detail: ConceptResponse | null | undefined;
  /** Gaps involving this concept; undefined while loading. */
  gaps: GapSummary[] | undefined;
  /** Whether the data is placeholder data. */
  placeholder: boolean;
  /** Snapshot year, the last observed year for the chart. */
  year: number;
  /** Called when a linked concept or gap partner is picked. */
  onSelectConcept: (id: string) => void;
  /** Optional extras when the data has them. */
  area?: string | null;
  firstYear?: number | null;
  gapRate?: number | null;
  /** Link to the full Gaps page, if the host wants one. */
  gapsHref?: string;
};

type ForecastRow = { year: number; yhat: number; lo: number; hi: number };

/** forecast is typed unknown upstream; accept rows {year,yhat,lo,hi} bare or under `rows`/`points`. */
function parseForecast(raw: unknown): ForecastRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).rows ?? (raw as Record<string, unknown>).points)
      : null;
  if (!Array.isArray(list)) return [];
  const out: ForecastRow[] = [];
  for (const r of list) {
    const o = (r ?? {}) as Record<string, unknown>;
    if ([o.year, o.yhat, o.lo, o.hi].every((v) => typeof v === "number" && Number.isFinite(v))) {
      out.push({ year: o.year as number, yhat: o.yhat as number, lo: o.lo as number, hi: o.hi as number });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const NA = <span className="whitespace-na">not available</span>;

const TYPE_LABEL: Record<string, string> = { future_work: "Future work", limitation: "Limitation", open_problem: "Open problem" };

function PapersPerYear({ counts, forecast }: { counts: { year: number; count: number }[]; forecast: ForecastRow[] }) {
  const lastObs = counts[counts.length - 1].year;
  const fc = forecast.filter((f) => f.year > lastObs);
  const bars = [
    ...counts.map((c) => ({ year: c.year, v: c.count, lo: null as number | null, hi: null as number | null, forecast: false })),
    ...fc.map((f) => ({ year: f.year, v: f.yhat, lo: f.lo, hi: f.hi, forecast: true })),
  ];
  const top = Math.max(1, ...bars.map((b) => b.hi ?? b.v));
  const H = 80;
  const px = (n: number) => (n / top) * H;
  const label = `Papers per year, ${bars[0].year} to ${bars[bars.length - 1].year}`;
  return (
    <>
      <div className="whitespace-bars" role="img" aria-label={`${label}.${fc.length ? " Dashed bars are forecasts with an 80% interval." : ""}`}>
        {bars.map((b) => (
          <div key={b.year} className="whitespace-bars__col">
            <div className="whitespace-bars__plot" style={{ height: H }}>
              <div className={b.forecast ? "whitespace-bars__bar is-forecast" : "whitespace-bars__bar"} style={{ height: px(b.v) }} />
              {b.forecast && b.lo !== null && b.hi !== null && (
                <div className="whitespace-bars__range" style={{ bottom: px(b.lo), height: Math.max(1, px(b.hi - b.lo)) }} />
              )}
            </div>
            <span className="whitespace-mono whitespace-bars__year">{bars.length > 14 && b.year % 2 ? "" : String(b.year).slice(-2)}</span>
          </div>
        ))}
      </div>
      <table className="whitespace-sr">
        <caption>{label}</caption>
        <thead><tr><th>Year</th><th>Papers</th><th>Kind</th></tr></thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.year}>
              <td>{b.year}</td>
              <td>{Math.round(b.v)}{b.lo !== null ? ` (80% interval ${Math.round(b.lo)} to ${Math.round(b.hi ?? 0)})` : ""}</td>
              <td>{b.forecast ? "forecast" : "observed"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ConceptPanel({ concept, detail, gaps, placeholder, year, onSelectConcept, area, firstYear, gapRate, gapsHref }: ConceptPanelProps) {
  if (!concept) {
    return (
      <aside className="whitespace-concept ex__right" aria-label="Concept details">
        <p className="whitespace-note">Select a concept on the map or from search to see its details.</p>
      </aside>
    );
  }

  const counts = (detail?.counts_by_year ?? []).filter((c) => c.year <= year);
  const forecast = parseForecast(detail?.forecast);
  const myGaps = (gaps ?? [])
    .filter((g) => g.a === concept.id || g.b === concept.id)
    .map((g) => ({ g, otherId: g.a === concept.id ? g.b : g.a, other: g.a === concept.id ? g.b_label : g.a_label }))
    .sort((x, y) => y.g.p_link - x.g.p_link)
    .slice(0, 5);
  const papers = detail?.top_papers ?? [];
  const problems = detail?.open_problems ?? [];
  const neighbours = detail?.neighbours ?? [];

  return (
    <aside className="whitespace-concept ex__right" aria-label="Concept details" aria-live="polite">
      {placeholder && <p className="whitespace-note" role="status">Placeholder data: values below are not measured results.</p>}
      {detail === undefined && <p className="whitespace-note" role="status">Loading details…</p>}
      {detail === null && <p className="whitespace-note">No detail entry exists for this concept in the export.</p>}
      <header>
        {area && <span className="whitespace-concept__area">{area}</span>}
        <h2>{concept.label}</h2>
        {typeof firstYear === "number" && <span className="whitespace-note">First appears {firstYear}</span>}
      </header>

      <dl className="whitespace-concept__stats">
        <div><dt>Papers</dt><dd>{typeof concept.paper_count === "number" ? concept.paper_count.toLocaleString() : NA}</dd></div>
        <div><dt>3-yr growth</dt><dd>{concept.growth === null || concept.growth === undefined ? NA : fmtPct(concept.growth)}</dd></div>
        <div><dt>Stated-gap rate</dt><dd>{typeof gapRate === "number" ? `${Math.round(gapRate * 100)}%` : NA}</dd></div>
      </dl>

      <section aria-labelledby="wc-ppy">
        <div className="whitespace-concept__head">
          <h3 id="wc-ppy">Papers per year</h3>
          {forecast.length > 0 && <span className="whitespace-note">dashed = forecast, 80% interval</span>}
        </div>
        {counts.length > 0 ? <PapersPerYear counts={counts} forecast={forecast} /> : <p className="whitespace-note">Yearly counts are not available.</p>}
        {counts.length > 0 && forecast.length === 0 && <p className="whitespace-note">No forecast is available for this concept.</p>}
      </section>

      <section aria-labelledby="wc-gaps">
        <div className="whitespace-concept__head">
          <h3 id="wc-gaps">Predicted gaps</h3>
          {gapsHref && <a href={gapsHref}>All gaps</a>}
        </div>
        {myGaps.length > 0 ? (
          <ul className="whitespace-concept__gaps">
            {myGaps.map(({ g, otherId, other }) => (
              <li key={otherId}>
                <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" /></svg>
                <button type="button" className="whitespace-linkbtn" onClick={() => onSelectConcept(otherId)}>{other}</button>
                <span className="whitespace-mono">P {g.p_link.toFixed(2)}</span>
                {g.p_lo !== null && g.p_hi !== null && (
                  <span className="whitespace-mono whitespace-note">[{g.p_lo.toFixed(2)}, {g.p_hi.toFixed(2)}]</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="whitespace-note">{gaps === undefined ? "Loading predicted gaps…" : gaps.length ? "No predicted gaps listed for this concept." : "No predicted gaps listed for this concept."}</p>
        )}
        <p className="whitespace-note">A gap is a pair not yet linked, with fewer than 3 shared papers.</p>
      </section>

      <section aria-labelledby="wc-papers">
        <h3 id="wc-papers">Most-cited papers</h3>
        {papers.length > 0 ? (
          <ol className="whitespace-concept__papers">
            {papers.slice(0, 5).map((p) => (
              <li key={p.id}>
                <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                <span className="whitespace-mono whitespace-note">{p.year}</span>
              </li>
            ))}
          </ol>
        ) : <p className="whitespace-note">Top papers are not available.</p>}
      </section>

      <section aria-labelledby="wc-probs">
        <h3 id="wc-probs">Stated open problems</h3>
        {problems.length > 0 ? (
          problems.slice(0, 3).map((op, i) => (
            <blockquote key={`${op.paper.id}-${i}`} className="whitespace-concept__problem">
              <span className="whitespace-concept__tag">{TYPE_LABEL[op.type] ?? op.type}</span>
              <span>{op.sentence}</span>
              <a href={op.paper.url} target="_blank" rel="noreferrer" className="whitespace-note">{op.paper.title}</a>
            </blockquote>
          ))
        ) : <p className="whitespace-note">Stated open problems are not available.</p>}
      </section>

      <section aria-labelledby="wc-links">
        <h3 id="wc-links">Linked concepts</h3>
        {neighbours.length > 0 ? (
          <div className="whitespace-concept__chips">
            {neighbours.map((n) => (
              <button key={n.id} type="button" onClick={() => onSelectConcept(n.id)}>{n.label}</button>
            ))}
          </div>
        ) : <p className="whitespace-note">Linked concepts are not in this export.</p>}
      </section>
    </aside>
  );
}
