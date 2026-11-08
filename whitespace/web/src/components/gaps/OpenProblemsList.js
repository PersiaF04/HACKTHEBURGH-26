import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { safeExternalUrl } from "./GapDrawer";
import "./gaps-drawer.css";
const typeLabels = {
    future_work: "Future work",
    limitation: "Limitation",
    open_problem: "Open problem",
};
const W = 560, H = 200, L = 40, R = 12, T = 10, B = 26;
function RateChart({ rates, conceptLabel }) {
    const pts = [...rates].sort((a, b) => a.year - b.year);
    const vals = pts.flatMap((p) => [p.concept_rate, p.ai_ml_rate]).filter((v) => v != null && Number.isFinite(v));
    const pct = (v) => (v == null || !Number.isFinite(v) ? "not available" : `${(v * 100).toFixed(1)}%`);
    if (pts.length === 0 || vals.length === 0) {
        return _jsx("p", { className: "open-problems__empty", children: "Rate over time: not available." });
    }
    const max = Math.max(...vals) || 1;
    const y0 = pts[0].year, y1 = pts[pts.length - 1].year;
    const x = (yr) => L + (y1 === y0 ? (W - L - R) / 2 : ((yr - y0) / (y1 - y0)) * (W - L - R));
    const y = (v) => T + (1 - v / max) * (H - T - B);
    // Break the line where data is missing rather than interpolating.
    const path = (key) => {
        let d = "", pen = false;
        for (const p of pts) {
            const v = p[key];
            if (v == null || !Number.isFinite(v)) {
                pen = false;
                continue;
            }
            d += `${pen ? "L" : "M"}${x(p.year).toFixed(1)} ${y(v).toFixed(1)} `;
            pen = true;
        }
        return d.trim();
    };
    const dots = (key, fill) => pts.map((p) => {
        const v = p[key];
        return v == null || !Number.isFinite(v) ? null : _jsx("circle", { cx: x(p.year), cy: y(v), r: 2.5, fill: fill }, `${key}-${p.year}`);
    });
    const desc = `Share of papers stating an open problem, by year, ${y0} to ${y1}. Maximum ${(max * 100).toFixed(1)} percent. Full values are in the table below.`;
    return (_jsxs("section", { className: "open-problems__chart", "aria-labelledby": "op-rate-title", children: [_jsx("h3", { id: "op-rate-title", children: "How often authors state an open problem, by year" }), _jsxs("div", { className: "open-problems__legend", children: [_jsxs("span", { children: [_jsx("i", {}), conceptLabel] }), _jsxs("span", { children: [_jsx("i", { className: "is-baseline" }), "All AI/ML"] })] }), _jsxs("svg", { className: "open-problems__svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "op-rate-svg-title op-rate-svg-desc", children: [_jsx("title", { id: "op-rate-svg-title", children: "Open-problem rate over time" }), _jsx("desc", { id: "op-rate-svg-desc", children: desc }), _jsx("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: "var(--ws-border-strong)" }), _jsx("line", { x1: L, x2: L, y1: T, y2: H - B, stroke: "var(--ws-border-strong)" }), _jsxs("text", { x: L - 6, y: T + 4, textAnchor: "end", children: [(max * 100).toFixed(0), "%"] }), _jsx("text", { x: L - 6, y: H - B, textAnchor: "end", children: "0%" }), _jsx("text", { x: L, y: H - 8, textAnchor: "start", children: y0 }), _jsx("text", { x: W - R, y: H - 8, textAnchor: "end", children: y1 }), _jsx("path", { d: path("ai_ml_rate"), fill: "none", stroke: "var(--ws-muted)", strokeWidth: 2, strokeDasharray: "5 3" }), _jsx("path", { d: path("concept_rate"), fill: "none", stroke: "var(--ws-accent)", strokeWidth: 2 }), dots("ai_ml_rate", "var(--ws-muted)"), dots("concept_rate", "var(--ws-accent)")] }), _jsxs("details", { className: "open-problems__table", children: [_jsx("summary", { children: "Show as table" }), _jsxs("table", { children: [_jsx("caption", { className: "gap-sr-only", children: "Open-problem rate by year" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Year" }), _jsx("th", { scope: "col", children: conceptLabel }), _jsx("th", { scope: "col", children: "All AI/ML" })] }) }), _jsx("tbody", { children: pts.map((p) => _jsxs("tr", { children: [_jsx("th", { scope: "row", children: p.year }), _jsx("td", { children: pct(p.concept_rate) }), _jsx("td", { children: pct(p.ai_ml_rate) })] }, p.year)) })] })] })] }));
}
export function OpenProblemsList({ items, rates, conceptLabel }) {
    const label = conceptLabel?.trim() || "";
    return (_jsxs("section", { className: "open-problems", "aria-label": "Open problems", children: [_jsx("p", { className: "open-problems__intro", children: "What authors say is still open. Sentences are quoted from papers and tagged by a classifier." }), items.length === 0 ? (_jsx("p", { className: "open-problems__empty", children: "Not available: no open-problem sentences returned." })) : (_jsx("ul", { className: "open-problems__cards", children: items.map((item) => {
                    const href = safeExternalUrl(item.paper.url);
                    return (_jsxs("li", { className: "open-problems__card", children: [_jsx("blockquote", { children: item.sentence }), _jsxs("p", { className: "open-problems__meta", children: [_jsx("span", { className: "open-problems__tag", children: typeLabels[item.type] ?? item.type }), _jsxs("span", { children: ["Concept: ", label || "not available"] }), _jsxs("span", { children: ["Year: ", item.paper.year ?? "not available"] }), _jsxs("span", { children: ["Confidence: ", item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : "not available"] }), href ? _jsxs("a", { href: href, target: "_blank", rel: "noreferrer", children: ["Source: ", item.paper.title] }) : _jsxs("span", { children: ["Source: ", item.paper.title] })] })] }, `${item.paper.id}-${item.sentence}`));
                }) })), _jsx(RateChart, { rates: rates ?? [], conceptLabel: label || "Selected concept" })] }));
}
