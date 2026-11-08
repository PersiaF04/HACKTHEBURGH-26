import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
function cellFor(concept, year) {
    return concept.cells.find((cell) => cell.year === year);
}
function formatRate(rate) {
    return rate === null || rate === undefined ? 'Not available' : `${(rate * 100).toFixed(1)}%`;
}
function cellStateLabel(cell) {
    if (!cell)
        return 'No coverage cell was supplied';
    switch (cell.state) {
        case 'available': return 'Available';
        case 'thin': return 'Thin archive coverage';
        case 'outside_archive_vintage': return 'Outside archive vintage';
        case 'unavailable': return 'Unavailable';
        default: return 'Coverage state not supplied';
    }
}
function cellValue(cell) {
    if (cell?.state === 'outside_archive_vintage')
        return 'Outside archive vintage';
    if (cell?.state === 'unavailable')
        return 'Unavailable';
    return formatRate(cell?.code_rate);
}
function cellCounts(cell) {
    if (cell?.paper_count === undefined || cell.linked_paper_count === undefined)
        return 'Counts not supplied';
    return `${cell.linked_paper_count} / ${cell.paper_count} papers linked`;
}
function cellUnavailable(cell) {
    return !cell
        || cell.code_rate === null
        || cell.state === 'outside_archive_vintage'
        || cell.state === 'unavailable';
}
function rateColor(rate) {
    if (rate === null || rate === undefined)
        return undefined;
    const normalized = Math.max(0, Math.min(1, rate));
    return `rgba(35, 75, 125, ${0.08 + (1 - normalized) * 0.38})`;
}
function selectLabel(concept, year, cell) {
    const status = cellStateLabel(cell);
    const counts = cellCounts(cell);
    const value = cellValue(cell);
    return cellUnavailable(cell)
        ? `${concept.label}, ${year}: ${value}. ${status}. ${counts}.`
        : `${concept.label}, ${year}: ${value} linked-code coverage. ${status}. ${counts}. Open papers without a linked-code record.`;
}
function CoverageCellButton({ concept, year, cell, onSelectCell, }) {
    const rate = cell?.code_rate;
    const unavailable = cellUnavailable(cell);
    return (_jsxs("button", { type: "button", className: `ws-coverage-cell${unavailable ? ' ws-coverage-cell--missing' : ''}`, style: { backgroundColor: rateColor(unavailable ? null : rate) }, "aria-label": selectLabel(concept, year, cell), disabled: unavailable, onClick: () => cell && onSelectCell({ ...cell, concept_id: concept.id, concept_label: concept.label }), children: [_jsx("span", { children: cellValue(cell) }), _jsx("span", { className: "ws-coverage-counts", children: cellCounts(cell) }), _jsx("span", { className: "ws-coverage-cell-state", children: cellStateLabel(cell) })] }));
}
export function CoverageHeatmap({ years, selectedYear, concepts, onSelectCell }) {
    const orderedYears = [...years].sort((a, b) => a - b);
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "ws-coverage-scroll-hint", id: "ws-coverage-scroll-hint", children: "Each value is the share of papers with a code link in the archive. Select a cell to inspect papers without a linked-code record." }), _jsxs("div", { className: "ws-coverage-legend", role: "group", "aria-label": "Heatmap key", children: [_jsx("span", { children: "Lower recorded link rate" }), _jsx("span", { className: "ws-coverage-gradient", "aria-hidden": "true" }), _jsx("span", { children: "Higher recorded link rate" })] }), _jsx("div", { className: "ws-coverage-table-scroll", role: "region", "aria-label": "Concept by year code coverage heatmap", "aria-describedby": "ws-coverage-scroll-hint", tabIndex: 0, children: _jsxs("table", { className: "ws-coverage-table", children: [_jsx("caption", { children: "Recorded paper-to-code link rate by concept and year. A missing value means no rate was supplied." }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Concept" }), orderedYears.map((year) => (_jsxs("th", { scope: "col", children: [year, year === selectedYear ? _jsx("span", { className: "ws-sr-only", children: ", focus year" }) : null] }, year)))] }) }), _jsx("tbody", { children: concepts.map((concept) => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: concept.label }), orderedYears.map((year) => {
                                        const cell = cellFor(concept, year);
                                        return (_jsx("td", { className: year === selectedYear ? 'ws-coverage-current-year' : undefined, children: _jsx(CoverageCellButton, { concept: concept, year: year, cell: cell, onSelectCell: onSelectCell }) }, year));
                                    })] }, concept.id))) })] }) }), _jsx("div", { className: "ws-coverage-mobile", children: concepts.map((concept) => (_jsxs("details", { className: "ws-coverage-concept", children: [_jsxs("summary", { children: [_jsx("span", { children: concept.label }), _jsxs("span", { children: [cellValue(cellFor(concept, selectedYear)), " for ", selectedYear] })] }), _jsx("ul", { children: orderedYears.map((year) => {
                                const cell = cellFor(concept, year);
                                return (_jsxs("li", { className: year === selectedYear ? 'ws-coverage-current-year' : undefined, children: [_jsx("span", { children: year }), _jsx(CoverageCellButton, { concept: concept, year: year, cell: cell, onSelectCell: onSelectCell })] }, year));
                            }) })] }, concept.id))) })] }));
}
