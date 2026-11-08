import type { CoverageCell, CoverageConcept } from '../api';
import { NA, fmtInt, fmtPct, fmtYear } from '../lib/format';

export type SelectedCoverageCell = CoverageCell & { concept_id: string; concept_label: string };

export interface CoverageHeatmapProps {
  years: number[];
  selectedYear: number;
  concepts: CoverageConcept[];
  onSelectCell: (cell: SelectedCoverageCell) => void;
}

function cellFor(concept: CoverageConcept, year: number): CoverageCell | undefined {
  return concept.cells.find((cell) => cell.year === year);
}

function formatRate(rate: number | null | undefined): string {
  return fmtPct(rate, 1);
}

function cellStateLabel(cell: CoverageCell | undefined): string {
  if (!cell) return NA;
  switch (cell.state) {
    case 'available': return 'Available';
    case 'thin': return 'Thin archive coverage';
    case 'outside_archive_vintage': return 'Outside archive vintage';
    case 'unavailable': return 'Unavailable';
    default: return NA;
  }
}

function cellValue(cell: CoverageCell | undefined): string {
  if (cell?.state === 'outside_archive_vintage') return 'Outside archive vintage';
  if (cell?.state === 'unavailable') return 'Unavailable';
  return formatRate(cell?.code_rate);
}

function cellCounts(cell: CoverageCell | undefined): string {
  if (cell?.paper_count === undefined || cell.linked_paper_count === undefined) return `Counts ${NA}`;
  return `${fmtInt(cell.linked_paper_count)} / ${fmtInt(cell.paper_count)} papers linked`;
}

function cellUnavailable(cell: CoverageCell | undefined): boolean {
  return !cell
    || cell.code_rate === null
    || cell.state === 'outside_archive_vintage'
    || cell.state === 'unavailable';
}

function rateColor(rate: number | null | undefined): string | undefined {
  if (rate === null || rate === undefined) return undefined;
  const normalized = Math.max(0, Math.min(1, rate));
  return `rgba(35, 75, 125, ${0.08 + (1 - normalized) * 0.38})`;
}

function selectLabel(concept: CoverageConcept, year: number, cell: CoverageCell | undefined): string {
  const status = cellStateLabel(cell);
  const counts = cellCounts(cell);
  const value = cellValue(cell);
  return cellUnavailable(cell)
    ? `${concept.label}, ${year}: ${value}. ${status}. ${counts}.`
    : `${concept.label}, ${year}: ${value} linked-code coverage. ${status}. ${counts}. Open papers without a linked-code record.`;
}

function CoverageCellButton({
  concept,
  year,
  cell,
  onSelectCell,
}: {
  concept: CoverageConcept;
  year: number;
  cell: CoverageCell | undefined;
  onSelectCell: CoverageHeatmapProps['onSelectCell'];
}) {
  const rate = cell?.code_rate;
  const unavailable = cellUnavailable(cell);
  return (
    <button
      type="button"
      className={`ws-coverage-cell${unavailable ? ' ws-coverage-cell--missing' : ''}`}
      style={{ backgroundColor: rateColor(unavailable ? null : rate) }}
      aria-label={selectLabel(concept, year, cell)}
      disabled={unavailable}
      onClick={() => cell && onSelectCell({ ...cell, concept_id: concept.id, concept_label: concept.label })}
    >
      <span>{cellValue(cell)}</span>
      <span className="ws-coverage-counts">{cellCounts(cell)}</span>
      <span className="ws-coverage-cell-state">{cellStateLabel(cell)}</span>
    </button>
  );
}

export function CoverageHeatmap({ years, selectedYear, concepts, onSelectCell }: CoverageHeatmapProps) {
  const orderedYears = [...years].sort((a, b) => a - b);

  return (
    <>
      <p className="ws-coverage-scroll-hint" id="ws-coverage-scroll-hint">
        Each value is the share of papers with a code link in the archive. Select a cell to inspect papers without a linked-code record.
      </p>
      <div className="ws-coverage-legend" role="group" aria-label="Heatmap key">
        <span>Lower recorded link rate</span><span className="ws-coverage-gradient" aria-hidden="true" /><span>Higher recorded link rate</span>
      </div>
      <div
        className="ws-coverage-table-scroll"
        role="region"
        aria-label="Concept by year code coverage heatmap"
        aria-describedby="ws-coverage-scroll-hint"
        tabIndex={0}
      >
        <table className="ws-coverage-table">
          <caption>Recorded paper-to-code link rate by concept and year. A missing value means no rate was supplied.</caption>
          <thead>
            <tr>
              <th scope="col">Concept</th>
              {orderedYears.map((year) => (
                <th scope="col" key={year}>
                  {fmtYear(year)}{year === selectedYear ? <span className="ws-sr-only">, focus year</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr key={concept.id}>
                <th scope="row">{concept.label}</th>
                {orderedYears.map((year) => {
                  const cell = cellFor(concept, year);
                  return (
                    <td key={year} className={year === selectedYear ? 'ws-coverage-current-year' : undefined}>
                      <CoverageCellButton concept={concept} year={year} cell={cell} onSelectCell={onSelectCell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ws-coverage-mobile">
        {concepts.map((concept) => (
          <details className="ws-coverage-concept" key={concept.id}>
            <summary>
              <span>{concept.label}</span>
              <span>{cellValue(cellFor(concept, selectedYear))} for {fmtYear(selectedYear)}</span>
            </summary>
            <ul>
              {orderedYears.map((year) => {
                const cell = cellFor(concept, year);
                return (
                  <li key={year} className={year === selectedYear ? 'ws-coverage-current-year' : undefined}>
                    <span>{fmtYear(year)}</span>
                    <CoverageCellButton concept={concept} year={year} cell={cell} onSelectCell={onSelectCell} />
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
