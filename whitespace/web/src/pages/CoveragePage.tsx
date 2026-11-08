import type { CoverageResponse } from '../api';
import { CoverageHeatmap, type SelectedCoverageCell } from './CoverageHeatmap';
import { EmptyNote, SkeletonBlock } from '../components/Skeleton';
import { fmtText, fmtYear } from '../lib/format';
import './coverage.css';

export const COVERAGE_CAPTION = 'Shows the share of papers with code linked in the Papers with Code archive; a missing link does not mean no code exists.';

function CoverageSkeleton({ loading }: { loading: boolean }) {
  const cols = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className="ws-coverage-skeleton" aria-label="Coverage heatmap layout, no data yet">
      <div className="ws-skel-heat" aria-hidden="true">
        <span className="ws-skel-axis">Concept</span>
        {cols.map((i) => <span className="ws-skel-axis" key={i}>Year</span>)}
        {[0, 1, 2, 3, 4].map((row) => (<div key={row} style={{ display: 'contents' }}>
          <SkeletonBlock height={12} width="80%" />
          {cols.map((i) => <SkeletonBlock key={i} />)}
        </div>))}
      </div>
      <p className="ws-skel-axis-title">Concept (rows) x Year (columns)</p>
      <div className="ws-skel-legend" role="group" aria-label="Colour scale">
        <span>Lower share with code linked</span><span className="ws-skel-gradient" aria-hidden="true" /><span>Higher share with code linked</span>
        <SkeletonBlock width={26} height={14} /><span>Grey: no value for that cell</span>
      </div>
      <p className="ws-skel-caption" role="status">{loading ? 'Loading coverage… ' : ''}{COVERAGE_CAPTION}</p>
    </div>
  );
}

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
    <section className="ws-coverage-page" aria-label="Code coverage">
      <header className="ws-coverage-header">
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
          : <p>Archive source link: —.</p>}
        <p>Dataset card-reported snapshot date: <strong>{fmtText(archive?.snapshot_date)}</strong>.</p>
        {archive?.file_vintage_verified && archive.revision_sha
          ? <p>File vintage verified at dataset revision <code>{archive.revision_sha}</code>.</p>
          : <p className="ws-coverage-vintage-warning">Exact file vintage and dataset revision are unverified; the date above is the dataset card’s reported date.</p>}
        <p>
          Licence: {archive?.license_id
            ? archive.license_url
              ? <a href={archive.license_url} target="_blank" rel="noreferrer">{archive.license_id} <span className="ws-coverage-sr-only">(opens in a new tab)</span></a>
              : <strong>{archive.license_id} (no licence link)</strong>
            : '—'}
        </p>
      </section>

      <div className="ws-coverage-controls">
        <label htmlFor="ws-coverage-year">Focus year</label>
        <select
          id="ws-coverage-year"
          value={selectedYear}
          disabled={years.length === 0}
          onChange={(event) => onYearChange(Number(event.currentTarget.value))}
        >
          {years.map((year) => <option key={year} value={year}>{fmtYear(year)}</option>)}
        </select>
        <span>
          The full matrix remains visible; the focus year is highlighted.
          {years.length > 0 && ` Columns are publication years ${fmtYear(Math.min(...years))}–${fmtYear(Math.max(...years))}, which can differ from the map's snapshot years.`}
        </span>
      </div>

      {status === 'error' && (
        <div className="ws-coverage-state ws-coverage-error" role="alert">
          <p>{errorMessage || 'Coverage could not be loaded.'}</p>
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
        </div>
      )}
      {status !== 'error' && concepts.length === 0 && <CoverageSkeleton loading={status === 'loading'} />}
      {status === 'ready' && concepts.length === 0 && placeholder && <EmptyNote>Placeholder data: no example coverage values, and no research result is being shown.</EmptyNote>}

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
