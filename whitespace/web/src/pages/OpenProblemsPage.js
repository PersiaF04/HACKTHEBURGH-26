import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import './whitespace-pages.css';
const typeLabels = {
    future_work: 'Future work',
    limitation: 'Limitation',
    open_problem: 'Open problem',
};
const chartWidth = 720;
const chartHeight = 220;
const chartPadding = { top: 18, right: 16, bottom: 34, left: 48 };
function formatRate(value) {
    if (value === null || !Number.isFinite(value))
        return 'Not available';
    return `${(value * 100).toFixed(1)}%`;
}
function RateTrend({ points, conceptLabel }) {
    const usable = points.filter((point) => Number.isFinite(point.year));
    const values = usable.flatMap((point) => [point.concept_rate, point.ai_ml_rate])
        .filter((value) => value !== null && Number.isFinite(value));
    if (usable.length === 0 || values.length === 0) {
        return _jsx("p", { className: "ws-state", children: "No rate-over-time data is available for this selection." });
    }
    const minYear = Math.min(...usable.map((point) => point.year));
    const maxYear = Math.max(...usable.map((point) => point.year));
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;
    const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
    const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
    const x = (year) => chartPadding.left + (maxYear === minYear ? innerWidth / 2 : ((year - minYear) / (maxYear - minYear)) * innerWidth);
    const y = (rate) => chartPadding.top + innerHeight - ((rate - minValue) / valueRange) * innerHeight;
    const series = [
        { key: 'concept_rate', label: conceptLabel, className: 'ws-rate-line--concept' },
        { key: 'ai_ml_rate', label: 'All concepts in this AI/ML scope', className: 'ws-rate-line--scope' },
    ];
    return (_jsxs("div", { className: "ws-rate-trend", children: [_jsxs("svg", { className: "ws-rate-chart", viewBox: `0 0 ${chartWidth} ${chartHeight}`, role: "img", "aria-label": "Stated open-problem rate by year for the selected concept and the full AI/ML scope", children: [_jsx("line", { x1: chartPadding.left, y1: chartPadding.top, x2: chartPadding.left, y2: chartHeight - chartPadding.bottom, className: "ws-rate-axis" }), _jsx("line", { x1: chartPadding.left, y1: chartHeight - chartPadding.bottom, x2: chartWidth - chartPadding.right, y2: chartHeight - chartPadding.bottom, className: "ws-rate-axis" }), _jsx("text", { x: chartPadding.left - 8, y: chartPadding.top + 4, textAnchor: "end", className: "ws-rate-label", children: formatRate(maxValue) }), _jsx("text", { x: chartPadding.left - 8, y: chartHeight - chartPadding.bottom + 4, textAnchor: "end", className: "ws-rate-label", children: formatRate(minValue) }), _jsx("text", { x: chartPadding.left, y: chartHeight - 8, textAnchor: "start", className: "ws-rate-label", children: minYear }), _jsx("text", { x: chartWidth - chartPadding.right, y: chartHeight - 8, textAnchor: "end", className: "ws-rate-label", children: maxYear }), series.map((item) => {
                        const valid = usable.filter((point) => point[item.key] !== null && Number.isFinite(point[item.key]));
                        return (_jsxs("g", { className: item.className, children: [valid.length > 1 && _jsx("polyline", { points: valid.map((point) => `${x(point.year)},${y(point[item.key])}`).join(' ') }), valid.map((point) => _jsx("circle", { cx: x(point.year), cy: y(point[item.key]), r: "4" }, point.year))] }, item.key));
                    })] }), _jsx("ul", { className: "ws-rate-legend", "aria-hidden": "true", children: series.map((item) => _jsxs("li", { children: [_jsx("span", { className: `ws-rate-swatch ${item.className}` }), item.label] }, item.key)) }), _jsxs("details", { className: "ws-rate-data", children: [_jsx("summary", { children: "View rate values" }), _jsx("div", { className: "ws-table-wrap", children: _jsxs("table", { children: [_jsx("caption", { children: "Share of papers with a stated open problem by publication year" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Year" }), _jsx("th", { scope: "col", children: conceptLabel }), _jsx("th", { scope: "col", children: "All concepts in this AI/ML scope" })] }) }), _jsx("tbody", { children: usable.map((point) => _jsxs("tr", { children: [_jsx("th", { scope: "row", children: point.year }), _jsx("td", { children: formatRate(point.concept_rate) }), _jsx("td", { children: formatRate(point.ai_ml_rate) })] }, point.year)) })] }) })] })] }));
}
function titleCase(value) {
    return typeLabels[value] ?? value.split('_').join(' ');
}
export function OpenProblemsPage({ selectedConcept, onConceptChange, selectedType, onTypeChange, response, status, errorMessage, onRetry, }) {
    const conceptOptions = response?.concept_options ?? [];
    const items = response?.items ?? [];
    const placeholder = response?.placeholder ?? false;
    const selectedLabel = conceptOptions.find((concept) => concept.id === selectedConcept)?.label ?? 'Selected concept';
    const changeConcept = (event) => onConceptChange(event.currentTarget.value);
    const changeType = (event) => onTypeChange(event.currentTarget.value);
    return (_jsxs("section", { className: "ws-page ws-open-problems", "aria-label": "Open problems", children: [_jsx("header", { className: "ws-page__header", children: _jsx("p", { className: "ws-lede", children: "Questions and limitations stated by authors, linked to the papers where they appear." }) }), _jsxs("section", { className: "ws-filters", "aria-label": "Filter open problems", children: [_jsxs("label", { children: [_jsx("span", { children: "Concept" }), _jsxs("select", { value: selectedConcept, onChange: changeConcept, children: [_jsx("option", { value: "", children: "All concepts" }), conceptOptions.map((concept) => _jsx("option", { value: concept.id, children: concept.label }, concept.id))] })] }), _jsxs("label", { children: [_jsx("span", { children: "Statement type" }), _jsxs("select", { value: selectedType, onChange: changeType, children: [_jsx("option", { value: "all", children: "All types" }), _jsx("option", { value: "future_work", children: "Future work" }), _jsx("option", { value: "limitation", children: "Limitations" }), _jsx("option", { value: "open_problem", children: "Open problems" })] })] })] }), _jsxs("section", { className: "ws-rate-section", "aria-labelledby": "ws-rate-heading", children: [_jsxs("div", { children: [_jsx("h2", { id: "ws-rate-heading", children: "Stated open problems over time" }), _jsx("p", { children: "Compare the share of papers for this concept with all concepts in the AI/ML scope. Missing values are not treated as zero." })] }), status === 'loading' && _jsx("p", { className: "ws-state", role: "status", children: "Loading rate history\u2026" }), status === 'error' && _jsx("p", { className: "ws-state", children: "Rate history is unavailable while the statements request has failed." }), status === 'ready' && response && _jsx(RateTrend, { points: response.rates_by_year ?? [], conceptLabel: selectedConcept ? selectedLabel : 'All selected concepts' })] }), status === 'loading' && _jsx("p", { className: "ws-state", role: "status", children: "Loading statements\u2026" }), status === 'error' && (_jsxs("div", { className: "ws-state ws-state--error", role: "alert", children: [_jsx("p", { children: errorMessage || 'Statements could not be loaded.' }), onRetry && _jsx("button", { type: "button", onClick: onRetry, children: "Try again" })] })), (status === 'empty' || (status === 'ready' && items.length === 0)) && (_jsx("p", { className: "ws-state", role: "status", children: placeholder
                    ? 'The placeholder response contains no example statements. No research result is being shown.'
                    : 'No matching statements for these filters.' })), status === 'ready' && items.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("p", { className: "ws-result-count", "aria-live": "polite", children: [items.length, " ", items.length === 1 ? 'statement' : 'statements'] }), _jsx("ul", { className: "ws-problem-list", children: items.map((item, index) => (_jsxs("li", { className: "ws-problem-card", children: [_jsxs("div", { className: "ws-problem-card__meta", children: [_jsx("span", { className: "ws-tag", children: titleCase(item.type) }), _jsx("span", { children: item.paper.year })] }), _jsx("blockquote", { children: item.sentence }), _jsxs("p", { className: "ws-source", children: ["Source: ", _jsxs("a", { href: item.paper.url, target: "_blank", rel: "noreferrer", children: [item.paper.title, " ", _jsx("span", { className: "ws-sr-only", children: "(opens in a new tab)" })] })] }), item.paper.abstract_excerpt && _jsx("p", { className: "ws-source-excerpt", children: item.paper.abstract_excerpt })] }, `${item.paper.id}-${index}`))) })] }))] }));
}
