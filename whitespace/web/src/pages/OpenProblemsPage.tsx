import type { ChangeEvent } from 'react';
import type { OpenProblem, OpenProblemResponse } from '../api';
import { EmptyNote, SkeletonBlock } from '../components/Skeleton';
import { fmtPct, fmtText, fmtYear } from '../lib/format';
import './whitespace-pages.css';

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
const chartHeight = 220;
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
  const changeConcept = (event: ChangeEvent<HTMLSelectElement>) => onConceptChange(event.currentTarget.value);
  const changeType = (event: ChangeEvent<HTMLSelectElement>) =>
    onTypeChange(event.currentTarget.value as OpenProblemsPageProps['selectedType']);

  return (
    <section className="ws-page ws-open-problems" aria-label="Open problems">
      <header className="ws-page__header">
        <p className="ws-eyebrow">Source-led reading</p>
        <h1>Open Problems</h1>
        <p className="ws-question"><strong>What do authors themselves say is still unsolved?</strong></p>
        <p className="ws-lede">
          Questions, limitations and future work stated by authors — always linked back to the paper where the wording appears.
        </p>
        <p className="ws-page__note">Use this page to investigate source material. A statement is evidence to follow up, not proof that a question remains unresolved today.</p>
      </header>


      <section className="ws-filters" aria-label="Filter open problems" data-tour="open-problem-filters">
        <label>
          <span>Concept</span>
          <select value={selectedConcept} onChange={changeConcept}>
            <option value="">All concepts</option>
            {conceptOptions.map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
          </select>
        </label>
        <label>
          <span>Statement type</span>
          <select value={selectedType} onChange={changeType}>
            <option value="all">All types</option>
            <option value="future_work">Future work</option>
            <option value="limitation">Limitations</option>
            <option value="open_problem">Open problems</option>
          </select>
        </label>
      </section>

      <section className="ws-rate-section" aria-labelledby="ws-rate-heading" data-tour="open-problem-trend">
        <div>
          <h2 id="ws-rate-heading">Stated open problems over time</h2>
          <p>Compare the share of papers containing a stated question or limitation for this concept with the AI/ML scope. Missing values are not treated as zero.</p>
        </div>
        {status === 'error' && <EmptyNote>Rate history is unavailable while the statements request has failed.</EmptyNote>}
        {status === 'ready' && response && <RateTrend points={response.rates_by_year ?? []} conceptLabel={selectedConcept ? selectedLabel : 'All selected concepts'} />}
      </section>

      {status === 'error' && (
        <div className="ws-state ws-state--error" role="alert">
          <p>{errorMessage || 'Statements could not be loaded.'}</p>
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
        </div>
      )}
      {status !== 'error' && items.length === 0 && <OpenProblemsSkeleton loading={status === 'loading'} />}
      {status === 'ready' && items.length === 0 && !placeholder && <EmptyNote>No matching statements for these filters.</EmptyNote>}

      {status === 'ready' && items.length > 0 && (
        <>
          <p className="ws-result-count" aria-live="polite">{items.length} {items.length === 1 ? 'statement' : 'statements'}</p>
          <ul className="ws-problem-list" data-tour="open-problem-list">
            {items.map((item, index) => (
              <li className="ws-problem-card" key={`${item.paper.id}-${index}`}>
                <div className="ws-problem-card__meta">
                  <span className="ws-tag">{titleCase(item.type)}</span>
                  <span>{fmtYear(item.paper.year)}</span>
                </div>
                <blockquote>{item.sentence}</blockquote>
                <p className="ws-source">
                  Source: <a href={item.paper.url} target="_blank" rel="noreferrer">
                    {fmtText(item.paper.title)} <span className="ws-sr-only">(opens in a new tab)</span>
                  </a>
                </p>
                {item.paper.abstract_excerpt && <p className="ws-source-excerpt">{item.paper.abstract_excerpt}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
