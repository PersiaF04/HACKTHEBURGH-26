import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { ScoreBreakdown } from "./ScoreBreakdown";
import "./gaps.css";
import "./gaps-drawer.css";
export function safeExternalUrl(url) {
    if (!url)
        return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
    }
    catch {
        return null;
    }
}
const problemTypeLabels = {
    future_work: "Future work",
    limitation: "Limitation",
    open_problem: "Open problem",
};
function linkStatement(summary) {
    const w = summary.starting_weight;
    const shared = w == null ? "Not yet linked: fewer than 3 shared papers." : `Not yet linked: ${w} shared ${w === 1 ? "paper" : "papers"}, fewer than 3.`;
    const p = summary.p_link;
    if (p == null || !Number.isFinite(p))
        return `${shared} P(link) not available.`;
    return `${shared} P(link) is ${(p * 100).toFixed(1)}%, the model chance that they reach 3 or more shared papers within three years.`;
}
function PaperList({ id, title, papers }) {
    return (_jsxs("section", { className: "gap-drawer__section", "aria-labelledby": `${id}-heading`, children: [_jsx("h3", { id: `${id}-heading`, children: title }), papers.length === 0 ? _jsx("p", { children: "Not available: no papers returned for this side." }) : (_jsx("ul", { className: "gap-paper-list", children: papers.map((paper) => (_jsxs("li", { children: [safeExternalUrl(paper.url) ? _jsx("a", { href: safeExternalUrl(paper.url) ?? undefined, target: "_blank", rel: "noreferrer", children: paper.title }) : _jsx("span", { children: paper.title }), paper.year != null && _jsxs("span", { className: "gap-paper-year", children: [" \u00B7 ", paper.year] }), paper.abstract_excerpt && _jsx("p", { children: paper.abstract_excerpt })] }, paper.id))) }))] }));
}
export function GapDrawer({ detail, open, loading = false, error, placeholder = false, onClose }) {
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const priorFocus = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus();
        return () => priorFocus.current?.focus();
    }, [open]);
    if (!open)
        return null;
    function handleKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
        if (event.key !== "Tab" || !dialogRef.current)
            return;
        const focusable = Array.from(dialogRef.current.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) {
            event.preventDefault();
            dialogRef.current.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
    const title = detail ? `${detail.summary.a_label} and ${detail.summary.b_label}` : "Gap details";
    return (_jsx("div", { className: "gap-drawer-backdrop", children: _jsxs("div", { className: "gap-drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": "gap-drawer-title", ref: dialogRef, tabIndex: -1, onKeyDown: handleKeyDown, children: [_jsxs("header", { className: "gap-drawer__header", children: [_jsxs("div", { children: [_jsx("p", { className: "gap-eyebrow", children: "Candidate link" }), _jsx("h2", { id: "gap-drawer-title", children: detail ? _jsxs(_Fragment, { children: [detail.summary.a_label, " ", _jsx("span", { className: "gap-drawer__arrow", "aria-hidden": "true", children: "\u2194" }), _jsx("span", { className: "gap-sr-only", children: " and " }), " ", detail.summary.b_label] }) : title }), detail && _jsx("p", { className: "gap-drawer__link-statement", children: linkStatement(detail.summary) })] }), _jsx("button", { ref: closeRef, className: "gap-drawer__close", type: "button", onClick: onClose, "aria-label": "Close gap details", children: "Close" })] }), placeholder && _jsx("p", { className: "gap-placeholder", role: "note", children: "Placeholder data \u2014 these values are examples, not measured results." }), loading && _jsx("p", { role: "status", children: "Loading gap evidence\u2026" }), error && _jsxs("p", { className: "gap-state--error", role: "alert", children: ["Could not load gap details: ", error] }), !loading && !error && !detail && _jsx("p", { children: "No detail is available for this pair." }), detail && !loading && !error && (_jsxs("div", { className: "gap-drawer__content", children: [_jsx(ScoreBreakdown, { gap: detail.summary }), _jsxs("div", { className: "gap-drawer__papers", children: [_jsx(PaperList, { id: "closest-a", title: `Closest papers: ${detail.summary.a_label}`, papers: detail.closest_a }), _jsx(PaperList, { id: "closest-b", title: `Closest papers: ${detail.summary.b_label}`, papers: detail.closest_b })] }), _jsxs("section", { className: "gap-drawer__section", "aria-labelledby": "shared-neighbours-heading", children: [_jsx("h3", { id: "shared-neighbours-heading", children: "Shared neighbouring concepts" }), detail.shared_neighbours.length === 0 ? _jsx("p", { children: "Not available: no shared neighbouring concepts returned." }) : (_jsx("ul", { className: "gap-neighbours", children: detail.shared_neighbours.map((concept) => _jsx("li", { children: concept.label }, concept.id)) }))] }), _jsxs("section", { className: "gap-drawer__section", "aria-labelledby": "stated-problems-heading", children: [_jsx("h3", { id: "stated-problems-heading", children: "Authors\u2019 stated open problems" }), detail.open_problems.length === 0 ? _jsx("p", { children: "Not available: no linked open-problem statements returned." }) : (_jsx("ul", { className: "gap-problem-list", children: detail.open_problems.map((problem) => (_jsxs("li", { children: [_jsx("blockquote", { children: problem.sentence }), _jsxs("p", { children: [problemTypeLabels[problem.type], problem.confidence != null ? ` · classifier confidence ${(problem.confidence * 100).toFixed(0)}%` : "", " · ", safeExternalUrl(problem.paper.url) ? _jsxs("a", { href: safeExternalUrl(problem.paper.url) ?? undefined, target: "_blank", rel: "noreferrer", children: ["Source: ", problem.paper.title] }) : `Source: ${problem.paper.title}`, problem.paper.year != null ? ` (${problem.paper.year})` : ""] })] }, `${problem.paper.id}-${problem.sentence}`))) }))] })] }))] }) }));
}
