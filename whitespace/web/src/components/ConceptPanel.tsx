import type { ConceptPoint, ConceptResponse, GapSummary } from "../api";
import { fmtGrowth, fmtInt, fmtInterval, fmtP, fmtPct, fmtText, fmtYear } from "../lib/format";
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
  const label = `Papers per year, ${fmtYear(bars[0].year)} to ${fmtYear(bars[bars.length - 1].year)}`;
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
              <td>{fmtYear(b.year)}</td>
              <td>{fmtInt(b.v)}{b.lo !== null ? ` (80% interval ${fmtInt(b.lo)} to ${fmtInt(b.hi)})` : ""}</td>
              <td>{b.forecast ? "forecast" : "observed"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ConceptPanel({ concept, detail, gaps, year, onSelectConcept, area, firstYear, gapRate }: ConceptPanelProps) {
  if (!concept) return <aside className="whitespace-concept ex__right" aria-label="Concept details"><p className="whitespace-help">Select a dot on the map or a search result to see its details here.</p></aside>;

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
        {areaName && <span className="whitespace-concept__area">{fmtText(areaName)}</span>}
        <h2>{fmtText(concept.label)}</h2>
        <span className="whitespace-concept__first">First appears {fmtYear(first)}</span>
      </header>

      <dl className="whitespace-concept__stats">
        <div><dt>Papers</dt><dd>{fmtInt(concept.paper_count)}</dd></div>
        <div><dt>3-yr growth</dt><dd className={growthClass}>{fmtGrowth(concept.growth)}</dd></div>
        <div><dt>Stated-gap rate</dt><dd>{fmtPct(rate)}</dd></div>
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
                <button type="button" className="whitespace-concept__gapname" onClick={() => onSelectConcept(otherId)}>{fmtText(other)}</button>
                <span className="whitespace-concept__p" title="Predicted probability of a new link">P {fmtP(g.p_link)}</span>
                <span className="whitespace-concept__ci" title="Interval around that probability">{fmtInterval(g.p_lo, g.p_hi)}</span>
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
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{fmtText(p.title)}</a> : <span className="whitespace-concept__ptitle">{fmtText(p.title)}</span>}
                <span>{fmtYear(p.year)}</span>
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
            <blockquote key={`${op.paper?.id ?? "p"}-${i}`} className="whitespace-concept__problem" title={fmtText(op.paper?.title)}>
              <span className="whitespace-concept__tag">{fmtText(TYPE_LABEL[op.type] ?? op.type)}</span>
              <span>{fmtText(op.sentence)}</span>
            </blockquote>
          ))}
        </section>
      )}

      {neighbours.length > 0 && (
        <section aria-labelledby="wc-links">
          <h3 id="wc-links">Linked concepts</h3>
          <div className="whitespace-concept__chips">
            {neighbours.map((n) => (
              <button key={n.id} type="button" onClick={() => onSelectConcept(n.id)}>{fmtText(n.label)}</button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

const SKELETON_SECTIONS: [string, string][] = [
  ["Papers per year", "Yearly paper count for the concept, with a dashed 3-year forecast."],
  ["Predicted gaps", "Concepts it is most likely to be linked with next, with a link probability."],
  ["Most-cited papers", "The papers that define the concept, with links to read them."],
  ["Stated open problems", "Sentences where authors say what is still unsolved."],
  ["Linked concepts", "Neighbouring concepts. Click one to jump to it."],
];

/** Shown while the export has no data: teaches what appears here without any invented values. */
export function ConceptPanelSkeleton() {
  return (
    <aside className="whitespace-concept ex__right whitespace-concept--skeleton" aria-label="Concept details (empty until data loads)">
      <header>
        <span className="whitespace-ghost whitespace-ghost--title" aria-hidden="true" />
        <p className="whitespace-help">Click a dot on the map and its details appear here.</p>
      </header>
      <dl className="whitespace-concept__stats">
        <div><dt>Papers</dt><dd>{fmtInt(null)}</dd></div>
        <div><dt>3-yr growth</dt><dd>{fmtGrowth(null)}</dd></div>
        <div><dt>Stated-gap rate</dt><dd>{fmtPct(null)}</dd></div>
      </dl>
      <ul className="whitespace-concept__preview">
        {SKELETON_SECTIONS.map(([name, text]) => (
          <li key={name}><h3>{name}</h3><p>{text}</p></li>
        ))}
      </ul>
    </aside>
  );
}
