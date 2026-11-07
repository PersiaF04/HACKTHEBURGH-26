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
  const changeConcept = (event: ChangeEvent<HTMLSelectElement>) => onConceptChange(event.currentTarget.value);
  const changeType = (event: ChangeEvent<HTMLSelectElement>) =>
    onTypeChange(event.currentTarget.value as OpenProblemsPageProps['selectedType']);

  return (
    <main className="ws-page ws-open-problems">
      <header className="ws-page__header">
        <p className="ws-eyebrow">Explore the literature</p>
        <h1>Open problems</h1>
        <p className="ws-lede">
          Questions and limitations stated by authors, linked to the papers where they appear.
        </p>
      </header>

      {placeholder && <p className="ws-notice" role="status">Example data — these are placeholders, not research findings.</p>}

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
    </main>
  );
}
