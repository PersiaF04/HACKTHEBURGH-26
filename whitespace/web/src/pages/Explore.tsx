import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ConceptResponse, GapSummary, MapResponse, SearchResponse } from "../api";
import { ConceptPanel, ConceptPanelSkeleton } from "../components/ConceptPanel";
import { DEFAULT_FILTERS, FiltersPanel } from "../components/FiltersPanel";
import type { ExploreFilters } from "../components/FiltersPanel";
import MapCanvas3DLazy from "../components/MapCanvas3DLazy";
import { MapLegend } from "../components/MapLegend";
import { MapSkeleton } from "../components/MapSkeleton";
import { SearchBar } from "../components/SearchBar";
import { fmtInt } from "../lib/format";
import { useWhitespaceStore } from "../store/useWhitespaceStore";
import "../components/explore.css";
import "./explore-page.css";

/** The Research map page (file kept as Explore.tsx). */
type ExploreProps = {
  map: MapResponse;
  selectedYear: number;
  loading: boolean;
  selectedConceptId: string | null;
  onSelectConcept: (id: string) => void;
  onSearch: (query: string) => Promise<SearchResponse>;
};

const SKELETON_CAPTION = "The map shows one dot per research concept. Size = papers, colour = 3-year growth, dashed lines = predicted links. Data loads from the pipeline export.";

const STAT_HELP = {
  shown: "Research concepts currently on the map, after filters.",
  links: "Pairs of concepts that already share 3 or more papers.",
  papers: "Papers tagged with the concepts shown. A paper with several concepts is counted for each.",
  predicted: "Predicted new links that involve the selected concept.",
} as const;

export function Explore({ map, selectedYear, loading, selectedConceptId, onSelectConcept, onSearch }: ExploreProps) {
  // Explicit "go to this concept" request; each new tick recentres the map (search, panel links).
  const [focusReq, setFocusReq] = useState<{ id: string; tick: number } | null>(null);
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [detail, setDetail] = useState<ConceptResponse | null | undefined>(undefined);
  const [offAreas, setOffAreas] = useState<Set<string>>(new Set());
  const [gaps, setGaps] = useState<GapSummary[] | undefined>(undefined);

  const showMap = map.year === selectedYear && !loading;
  const skeleton = showMap && (map.placeholder || (map.concepts.length === 0 && !map.no_data));
  const live = showMap && !skeleton && !map.no_data;
  const selected = live ? map.concepts.find((concept) => concept.id === selectedConceptId) : undefined;
  const selectedId = selected?.id ?? null;

  // Single selection: the store toggles and appends, so set the list directly.
  function pick(id: string) {
    if (!live) return;
    const current = useWhitespaceStore.getState().selectedConcepts;
    if (current.length !== 1 || current[0] !== id) useWhitespaceStore.setState({ selectedConcepts: [id] });
    else onSelectConcept(id); // clicking the selected concept again toggles it off
  }
  /** Picked from search or the side panel: select it and bring the map to it. */
  function pickAndFocus(id: string) {
    pick(id);
    if (map.concepts.some((c) => c.id === id)) setFocusReq((prev) => ({ id, tick: (prev?.tick ?? 0) + 1 }));
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
    if (filters.growth === "up") return concept.growth !== null && concept.growth !== undefined && concept.growth > 0;
    if (filters.growth === "down") return concept.growth !== null && concept.growth !== undefined && concept.growth < 0;
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

  // Search result with only a map position: bring the nearest concept into view.
  function focusPoint(point: { x: number; y: number } | null) {
    if (!point || map.concepts.length === 0) return;
    let best = map.concepts[0], bd = Infinity;
    for (const c of map.concepts) {
      const d = (c.x - point.x) ** 2 + (c.y - point.y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    setFocusReq((prev) => ({ id: best.id, tick: (prev?.tick ?? 0) + 1 }));
  }

  const nothing = skeleton || !live;
  const stats: { label: string; value: string; help: string; caption: string; accent?: boolean }[] = [
    { label: "Concepts shown", value: nothing ? fmtInt(null) : fmtInt(visible.length), help: STAT_HELP.shown, caption: "Dots on the map" },
    { label: "Links", value: nothing || !hasLinked ? fmtInt(null) : fmtInt(linkedEdges.length), help: STAT_HELP.links, caption: "Pairs sharing 3+ papers" },
    { label: "Papers covered", value: nothing || !hasCounts ? fmtInt(null) : fmtInt(papers), help: STAT_HELP.papers, caption: "Across the concepts shown" },
    { label: "Predicted from selection", value: nothing || !selectedId ? fmtInt(null) : fmtInt(fromSelection), help: STAT_HELP.predicted, caption: "New links for the selected dot", accent: true },
  ];
  return (
    <div className="ex">
      <aside className="ex__left" aria-label="Search and filters">
        <SearchBar
          disabled={nothing}
          onSearch={onSearch}
          onResults={(r) => focusPoint(r.focus)}
          onSelectConcept={pickAndFocus}
          concepts={live ? map.concepts : undefined}
        />
        <FiltersPanel
          disabled={nothing}
          filters={filters}
          maxPapers={maxPapers}
          onChange={setFilters}
          onReset={() => { setFilters(DEFAULT_FILTERS); setOffAreas(new Set()); }}
          areas={areas}
          selectedAreaIds={areas.filter((a) => !offAreas.has(a.id)).map((a) => a.id)}
          onToggleArea={(id) => setOffAreas((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; })}
        />
      </aside>

      <section className="ex__centre" aria-label="Research map" data-tour="map-canvas">
        <dl className="ex-stats" aria-label="Map summary">
          {stats.map(({ label, value, help, caption, accent }) => (
            <div key={label} title={help}>
              <dt>{label}</dt>
              <dd className={accent ? "ex-stats__accent" : undefined}>{value}</dd>
              <dd className="ex-stats__caption">{caption}</dd>
            </div>
          ))}
        </dl>
        {skeleton ? (
          <>
            <MapSkeleton caption={SKELETON_CAPTION} />
            <MapLegend view="none" skeleton />
          </>
        ) : live ? (
          <>
            <div className="ex__mapwrap">
              <MapCanvas3DLazy
                concepts={visible}
                allConcepts={map.concepts}
                resetKey={selectedYear}
                edges={edges}
                linkedEdges={linkedEdges}
                selectedConceptId={selectedId}
                focus={map.focus}
                focusRequest={focusReq}
                showPredicted={filters.showPredicted}
                onSelectConcept={pick}
                placeholder={false}
              />
            </div>
            <MapLegend view="3d" hasLinked={hasLinked} />
          </>
        ) : (
          <div className="ex__loading" role="status" aria-live="polite">
            {loading || !showMap ? `Loading ${selectedYear}…` : `No data for ${selectedYear}`}
          </div>
        )}
      </section>

      {skeleton ? (
        <ConceptPanelSkeleton />
      ) : (
        <ConceptPanel
          concept={selected}
          detail={detail}
          gaps={gaps}
          year={selectedYear}
          onSelectConcept={pickAndFocus}
        />
      )}
    </div>
  );
}
