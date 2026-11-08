import type { ConceptPoint, ConceptResponse, GapSummary } from "../api";
import "./explore.css";

type ConceptPanelProps = {
  /** The selected concept's map point. */
  concept: ConceptPoint | undefined;
  /** api.concept(id): undefined while loading, null when the export has no entry. */
  detail: ConceptResponse | null | undefined;
  /** Gaps involving this concept; undefined while loading. */
  gaps: GapSummary[] | undefined;
  /** Whether the data is placeholder data (the header badge is the only signal; unused here). */
  placeholder?: boolean;
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
const DASH = "—";

function goToGaps(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  window.history.pushState({}, "", "/gaps");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

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
  const lastYear = bars[bars.length - 1].year;
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
            <span className="whitespace-mono whitespace-bars__year">{b.year % 2 === lastYear % 2 || bars.length <= 8 ? `’${String(b.year).slice(-2)}` : ""}</span>
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

export function ConceptPanel({ concept, detail, gaps, year, onSelectConcept, area, firstYear, gapRate }: ConceptPanelProps) {
  if (!concept) return <aside className="whitespace-concept ex__right" aria-label="Concept details" />;

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
  const areaName = area ?? concept.area ?? detail?.area ?? null;
  const first = firstYear ?? detail?.first_year ?? null;
  const rate = gapRate ?? detail?.gap_rate ?? null;
  const growthClass = concept.growth !== null && concept.growth !== undefined && concept.growth < 0 ? "is-down" : "is-up";

  return (
    <aside className="whitespace-concept ex__right" aria-label="Concept details" aria-live="polite">
      <header>
        {areaName && <span className="whitespace-concept__area">{areaName}</span>}
        <h2>{concept.label}</h2>
        {typeof first === "number" && <span className="whitespace-concept__first">First appears {first}</span>}
      </header>

      <dl className="whitespace-concept__stats">
        <div><dt>Papers</dt><dd>{typeof concept.paper_count === "number" ? concept.paper_count.toLocaleString("en-GB") : DASH}</dd></div>
        <div><dt>3-yr growth</dt><dd className={growthClass}>{concept.growth === null || concept.growth === undefined ? DASH : fmtPct(concept.growth)}</dd></div>
        <div><dt>Stated-gap rate</dt><dd>{typeof rate === "number" ? `${Math.round(rate * 100)}%` : DASH}</dd></div>
      </dl>

      {counts.length > 0 && (
        <section aria-labelledby="wc-ppy">
          <div className="whitespace-concept__head">
            <h3 id="wc-ppy">Papers per year</h3>
            {forecast.length > 0 && <span className="whitespace-concept__sub">dashed = forecast, 80% interval</span>}
          </div>
          <PapersPerYear counts={counts} forecast={forecast} />
        </section>
      )}

      {myGaps.length > 0 && (
        <section aria-labelledby="wc-gaps">
          <div className="whitespace-concept__head">
            <h3 id="wc-gaps">Predicted gaps</h3>
            <a href="/gaps" onClick={goToGaps}>All gaps {"→"}</a>
          </div>
          <ul className="whitespace-concept__gaps">
            {myGaps.map(({ g, otherId, other }) => (
              <li key={otherId}>
                <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" /></svg>
                <button type="button" className="whitespace-concept__gapname" onClick={() => onSelectConcept(otherId)}>{other}</button>
                <span className="whitespace-concept__p">P {g.p_link.toFixed(2)}</span>
                {g.p_lo !== null && g.p_hi !== null && (
                  <span className="whitespace-concept__ci">[{g.p_lo.toFixed(2)}, {g.p_hi.toFixed(2)}]</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {papers.length > 0 && (
        <section aria-labelledby="wc-papers">
          <h3 id="wc-papers">Most-cited papers</h3>
          <ol className="whitespace-concept__papers">
            {papers.slice(0, 5).map((p) => (
              <li key={p.id}>
                <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                <span>{p.year}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {problems.length > 0 && (
        <section aria-labelledby="wc-probs">
          <div className="whitespace-concept__head">
            <h3 id="wc-probs">Stated open problems</h3>
            <a href="/open-problems" onClick={(event) => { event.preventDefault(); window.history.pushState({}, "", "/open-problems"); window.dispatchEvent(new PopStateEvent("popstate")); }}>All {"→"}</a>
          </div>
          {problems.slice(0, 3).map((op, i) => (
            <blockquote key={`${op.paper.id}-${i}`} className="whitespace-concept__problem" title={op.paper.title}>
              <span className="whitespace-concept__tag">{TYPE_LABEL[op.type] ?? op.type}</span>
              <span>{op.sentence}</span>
            </blockquote>
          ))}
        </section>
      )}

      {neighbours.length > 0 && (
        <section aria-labelledby="wc-links">
          <h3 id="wc-links">Linked concepts</h3>
          <div className="whitespace-concept__chips">
            {neighbours.map((n) => (
              <button key={n.id} type="button" onClick={() => onSelectConcept(n.id)}>{n.label}</button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
