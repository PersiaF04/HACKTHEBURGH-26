import type { ChangeEvent } from 'react';
import type { OpenProblem, OpenProblemResponse } from '../api';
import './whitespace-pages.css';

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
  if (value === null || !Number.isFinite(value)) return 'Not available';
  return `${(value * 100).toFixed(1)}%`;
}

function RateTrend({ points, conceptLabel }: { points: NonNullable<OpenProblemResponse['rates_by_year']>; conceptLabel: string }) {
  const usable = points.filter((point) => Number.isFinite(point.year));
  const values = usable.flatMap((point) => [point.concept_rate, point.ai_ml_rate])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (usable.length === 0 || values.length === 0) {
    return <p className="ws-state">No rate-over-time data is available for this selection.</p>;
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
        <text x={chartPadding.left} y={chartHeight - 8} textAnchor="start" className="ws-rate-label">{minYear}</text>
        <text x={chartWidth - chartPadding.right} y={chartHeight - 8} textAnchor="end" className="ws-rate-label">{maxYear}</text>
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
            <tbody>{usable.map((point) => <tr key={point.year}><th scope="row">{point.year}</th><td>{formatRate(point.concept_rate)}</td><td>{formatRate(point.ai_ml_rate)}</td></tr>)}</tbody>
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
        <p className="ws-lede">
          Questions and limitations stated by authors, linked to the papers where they appear.
        </p>
      </header>


      <section className="ws-filters" aria-label="Filter open problems">
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

      <section className="ws-rate-section" aria-labelledby="ws-rate-heading">
        <div>
          <h2 id="ws-rate-heading">Stated open problems over time</h2>
          <p>Compare the share of papers for this concept with all concepts in the AI/ML scope. Missing values are not treated as zero.</p>
        </div>
        {status === 'loading' && <p className="ws-state" role="status">Loading rate history…</p>}
        {status === 'error' && <p className="ws-state">Rate history is unavailable while the statements request has failed.</p>}
        {status === 'ready' && response && <RateTrend points={response.rates_by_year ?? []} conceptLabel={selectedConcept ? selectedLabel : 'All selected concepts'} />}
      </section>

      {status === 'loading' && <p className="ws-state" role="status">Loading statements…</p>}
      {status === 'error' && (
        <div className="ws-state ws-state--error" role="alert">
          <p>{errorMessage || 'Statements could not be loaded.'}</p>
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
        </div>
      )}
      {(status === 'empty' || (status === 'ready' && items.length === 0)) && (
        <p className="ws-state" role="status">
          {placeholder
            ? 'The placeholder response contains no example statements. No research result is being shown.'
            : 'No matching statements for these filters.'}
        </p>
      )}

      {status === 'ready' && items.length > 0 && (
        <>
          <p className="ws-result-count" aria-live="polite">{items.length} {items.length === 1 ? 'statement' : 'statements'}</p>
          <ul className="ws-problem-list">
            {items.map((item, index) => (
              <li className="ws-problem-card" key={`${item.paper.id}-${index}`}>
                <div className="ws-problem-card__meta">
                  <span className="ws-tag">{titleCase(item.type)}</span>
                  <span>{item.paper.year}</span>
                </div>
                <blockquote>{item.sentence}</blockquote>
                <p className="ws-source">
                  Source: <a href={item.paper.url} target="_blank" rel="noreferrer">
                    {item.paper.title} <span className="ws-sr-only">(opens in a new tab)</span>
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
