import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ConceptResponse, FocusPoint, GapSummary, MapResponse, SearchResponse, YearRange } from "../api";
import { ConceptPanel } from "../components/ConceptPanel";
import { DEFAULT_FILTERS, FiltersPanel } from "../components/FiltersPanel";
import type { ExploreFilters } from "../components/FiltersPanel";
import { MapCanvas } from "../components/MapCanvas";
import MapCanvas3DLazy from "../components/MapCanvas3DLazy";
import { SearchBar } from "../components/SearchBar";
import { useWhitespaceStore } from "../store/useWhitespaceStore";
import "../components/explore.css";
import "./explore-page.css";

type ExploreProps = {
  map: MapResponse;
  selectedYear: number;
  loading: boolean;
  yearRange: YearRange;
  selectedConceptId: string | null;
  onYearChange: (year: number) => void;
  onSelectConcept: (id: string) => void;
  onSearch: (query: string) => Promise<SearchResponse>;
};

const fmt = (value: number) => Math.round(value).toLocaleString("en-GB");
const DASH = "—";

export function Explore({ map, selectedYear, loading, selectedConceptId, onSelectConcept, onSearch }: ExploreProps) {
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [webglFailed, setWebglFailed] = useState(false);
  const [searchFocus, setSearchFocus] = useState<FocusPoint>(null);
  const [searchFocusSet, setSearchFocusSet] = useState(false);
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [detail, setDetail] = useState<ConceptResponse | null | undefined>(undefined);
  const [offAreas, setOffAreas] = useState<Set<string>>(new Set());
  const [gaps, setGaps] = useState<GapSummary[] | undefined>(undefined);

  const showMap = map.year === selectedYear && !loading;
  const selected = showMap ? map.concepts.find((concept) => concept.id === selectedConceptId) : undefined;
  const selectedId = selected?.id ?? null;

  // Single selection: the store toggles and appends, so set the list directly.
  function selectConcept(id: string) {
    if (!showMap) return;
    const current = useWhitespaceStore.getState().selectedConcepts;
    if (current.length !== 1 || current[0] !== id) useWhitespaceStore.setState({ selectedConcepts: [id] });
    else onSelectConcept(id); // clicking the selected concept again toggles it off
    const point = map.concepts.find((concept) => concept.id === id);
    if (point) {
      setSearchFocus({ x: point.x, y: point.y });
      setSearchFocusSet(true);
    }
  }

  useEffect(() => {
    if (!selectedId) { setDetail(undefined); setGaps(undefined); return undefined; }
    let current = true;
    setDetail(undefined);
    setGaps(undefined);
    api.concept(selectedId).then((value) => { if (current) setDetail(value ?? null); }).catch(() => { if (current) setDetail(null); });
    api.gaps({ concepts: [selectedId], limit: 8 }).then((value) => { if (current) setGaps(value.items); }).catch(() => { if (current) setGaps([]); });
    return () => { current = false; };
  }, [selectedId]);

  const maxPapers = useMemo(() => map.concepts.reduce((max, c) => Math.max(max, c.paper_count ?? 0), 0), [map.concepts]);
  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of map.concepts) if (c.area) counts.set(c.area, (counts.get(c.area) ?? 0) + 1);
    return [...counts].map(([name, count]) => ({ id: name, name, count }));
  }, [map.concepts]);
  const visible = useMemo(() => map.concepts.filter((concept) => {
    if (concept.area && offAreas.has(concept.area)) return false;
    if (filters.minPapers > 0 && (concept.paper_count ?? 0) < filters.minPapers) return false;
    if (filters.growth === "up") return concept.growth !== null && concept.growth > 0;
    if (filters.growth === "down") return concept.growth !== null && concept.growth < 0;
    return true;
  }), [map.concepts, filters.minPapers, filters.growth, offAreas]);
  const visibleIds = useMemo(() => new Set(visible.map((c) => c.id)), [visible]);
  const edges = useMemo(
    () => map.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [map.edges, visibleIds],
  );
  const linkedEdges = useMemo(
    () => (map.linked_edges ?? []).filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [map.linked_edges, visibleIds],
  );
  const fromSelection = selectedId ? edges.filter((e) => e.source === selectedId || e.target === selectedId).length : 0;
  const hasCounts = visible.some((c) => typeof c.paper_count === "number");
  const papers = visible.reduce((sum, c) => sum + (c.paper_count ?? 0), 0);
  const hasLinked = (map.linked_edges?.length ?? 0) > 0;

  // The design always shows a concept: start on the one with the most papers.
  useEffect(() => {
    if (!showMap || selectedConceptId || map.concepts.length === 0) return;
    const top = map.concepts.reduce((best, c) => ((c.paper_count ?? 0) > (best.paper_count ?? 0) ? c : best));
    useWhitespaceStore.setState({ selectedConcepts: [top.id] });
  }, [showMap, selectedConceptId, map.concepts]);

  const stats: [string, string, boolean?][] = [
    ["Concepts shown", fmt(visible.length)],
    ["Links", hasLinked ? fmt(linkedEdges.length) : DASH],
    ["Papers covered", hasCounts ? fmt(papers) : DASH],
    ["Predicted from selection", selectedId ? fmt(fromSelection) : DASH, true],
  ];

  return (
    <div className="ex">
      <aside className="ex__left" aria-label="Search and filters">
        <SearchBar onSearch={onSearch} onResults={(r) => { setSearchFocus(r.focus); setSearchFocusSet(true); }} onSelectConcept={selectConcept} concepts={map.concepts} />
        <FiltersPanel
          filters={filters}
          maxPapers={maxPapers}
          onChange={setFilters}
          onReset={() => { setFilters(DEFAULT_FILTERS); setOffAreas(new Set()); }}
          areas={areas}
          selectedAreaIds={areas.filter((a) => !offAreas.has(a.id)).map((a) => a.id)}
          onToggleArea={(id) => setOffAreas((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; })}
        />
      </aside>

      <section className="ex__centre" aria-label="Research map">
        <div className="ex__title">
          <h1>Research map</h1>
          <span>Click a concept for its details</span>
        </div>
        <dl className="ex-stats" aria-label="Map summary">
          {stats.map(([label, value, accent]) => (
            <div key={label}><dt>{label}</dt><dd className={accent ? "ex-stats__accent" : undefined}>{value}</dd></div>
          ))}
        </dl>
        {showMap && !map.no_data ? (
          <div className="ex__mapwrap">
            <div className="ex__viewtoggle" role="group" aria-label="Map view">
              <button type="button" aria-pressed={view === "3d" && !webglFailed} onClick={() => setView("3d")}>3D</button>
              <button type="button" aria-pressed={view === "2d" || webglFailed} onClick={() => setView("2d")}>2D</button>
            </div>
            {view === "3d" && !webglFailed ? (
              <MapCanvas3DLazy
                concepts={visible}
                edges={edges}
                linkedEdges={linkedEdges}
                selectedConceptId={selectedId}
                focus={searchFocusSet ? searchFocus : map.focus}
                showPredicted={filters.showPredicted}
                onSelectConcept={selectConcept}
                placeholder={map.placeholder}
                onUnsupported={() => setWebglFailed(true)}
              />
            ) : (
              <MapCanvas
                concepts={visible}
                edges={edges}
                linkedEdges={linkedEdges}
                selectedConceptId={selectedId}
                focus={searchFocusSet ? searchFocus : map.focus}
                showPredicted={filters.showPredicted}
                onSelectConcept={selectConcept}
              />
            )}
          </div>
        ) : (
          <div className="ex__loading" role="status" aria-live="polite">
            {loading || !showMap ? `Loading ${selectedYear}…` : `No data for ${selectedYear}`}
          </div>
        )}
      </section>

      <ConceptPanel
        concept={selected}
        detail={detail}
        gaps={gaps}
        year={selectedYear}
        onSelectConcept={selectConcept}
      />
    </div>
  );
}
