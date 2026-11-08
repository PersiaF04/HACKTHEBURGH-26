import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "./gaps.css";
const columns = [
    { key: "p_link", label: "P(link)", description: "Modelled probability the pair links within three years" },
    { key: "momentum", label: "Momentum", description: "Recent growth signal in the model" },
    { key: "novelty", label: "Novelty", description: "Novelty component returned by the model" },
    { key: "gap_rate", label: "Stated-gap rate", description: "Share of papers with a stated open problem" },
    { key: "gap_score", label: "Gap score", description: "Combined ranking score; this is not a probability" },
];
function formatValue(value, key) {
    if (value == null || !Number.isFinite(value))
        return "Not available";
    if (key === "p_link" || key === "gap_rate")
        return `${(value * 100).toFixed(1)}%`;
    return value.toFixed(3);
}
function gapId(gap) {
    return `${gap.a}::${gap.b}`;
}
export function GapTable({ items, selectedId, sort, sortDirection = "desc", loading = false, error, placeholder = false, onSort, onSelect, }) {
    if (loading)
        return _jsx("p", { className: "gap-state", role: "status", children: "Loading ranked gaps\u2026" });
    if (error)
        return _jsxs("p", { className: "gap-state gap-state--error", role: "alert", children: ["Could not load gaps: ", error] });
    if (items.length === 0) {
        return _jsx("p", { className: "gap-state", children: placeholder ? "No gap results are included in these placeholder fixtures." : "No gaps match these filters." });
    }
    return (_jsxs("div", { className: "gap-table-wrap", children: [placeholder && _jsx("p", { className: "gap-placeholder", role: "note", children: "Placeholder data \u2014 these values are examples, not measured results." }), _jsxs("table", { className: "gap-table", children: [_jsx("caption", { className: "visually-hidden", children: "Ranked concept pairs and model score components" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Concept pair" }), columns.map(({ key, label, description }) => (_jsx("th", { scope: "col", "aria-sort": sort === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none", children: _jsxs("button", { className: "gap-sort", type: "button", onClick: () => onSort?.(key), "aria-label": `Sort by ${label}${key === "gap_score" ? "; this is not a probability" : ""}`, title: description, children: [label, sort === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""] }) }, key)))] }) }), _jsx("tbody", { children: items.slice(0, 50).map((gap) => {
                            const id = gapId(gap);
                            return (_jsxs("tr", { className: selectedId === id ? "is-selected" : undefined, children: [_jsx("th", { scope: "row", children: _jsxs("button", { className: "gap-pair", type: "button", onClick: () => onSelect(gap), "aria-label": `Open gap: ${gap.a_label} and ${gap.b_label}`, children: [_jsx("span", { children: gap.a_label }), _jsx("span", { className: "gap-pair__join", "aria-hidden": "true", children: "\u2194" }), _jsx("span", { children: gap.b_label })] }) }), columns.map(({ key }) => (_jsxs("td", { className: key === "gap_score" ? "gap-score-cell" : undefined, children: [formatValue(gap[key], key), key === "gap_score" && _jsx("span", { className: "visually-hidden", children: ", ranking score, not a probability" })] }, key)))] }, id));
                        }) })] }), _jsx("p", { className: "gap-table-note", children: "P(link) is a model probability. Gap score is a separate ranking score." })] }));
}
