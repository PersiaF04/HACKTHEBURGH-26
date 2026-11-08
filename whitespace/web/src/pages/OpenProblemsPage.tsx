import { useState, type ChangeEvent } from 'react';
import type { OpenProblem, OpenProblemResponse } from '../api';
import { EmptyNote, SkeletonBlock } from '../components/Skeleton';
import { fmtPct, fmtText, fmtYear } from '../lib/format';
import './whitespace-pages.css';
import '../components/gaps/gaps.css';
import './open-problems.css';

export const OPEN_PROBLEMS_CAPTION = 'Statements appear once papers with stated future work, limitations or open problems have been extracted; nothing is shown until then.';

function OpenProblemsSkeleton({ loading }: { loading: boolean }) {
  return (
    <div className="ws-op-skeleton" aria-label="Open problems layout, no data yet">
      <svg className="ws-skel-chart" viewBox="0 0 220 120" role="img" aria-label="Empty rate-over-time chart frame">
        <rect x="30" y="8" width="180" height="84" style={{ fill: "var(--ws-track)", stroke: "var(--ws-border-strong)" }} />
        <text x="120" y="112" textAnchor="middle">Year</text>
        <text x="10" y="50" textAnchor="middle" transform="rotate(-90 10 50)">Share of papers</text>
      </svg>
      <div aria-hidden="true">
        {[0, 1, 2].map((i) => <div className="ws-skel-row" key={i}><SkeletonBlock height={10} width={i === 1 ? '75%' : '92%'} /><SkeletonBlock height={10} /></div>)}
      </div>
      <p className="ws-skel-caption" role="status">{loading ? 'Loading statements… ' : ''}{OPEN_PROBLEMS_CAPTION}</p>
    </div>
  );
}

export interface OpenProblemsPageProps {
  response: OpenProblemResponse | null;
  selectedConcept: string;
  onConceptChange: (conceptId: string) => void;
  selectedType: 'all' | 'future_work' | 'limitation' | 'open_problem';
  onTypeChange: (type: OpenProblemsPageProps['selectedType']) => void;
  status: 'loading' | 'ready' | 'empty' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
}

const typeLabels: Record<string, string> = {
  future_work: 'Future work',
  limitation: 'Limitation',
  open_problem: 'Open problem',
};

const chartWidth = 720;
const chartHeight = 170;
const chartPadding = { top: 18, right: 16, bottom: 34, left: 48 };

function formatRate(value: number | null): string {
  return fmtPct(value, 1);
}

function RateTrend({ points, conceptLabel }: { points: NonNullable<OpenProblemResponse['rates_by_year']>; conceptLabel: string }) {
  const usable = points.filter((point) => Number.isFinite(point.year));
  const values = usable.flatMap((point) => [point.concept_rate, point.ai_ml_rate])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (usable.length === 0 || values.length === 0) {
    return <EmptyNote>No rate-over-time data for this selection ({fmtPct(null)}).</EmptyNote>;
  }

  const minYear = Math.min(...usable.map((point) => point.year));
  const maxYear = Math.max(...usable.map((point) => point.year));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const x = (year: number) => chartPadding.left + (maxYear === minYear ? innerWidth / 2 : ((year - minYear) / (maxYear - minYear)) * innerWidth);
  const y = (rate: number) => chartPadding.top + innerHeight - ((rate - minValue) / valueRange) * innerHeight;
  const series = [
    { key: 'concept_rate' as const, label: conceptLabel, className: 'ws-rate-line--concept' },
    { key: 'ai_ml_rate' as const, label: 'All concepts in this AI/ML scope', className: 'ws-rate-line--scope' },
  ];

  return (
    <div className="ws-rate-trend">
      <svg className="ws-rate-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Stated open-problem rate by year for the selected concept and the full AI/ML scope">
        <line x1={chartPadding.left} y1={chartPadding.top} x2={chartPadding.left} y2={chartHeight - chartPadding.bottom} className="ws-rate-axis" />
        <line x1={chartPadding.left} y1={chartHeight - chartPadding.bottom} x2={chartWidth - chartPadding.right} y2={chartHeight - chartPadding.bottom} className="ws-rate-axis" />
        <text x={chartPadding.left - 8} y={chartPadding.top + 4} textAnchor="end" className="ws-rate-label">{formatRate(maxValue)}</text>
        <text x={chartPadding.left - 8} y={chartHeight - chartPadding.bottom + 4} textAnchor="end" className="ws-rate-label">{formatRate(minValue)}</text>
        <text x={chartPadding.left} y={chartHeight - 8} textAnchor="start" className="ws-rate-label">{fmtYear(minYear)}</text>
        <text x={chartWidth - chartPadding.right} y={chartHeight - 8} textAnchor="end" className="ws-rate-label">{fmtYear(maxYear)}</text>
        {series.map((item) => {
          const valid = usable.filter((point) => point[item.key] !== null && Number.isFinite(point[item.key]));
          return (
            <g key={item.key} className={item.className}>
              {valid.length > 1 && <polyline points={valid.map((point) => `${x(point.year)},${y(point[item.key] as number)}`).join(' ')} />}
              {valid.map((point) => <circle key={point.year} cx={x(point.year)} cy={y(point[item.key] as number)} r="4" />)}
            </g>
          );
        })}
      </svg>
      <ul className="ws-rate-legend" aria-hidden="true">
        {series.map((item) => <li key={item.key}><span className={`ws-rate-swatch ${item.className}`} />{item.label}</li>)}
      </ul>
      <details className="ws-rate-data">
        <summary>View rate values</summary>
        <div className="ws-table-wrap">
          <table>
            <caption>Share of papers with a stated open problem by publication year</caption>
            <thead><tr><th scope="col">Year</th><th scope="col">{conceptLabel}</th><th scope="col">All concepts in this AI/ML scope</th></tr></thead>
            <tbody>{usable.map((point) => <tr key={point.year}><th scope="row">{fmtYear(point.year)}</th><td>{formatRate(point.concept_rate)}</td><td>{formatRate(point.ai_ml_rate)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function titleCase(value: string): string {
  return typeLabels[value] ?? value.split('_').join(' ');
}

const TYPES: Array<[OpenProblemsPageProps['selectedType'], string]> = [
  ['all', 'All'], ['open_problem', 'Open problems'], ['future_work', 'Future work'], ['limitation', 'Limitations'],
];

const TYPE_HELP: Record<string, string> = {
  open_problem: 'The authors say something is unknown, unclear or unexplored.',
  future_work: 'The authors say what should be done next.',
  limitation: 'The authors state a weakness or constraint of their own work.',
};

export function OpenProblemsPage({
  selectedConcept,
  onConceptChange,
  selectedType,
  onTypeChange,
  response,
  status,
  errorMessage,
  onRetry,
}: OpenProblemsPageProps) {
  const conceptOptions = response?.concept_options ?? [];
  const items: OpenProblem[] = response?.items ?? [];
  const placeholder = response?.placeholder ?? false;
  const selectedLabel = conceptOptions.find((concept) => concept.id === selectedConcept)?.label ?? 'Selected concept';
  const labelOf = (id: string) => conceptOptions.find((concept) => concept.id === id)?.label ?? id;
  const [picked, setPicked] = useState<number | null>(null);
  const quality = (response as { quality?: string } | null)?.quality;
  const qualityNote = (response as { note?: string } | null)?.note;
  const latest = [...(response?.rates_by_year ?? [])].filter((point) => point.ai_ml_rate !== null).sort((a, b) => b.year - a.year)[0];
  const counts: Record<string, number> = { open_problem: 0, future_work: 0, limitation: 0 };
  items.forEach((item) => { counts[item.type] = (counts[item.type] ?? 0) + 1; });
  const sel = picked !== null ? items[picked] : null;
  const changeConcept = (event: ChangeEvent<HTMLSelectElement>) => { setPicked(null); onConceptChange(event.currentTarget.value); };
  const chooseType = (type: OpenProblemsPageProps['selectedType']) => { setPicked(null); onTypeChange(type); };
  const ready = status === 'ready';
  const summary: Array<[string, string, string]> = [
    ['Statements shown', ready ? String(items.length) : fmtPct(null), selectedConcept ? `About ${fmtText(selectedLabel)}` : 'Across all concepts'],
    ['Open problems / future work', ready ? `${counts.open_problem} / ${counts.future_work}` : fmtPct(null), `${counts.limitation} limitations in this view`],
    ['Papers with a statement', latest ? fmtPct(latest.ai_ml_rate, 1) : fmtPct(null), latest ? `Share of papers in ${fmtYear(latest.year)}` : 'Share of papers'],
  ];

  return (
    <div className="gx ws-open-problems" aria-label="Open problems">
      <aside className="gx-rail" aria-label="Filters" data-tour="open-problem-filters">
        <div className="gx-card">
          <label className="gx-card__t" htmlFor="op-concept">Concept</label>
          <select id="op-concept" className="gx-select" value={selectedConcept} onChange={changeConcept}>
            <option value="">All concepts</option>
            {conceptOptions.map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
          </select>
          <p className="gx-help">Only statements that mention this concept.</p>
        </div>
        <div className="gx-card">
          <span className="gx-card__t" id="op-type-l">Statement type</span>
          <div className="gx-seg" role="radiogroup" aria-labelledby="op-type-l">
            {TYPES.map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={selectedType === value} className={selectedType === value ? 'is-on' : undefined} onClick={() => chooseType(value)}>{label}</button>
            ))}
          </div>
          <p className="gx-help">{selectedType === 'all' ? 'Showing every kind of statement.' : TYPE_HELP[selectedType]}</p>
        </div>
        <div className="gx-card">
          <span className="gx-card__t">What the types mean</span>
          <ul className="gx-defs">
            {Object.entries(TYPE_HELP).map(([k, v]) => <li key={k}><strong>{titleCase(k)}</strong><span>{v}</span></li>)}
          </ul>
        </div>
      </aside>

      <section className="gx-centre" aria-labelledby="op-h">
        <div className="gx-titles">
          <h1 id="op-h" className="gx-h1">Open Problems</h1>
          <p className="gx-desc gx-question">What do authors themselves say is still unsolved?</p>
          <p className="gx-desc">Questions, limitations and future work stated by authors, each linked to the paper where the wording appears. A statement is a lead to follow up, not proof that a question is still open today.</p>
        </div>

        <div className="gx-summary gx-summary--3">
          {summary.map(([label, v, cap]) => (
            <div key={label} className="gx-summary__c"><span className="gx-summary__l">{label}</span><span className="gx-summary__v">{v}</span><span className="gx-summary__cap">{cap}</span></div>
          ))}
        </div>

        <section className="gx-tablecard ws-op-chart" aria-labelledby="ws-rate-heading" data-tour="open-problem-trend">
          <div>
            <h2 id="ws-rate-heading" className="gx-h3">Stated open problems over time</h2>
            <p className="gx-desc">Share of papers whose abstract states a question or limitation, for {selectedConcept ? fmtText(selectedLabel) : 'all concepts'} against the whole AI/ML scope. Missing values are not treated as zero.</p>
          </div>
          {status === 'error' && <EmptyNote>Rate history is unavailable while the statements request has failed.</EmptyNote>}
          {ready && response && <RateTrend points={response.rates_by_year ?? []} conceptLabel={selectedConcept ? selectedLabel : 'All selected concepts'} />}
        </section>

        {status === 'error' && (
          <div className="ws-state ws-state--error" role="alert">
            <p>{errorMessage || 'Statements could not be loaded.'}</p>
            {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
          </div>
        )}
        {status !== 'error' && items.length === 0 && <OpenProblemsSkeleton loading={status === 'loading'} />}
        {ready && items.length === 0 && !placeholder && <EmptyNote>No matching statements for these filters.</EmptyNote>}

        {ready && items.length > 0 && (
          <ul className="ws-op-list" data-tour="open-problem-list" aria-label={`${items.length} statements`}>
            {items.map((item, index) => (
              <li key={`${item.paper.id}-${index}`}>
                <button type="button" className={picked === index ? 'ws-op-card is-selected' : 'ws-op-card'} aria-pressed={picked === index} onClick={() => setPicked(picked === index ? null : index)}>
                  <span className="ws-op-card__meta"><span className="gx-tag gx-tag--solid">{titleCase(item.type)}</span><span>{fmtYear(item.paper.year)}</span></span>
                  <span className="ws-op-card__q">{item.sentence}</span>
                  <span className="ws-op-card__src">{fmtText(item.paper.title)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="gx-detailcol">
        <aside className="gx-detail" aria-label="Statement details" aria-live="polite">
          {sel ? (
            <>
              <div className="gx-detail__head">
                <span className="gx-eyebrow">{titleCase(sel.type)} · {fmtYear(sel.paper.year)}</span>
                <h2 className="gx-detail__title ws-op-title">Statement</h2>
              </div>
              <blockquote className="ws-op-quote">{sel.sentence}</blockquote>
              <section className="gx-sec">
                <h3 className="gx-h3">Source paper</h3>
                <p className="gx-desc"><a href={sel.paper.url} target="_blank" rel="noreferrer">{fmtText(sel.paper.title)} <span className="ws-sr-only">(opens in a new tab)</span></a></p>
                {sel.paper.abstract_excerpt && <p className="gx-desc">{sel.paper.abstract_excerpt}</p>}
              </section>
              {(sel.concept_ids ?? []).length > 0 && (
                <section className="gx-sec">
                  <h3 className="gx-h3">Concepts it mentions</h3>
                  <div className="ws-op-chips">
                    {(sel.concept_ids ?? []).slice(0, 12).map((id) => <button key={id} type="button" onClick={() => { setPicked(null); onConceptChange(id); }}>{fmtText(labelOf(id))}</button>)}
                  </div>
                  <p className="gx-help">Pick one to filter the list to it.</p>
                </section>
              )}
              <button type="button" className="gx-more" onClick={() => setPicked(null)}>Back to reading guide</button>
            </>
          ) : (
            <>
              <div className="gx-detail__head">
                <span className="gx-eyebrow">Reading guide</span>
                <h2 className="gx-detail__title gx-detail__title--idle">Select a statement</h2>
                <p className="gx-detail__status">Pick a card to see its source paper and the concepts it mentions.</p>
              </div>
              <section className="gx-sec">
                <h3 className="gx-h3">How reliable is this?</h3>
                <p className="gx-desc">{qualityNote ?? 'Statements were picked by a pattern match on abstracts and have not been hand-checked, so some are not real author-stated open problems.'}</p>
                {quality && <p className="gx-desc">Extraction quality: <strong className="gx-ink">{quality}</strong>.</p>}
              </section>
              <section className="gx-sec">
                <h3 className="gx-h3">Where it comes from</h3>
                <p className="gx-desc">Short excerpts quoted from abstracts indexed by OpenAlex. Copyright remains with the publishers and authors; no full abstracts are included.</p>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
