import type { CoverageResponse } from '../api';
import { CoverageHeatmap, type SelectedCoverageCell } from './CoverageHeatmap';
import './coverage.css';

export interface CoveragePageProps {
  response: CoverageResponse | null;
  selectedYear: number;
  onYearChange: (year: number) => void;
  onSelectCell: (cell: SelectedCoverageCell) => void;
  status: 'loading' | 'ready' | 'empty' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
}

export function CoveragePage({
  response,
  selectedYear,
  onYearChange,
  onSelectCell,
  status,
  errorMessage,
  onRetry,
}: CoveragePageProps) {
  const years = response?.years ?? [];
  const concepts = response?.concepts ?? [];
  const placeholder = response?.placeholder ?? false;
  const archive = response?.archive;
  const caveat = response?.caveat?.replace(/^Coverage is a lower bound(?:\s+from)?\.?\s*/i, '')
    || 'The archive is incomplete and historical; a paper with no linked code here may still have an implementation elsewhere.';

  return (
    <section className="ws-coverage-page" aria-labelledby="ws-coverage-title">
      <header className="ws-coverage-header">
        <p className="ws-coverage-eyebrow">Research landscape</p>
        <h2 id="ws-coverage-title">Code coverage</h2>
        <p>Explore the share of papers with a recorded code link by concept and year.</p>
      </header>

      <aside className="ws-coverage-caveat" aria-label="Important limitation">
        <strong>Coverage is a lower bound.</strong>
        <span>{caveat.charAt(0).toUpperCase() + caveat.slice(1)}</span>
      </aside>

      <section className="ws-coverage-provenance" aria-labelledby="ws-coverage-source-title">
        <h3 id="ws-coverage-source-title">Archive source and licence</h3>
        {archive?.source_url
          ? <p>Source: <a href={archive.source_url} target="_blank" rel="noreferrer">Papers with Code paper-to-code archive <span className="ws-coverage-sr-only">(opens in a new tab)</span></a></p>
          : <p>Archive source link not supplied.</p>}
        <p>Dataset card-reported snapshot date: <strong>{archive?.snapshot_date ?? 'Not reported'}</strong>.</p>
        {archive?.file_vintage_verified && archive.revision_sha
          ? <p>File vintage verified at dataset revision <code>{archive.revision_sha}</code>.</p>
          : <p className="ws-coverage-vintage-warning">Exact file vintage and dataset revision are unverified; the date above is the dataset card’s reported date.</p>}
        <p>
          Licence: {archive?.license_id
            ? archive.license_url
              ? <a href={archive.license_url} target="_blank" rel="noreferrer">{archive.license_id} <span className="ws-coverage-sr-only">(opens in a new tab)</span></a>
              : <strong>{archive.license_id} (licence link not supplied)</strong>
            : 'Licence information not supplied.'}
        </p>
      </section>

      {placeholder && (
        <p className="ws-coverage-placeholder" role="status">
          Placeholder data — these values are examples, not measured research results.
        </p>
      )}

      <div className="ws-coverage-controls">
        <label htmlFor="ws-coverage-year">Focus year</label>
        <select
          id="ws-coverage-year"
          value={selectedYear}
          disabled={years.length === 0}
          onChange={(event) => onYearChange(Number(event.currentTarget.value))}
        >
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <span>The full matrix remains visible; the focus year is highlighted.</span>
      </div>

      {status === 'loading' && <p className="ws-coverage-state" role="status">Loading coverage…</p>}
      {status === 'error' && (
        <div className="ws-coverage-state ws-coverage-error" role="alert">
          <p>{errorMessage || 'Coverage could not be loaded.'}</p>
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
        </div>
      )}
      {(status === 'empty' || (status === 'ready' && concepts.length === 0)) && (
        <p className="ws-coverage-state" role="status">
          {placeholder
            ? 'The placeholder response contains no example coverage values. No research result is being shown.'
            : `No coverage values are available${selectedYear ? ` for ${selectedYear}` : ''}.`}
        </p>
      )}

      {status === 'ready' && concepts.length > 0 && years.length > 0 && (
        <CoverageHeatmap
          years={years}
          selectedYear={selectedYear}
          concepts={concepts}
          onSelectCell={onSelectCell}
        />
      )}
    </section>
  );
}
