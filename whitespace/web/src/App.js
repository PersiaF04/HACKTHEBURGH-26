import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { api, MOCK_META, MOCK_NOTICE } from "./api";
import { Explore } from "./pages/Explore";
import { GapsPage } from "./pages/Gaps";
import { OpenProblemsPage } from "./pages/OpenProblemsPage";
import EvidencePage from "./pages/Evidence";
import { CoveragePage } from "./pages/CoveragePage";
import { useWhitespaceStore } from "./store/useWhitespaceStore";
const sections = [
    ["/", "Explore"],
    ["/gaps", "Gap finder"],
    ["/open-problems", "Open problems"],
    ["/evidence", "Evidence"],
    ["/coverage", "Code coverage"],
];
function currentPath() {
    return window.location.pathname;
}
export default function App() {
    const [path, setPath] = useState(currentPath);
    const [retry, setRetry] = useState(0);
    const [problemConcept, setProblemConcept] = useState("");
    const [problemType, setProblemType] = useState("all");
    const [selectedCoverageCell, setSelectedCoverageCell] = useState(null);
    const year = useWhitespaceStore((state) => state.year);
    const selectedConcepts = useWhitespaceStore((state) => state.selectedConcepts);
    const setYear = useWhitespaceStore((state) => state.setYear);
    const selectConcept = useWhitespaceStore((state) => state.selectConcept);
    const [meta, setMeta] = useState(MOCK_META);
    const [map, setMap] = useState(null);
    const [gaps, setGaps] = useState(null);
    const [openProblems, setOpenProblems] = useState(null);
    const [backtest, setBacktest] = useState(null);
    const [coverage, setCoverage] = useState(null);
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState();
    const active = sections.find(([route]) => route === path) ?? sections[0];
    useEffect(() => { document.title = `${active[1]} · Whitespace`; }, [active]);
    const navigate = useCallback((event, route) => {
        event.preventDefault();
        window.history.pushState({}, "", route);
        setPath(route);
    }, []);
    useEffect(() => {
        const handlePopState = () => setPath(currentPath());
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);
    useEffect(() => {
        let current = true;
        api.meta().then((value) => { if (current)
            setMeta(value); }).catch(() => undefined);
        setStatus("loading");
        setError(undefined);
        const load = async () => {
            try {
                if (path === "/") {
                    const value = await api.map(year);
                    if (current)
                        setMap(value);
                }
                else if (path === "/gaps") {
                    const value = await api.gaps({ limit: 50 });
                    if (current)
                        setGaps(value);
                }
                else if (path === "/open-problems") {
                    const value = await api.openProblems(problemConcept, problemType === "all" ? "" : problemType);
                    if (current)
                        setOpenProblems(value);
                }
                else if (path === "/evidence") {
                    const value = await api.backtest();
                    if (current)
                        setBacktest(value);
                }
                else if (path === "/coverage") {
                    const value = await api.coverage(year);
                    if (current)
                        setCoverage(value);
                }
                if (current)
                    setStatus("ready");
            }
            catch (reason) {
                if (current) {
                    setStatus("error");
                    setError(reason instanceof Error ? reason.message : "The local research data could not be loaded.");
                }
            }
        };
        void load();
        return () => { current = false; };
    }, [path, year, retry, problemConcept, problemType]);
    const selectedConceptId = selectedConcepts[0] ?? null;
    const isPlaceholder = path === "/" ? map?.placeholder ?? true
        : path === "/gaps" ? gaps?.placeholder ?? true
            : path === "/open-problems" ? openProblems?.placeholder ?? true
                : path === "/coverage" ? coverage?.placeholder ?? true
                    : backtest?.placeholder ?? true;
    const yearRange = meta.year_range ?? { min: 2015, max: 2026 };
    const noDataForYear = (path === "/" && map?.no_data) || (path === "/coverage" && coverage?.no_data);
    // Start inside the exported years: the corpus may end before the default year.
    useEffect(() => {
        const range = meta.year_range;
        if (range && (year < range.min || year > range.max))
            setYear(range.max);
    }, [meta.year_range]); // only when the data's year range changes, not on every year change
    const retryPage = () => setRetry((value) => value + 1);
    const loadGap = useCallback((gap) => api.gap(gap.a, gap.b), []);
    const search = useCallback((query) => api.search(query), []);
    return (_jsxs("div", { className: "app-shell", children: [_jsx("a", { className: "skip-link", href: "#main-content", children: "Skip to content" }), _jsxs("header", { className: "topbar", children: [_jsxs("a", { className: "brand", href: "/", onClick: (event) => navigate(event, "/"), "aria-label": "Whitespace home", children: [_jsx("span", { className: "brand-mark", "aria-hidden": "true" }), _jsx("span", { children: "Whitespace" })] }), _jsx("nav", { className: "view-tabs", "aria-label": "Main navigation", children: sections.map(([route, label]) => (_jsx("a", { href: route, "aria-current": path === route ? "page" : undefined, onClick: (event) => navigate(event, route), children: label }, route))) }), _jsx("span", { className: isPlaceholder ? "data-badge data-badge--placeholder" : "data-badge", children: isPlaceholder ? "Placeholder data, not results" : `OpenAlex · AI subfield 1702${meta.year_range ? ` · ${meta.year_range.min}–${meta.year_range.max}` : ""}` })] }), _jsx("div", { className: "workspace", children: _jsxs("main", { id: "main-content", className: "main-content", children: [_jsx("div", { className: "page-heading", children: _jsx("h1", { children: active[1] }) }), isPlaceholder && _jsxs("div", { className: "placeholder-banner", role: "status", children: [_jsx("strong", { children: "Placeholder data" }), _jsx("span", { children: MOCK_NOTICE })] }), noDataForYear && _jsxs("p", { className: "placeholder-banner", role: "status", children: [_jsxs("strong", { children: ["No data for ", year] }), _jsx("span", { children: meta.year_range ? `The exported data covers ${meta.year_range.min} to ${meta.year_range.max}. Later years are absent, not zero.` : "No file was exported for this year." })] }), path === "/" && map && _jsx(Explore, { map: map, selectedYear: year, loading: status === "loading", yearRange: yearRange, selectedConceptId: selectedConceptId, onYearChange: setYear, onSelectConcept: selectConcept, onSearch: search }), path === "/" && status === "loading" && !map && _jsx("p", { role: "status", children: "Loading research map\u2026" }), path === "/gaps" && status === "loading" && !gaps && _jsx("p", { role: "status", children: "Loading gap finder\u2026" }), path === "/gaps" && gaps && _jsx(GapsPage, { response: gaps, loadDetail: loadGap, loading: status === "loading", error: status === "error" ? error : null }), path === "/open-problems" && _jsx(OpenProblemsPage, { response: openProblems, selectedConcept: problemConcept, onConceptChange: setProblemConcept, selectedType: problemType, onTypeChange: setProblemType, status: status, errorMessage: error, onRetry: retryPage }), path === "/evidence" && _jsx(EvidencePage, { response: backtest, status: status, errorMessage: error }), path === "/coverage" && _jsxs(_Fragment, { children: [_jsx(CoveragePage, { response: coverage, selectedYear: year, onYearChange: setYear, onSelectCell: (cell) => {
                                        setSelectedCoverageCell({ conceptId: cell.concept_id, year: cell.year });
                                    }, status: status, errorMessage: error, onRetry: retryPage }), selectedCoverageCell && (() => {
                                    const concept = coverage?.concepts.find((item) => item.id === selectedCoverageCell.conceptId);
                                    const cell = concept?.cells.find((item) => item.year === selectedCoverageCell.year);
                                    return _jsxs("section", { className: "coverage-selection", "aria-live": "polite", "aria-labelledby": "coverage-selection-title", children: [_jsx("h2", { id: "coverage-selection-title", children: "Papers without a linked code record" }), _jsxs("p", { children: [concept?.label || "Selected concept", " - ", selectedCoverageCell.year, ". A missing archive link does not mean an implementation does not exist."] }), cell?.papers_without_linked_code?.length ? _jsx("ul", { children: cell.papers_without_linked_code.map((paper) => _jsx("li", { children: _jsxs("a", { href: paper.url, target: "_blank", rel: "noreferrer", children: [paper.title, " (", paper.year, ")"] }) }, paper.id)) }) : _jsx("p", { children: "No paper examples were supplied for this cell." })] });
                                })()] }), status === "error" && _jsx("p", { className: "app-error", role: "alert", children: error })] }) })] }));
}
