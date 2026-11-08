import { useCallback, useEffect, useState } from "react";
import { api, MOCK_META, MOCK_NOTICE } from "./api";
import type { BacktestResponse, CoverageResponse, GapDetailResponse, GapListResponse, MapResponse, MetaResponse, OpenProblemResponse, SearchResponse } from "./api";
import { Explore } from "./pages/Explore";
import { GapsPage } from "./pages/Gaps";
import { OpenProblemsPage } from "./pages/OpenProblemsPage";
import EvidencePage from "./pages/Evidence";
import { CoveragePage } from "./pages/CoveragePage";
import { useWhitespaceStore } from "./store/useWhitespaceStore";
import { PaperLink } from "./components/PaperLink";

const sections = [
  ["/", "Explore"],
  ["/gaps", "Gap finder"],
  ["/open-problems", "Open problems"],
  ["/evidence", "Evidence"],
  ["/coverage", "Code coverage"],
] as const;

function currentPath() {
  return window.location.pathname;
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [retry, setRetry] = useState(0);
  const [problemConcept, setProblemConcept] = useState("");
  const [problemType, setProblemType] = useState<"all" | "future_work" | "limitation" | "open_problem">("all");
  const [selectedCoverageCell, setSelectedCoverageCell] = useState<{ conceptId: string; year: number } | null>(null);
  const year = useWhitespaceStore((state) => state.year);
  const selectedConcepts = useWhitespaceStore((state) => state.selectedConcepts);
  const setYear = useWhitespaceStore((state) => state.setYear);
  const selectConcept = useWhitespaceStore((state) => state.selectConcept);
  const [meta, setMeta] = useState<MetaResponse>(MOCK_META);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [gaps, setGaps] = useState<GapListResponse | null>(null);
  const [openProblems, setOpenProblems] = useState<OpenProblemResponse | null>(null);
  const [backtest, setBacktest] = useState<BacktestResponse | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState<string>();
  const active = sections.find(([route]) => route === path) ?? sections[0];

  const navigate = useCallback((event: React.MouseEvent<HTMLAnchorElement>, route: string) => {
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
    api.meta().then((value) => { if (current) setMeta(value); }).catch(() => undefined);
    setStatus("loading");
    setError(undefined);
    const load = async () => {
      try {
        if (path === "/") {
          const value = await api.map(year);
          if (current) setMap(value);
        } else if (path === "/gaps") {
          const value = await api.gaps({ limit: 50 });
          if (current) setGaps(value);
        } else if (path === "/open-problems") {
          const value = await api.openProblems(problemConcept, problemType === "all" ? "" : problemType);
          if (current) setOpenProblems(value);
        } else if (path === "/evidence") {
          const value = await api.backtest();
          if (current) setBacktest(value);
        } else if (path === "/coverage") {
          const value = await api.coverage(year);
          if (current) setCoverage(value);
        }
        if (current) setStatus("ready");
      } catch (reason) {
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
  // Only once this year's request has resolved: a stale response from the previous year must
  // not read as "no data" while the new file loads.
  const noDataForYear = status === "ready" && (
    (path === "/" && map?.no_data === true && map.year === year)
    || (path === "/coverage" && coverage?.no_data === true && coverage.year === year));

  // Start inside the exported years: the corpus may end before the default year.
  useEffect(() => {
    const range = meta.year_range;
    if (range && (year < range.min || year > range.max)) setYear(range.max);
  }, [meta.year_range]); // only when the data's year range changes, not on every year change
  const retryPage = () => setRetry((value) => value + 1);
  const loadGap = useCallback((gap: GapListResponse["items"][number]): Promise<GapDetailResponse> => api.gap(gap.a, gap.b), []);
  const search = useCallback((query: string): Promise<SearchResponse> => api.search(query), []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => navigate(event, "/")} aria-label="Whitespace home">
          <span className="brand-mark" aria-hidden="true">W</span><span>Whitespace</span>
        </a>
        <p className="topbar-note">Research directions, with evidence</p>
      </header>
      <div className="workspace">
        <nav className="side-nav" aria-label="Main navigation">
          {sections.map(([route, label]) => (
            <a key={route} href={route} aria-current={path === route ? "page" : undefined} onClick={(event) => navigate(event, route)}>{label}</a>
          ))}
        </nav>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">AI research landscape{meta.placeholder ? " - placeholder data" : meta.year_range?.min && meta.year_range?.max ? ` - ${meta.year_range.min} to ${meta.year_range.max}` : ""}</p>
              <h1>{active[1]}</h1>
              {meta.titles_available === false && meta.titles_note && <p className="topbar-note">Note: {meta.titles_note}.</p>}
            </div>
            <span className="offline-pill">Offline demo</span>
          </div>
          {isPlaceholder && <div className="placeholder-banner" role="status"><strong>Placeholder data</strong><span>{MOCK_NOTICE}</span></div>}
          {noDataForYear && <p className="placeholder-banner" role="status"><strong>No data for {year}</strong><span>{meta.year_range ? `The exported data covers ${meta.year_range.min} to ${meta.year_range.max}. Later years are absent, not zero.` : "No file was exported for this year."}</span></p>}
          {path === "/" && map && <Explore map={map} selectedYear={year} loading={status === "loading"} yearRange={yearRange} selectedConceptId={selectedConceptId} onYearChange={setYear} onSelectConcept={selectConcept} onSearch={search} />}
          {path === "/" && status === "loading" && !map && <p role="status">Loading research map…</p>}
          {path === "/gaps" && status === "loading" && !gaps && <p role="status">Loading gap finder…</p>}
          {path === "/gaps" && gaps && <GapsPage response={gaps} loadDetail={loadGap} loading={status === "loading"} error={status === "error" ? error : null} />}
          {path === "/open-problems" && <OpenProblemsPage response={openProblems} selectedConcept={problemConcept} onConceptChange={setProblemConcept} selectedType={problemType} onTypeChange={setProblemType} status={status} errorMessage={error} onRetry={retryPage} />}
          {path === "/evidence" && <EvidencePage response={backtest} status={status} errorMessage={error} />}
          {path === "/coverage" && <>
            <CoveragePage response={coverage} selectedYear={year} onYearChange={setYear} onSelectCell={(cell) => {
              setSelectedCoverageCell({ conceptId: cell.concept_id, year: cell.year });
            }} status={status} errorMessage={error} onRetry={retryPage} />
            {selectedCoverageCell && (() => {
              const concept = coverage?.concepts.find((item) => item.id === selectedCoverageCell.conceptId);
              const cell = concept?.cells.find((item) => item.year === selectedCoverageCell.year);
              return <section className="coverage-selection" aria-live="polite" aria-labelledby="coverage-selection-title">
                <h2 id="coverage-selection-title">Papers without a linked code record</h2>
                <p>{concept?.label || "Selected concept"} - {selectedCoverageCell.year}. A missing archive link does not mean an implementation does not exist.</p>
                {cell?.papers_without_linked_code?.length ? <ul>{cell.papers_without_linked_code.map((paper) => <li key={paper.id}><PaperLink paper={paper} /></li>)}</ul> : <p>No paper examples were supplied for this cell.</p>}
              </section>;
            })()}
          </>}
            {status === "error" && <p className="app-error" role="alert">{error}</p>}
        </main>
      </div>
    </div>
  );
}
