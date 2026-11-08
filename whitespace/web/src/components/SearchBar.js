import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import "./explore.css";
export function SearchBar({ onSearch, onResults, onSelectConcept }) {
    const [query, setQuery] = useState("");
    const [results, setSearchResults] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    async function submit(event) {
        event.preventDefault();
        const value = query.trim();
        if (!value || busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const response = await onSearch(value);
            setSearchResults(response);
            onResults(response);
        }
        catch {
            setError("Search is unavailable. Try again in a moment.");
            setSearchResults(null);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "whitespace-search", children: [_jsxs("form", { className: "whitespace-search__form", onSubmit: submit, role: "search", children: [_jsx("label", { htmlFor: "whitespace-search-input", children: "Find a paper or concept" }), _jsxs("div", { className: "whitespace-search__controls", children: [_jsx("input", { id: "whitespace-search-input", type: "search", value: query, onChange: (event) => setQuery(event.currentTarget.value), placeholder: "Try a research topic or paper title", autoComplete: "off" }), _jsx("button", { type: "submit", disabled: busy || !query.trim(), children: busy ? "Searching…" : "Search" })] })] }), _jsxs("div", { className: "whitespace-search__results", "aria-live": "polite", "aria-busy": busy, children: [error && _jsx("p", { className: "whitespace-search__error", role: "alert", children: error }), results && results.concepts.length === 0 && results.papers.length === 0 && (_jsx("p", { className: "whitespace-search__message", children: "No matching papers or concepts were returned." })), results && results.concepts.length > 0 && (_jsxs("div", { children: [_jsx("h3", { children: "Concepts" }), _jsx("ul", { className: "whitespace-search__list", children: results.concepts.map((concept) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => onSelectConcept(concept.id), children: concept.label }) }, concept.id))) })] })), results && results.papers.length > 0 && (_jsxs("div", { children: [_jsx("h3", { children: "Papers" }), _jsx("ul", { className: "whitespace-search__list", children: results.papers.map((paper) => (_jsx("li", { children: _jsxs("a", { href: paper.url, target: "_blank", rel: "noreferrer", children: [paper.title, " ", _jsxs("span", { children: ["(", paper.year, ")"] })] }) }, paper.id))) })] }))] })] }));
}
