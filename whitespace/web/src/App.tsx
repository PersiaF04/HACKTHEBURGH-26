import { useCallback, useEffect, useState } from "react";
import { api, MOCK_META } from "./api";
import type { GapDetailResponse, GapListResponse, MapResponse, MetaResponse, SearchResponse } from "./api";
import { Explore } from "./pages/Explore";
import { GapsPage } from "./pages/Gaps";
import { useWhitespaceStore } from "./store/useWhitespaceStore";
import { SkeletonBlock, SkeletonText } from "./components/Skeleton";
import { fmtYear } from "./lib/format";
import { ThemeToggle } from "./components/ThemeToggle";
import { DemoToggle, DEMO_BADGE, DEMO_BADGE_TIP, useDemoMode } from "./demo"; // TEMPORARY demo data

const PLACEHOLDER_TIP = "Placeholder data: this build shows fixtures, not results";
const REAL_TIP = "Real export: OpenAlex AI subfield 1702";

function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="page-skeleton" role="status" aria-label={label}>
      <SkeletonBlock height={22} width="min(320px, 60%)" />
      <SkeletonText lines={2} />
      <SkeletonBlock height={220} className="ws-skel--pulse" />
      <p className="ws-empty-note">{label}</p>
    </div>
  );
}

// Evidence and Coverage temporarily unmounted at Varshil's request; restore the two routes and the footer links.
// Their page components, api.ts functions and css are kept. Hidden paths redirect to the matching visible page.
const sections = [
  ["/", "Research map"],
  ["/gaps", "Gaps & open problems"],
] as const;
const navTabs = sections;
const REDIRECTS: Record<string, string> = { "/evidence": "/", "/coverage": "/", "/open-problems": "/gaps" };

function currentPath() {
  const redirect = REDIRECTS[window.location.pathname.replace(/\/+$/, "") || "/"];
  if (redirect) window.history.replaceState({}, "", redirect);
  return redirect ?? (window.location.pathname.replace(/\/+$/, "") || "/");
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [demo] = useDemoMode();
  const year = useWhitespaceStore((state) => state.year);
  const selectedConcepts = useWhitespaceStore((state) => state.selectedConcepts);
  const setYear = useWhitespaceStore((state) => state.setYear);
  const selectConcept = useWhitespaceStore((state) => state.selectConcept);
  const [meta, setMeta] = useState<MetaResponse>(MOCK_META);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [gaps, setGaps] = useState<GapListResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState<string>();
  const active = sections.find(([route]) => route === path) ?? sections[0];

  // Switching demo data on or off drops everything loaded so far; pages remount below via key.
  useEffect(() => {
    setMap(null);
    setGaps(null);
    setMeta(MOCK_META);
    useWhitespaceStore.setState({ selectedConcepts: [], focus: null, openGap: null });
  }, [demo]);

  useEffect(() => { document.title = `${active[1]} · Whitespace`; }, [active]);

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
  }, [path, year, demo]);

  const selectedConceptId = selectedConcepts[0] ?? null;
  const isPlaceholder = path === "/" ? map?.placeholder ?? true : gaps?.placeholder ?? true;

  // Start inside the exported years: the corpus may end before the default year.
  useEffect(() => {
    const range = meta.year_range;
    if (range && (year < range.min || year > range.max)) setYear(range.max);
  }, [meta.year_range]); // only when the data's year range changes, not on every year change
  const loadGap = useCallback((gap: GapListResponse["items"][number]): Promise<GapDetailResponse> => api.gap(gap.a, gap.b), []);
  const search = useCallback((query: string): Promise<SearchResponse> => api.search(query), []);

  const badge = demo ? DEMO_BADGE : isPlaceholder ? "Placeholder data" : `OpenAlex · AI subfield 1702${meta.year_range ? ` · ${fmtYear(meta.year_range.min)}–${fmtYear(meta.year_range.max)}` : ""}`;
  const badgeTip = demo ? DEMO_BADGE_TIP : isPlaceholder ? PLACEHOLDER_TIP : REAL_TIP;
  const tabActive = (route: string) => route === path;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => navigate(event, "/")} aria-label="Whitespace home">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="7" cy="20" r="4.5" style={{ fill: "var(--ws-ink)" }} /><circle cx="21" cy="8" r="4" style={{ fill: "none", stroke: "var(--ws-ink)" }} strokeWidth="2" /><line x1="10.5" y1="17" x2="17.5" y2="11" style={{ stroke: "var(--ws-accent)" }} strokeWidth="2" strokeDasharray="2.5 2.5" /></svg>
          <span className="brand-name">Whitespace</span>
        </a>
        <div className="topbar-spacer" />
        <nav className="view-tabs" aria-label="Main views: Research map, Gaps and open problems">
          {navTabs.map(([route, label]) => (
            <a key={route} href={route} aria-current={tabActive(route) ? "page" : undefined} onClick={(event) => navigate(event, route)}>{label}</a>
          ))}
        </nav>
        <div className="topbar-tools">
          <DemoToggle />
          <ThemeToggle />
        </div>
        <span className={demo ? "data-badge data-badge--demo" : "data-badge"} tabIndex={0} data-tip={badgeTip} title={badgeTip} aria-label={`${badge}. ${badgeTip}`}>{badge}</span>
      </header>
      <main id="main-content" className="main-content" key={demo ? "demo" : "real"}>
          {path === "/" && map && <Explore map={map} selectedYear={year} loading={status === "loading"} selectedConceptId={selectedConceptId} onSelectConcept={selectConcept} onSearch={search} />}
          {path === "/" && status === "loading" && !map && <PageSkeleton label="Loading research map…" />}
          {path === "/gaps" && status === "loading" && !gaps && <PageSkeleton label="Loading gap finder…" />}
          {path === "/gaps" && gaps && <GapsPage response={gaps} loadDetail={loadGap} loading={status === "loading"} error={status === "error" ? error : null} />}
            {status === "error" && <p className="app-error" role="alert">{error}</p>}
      </main>
    </div>
  );
}
