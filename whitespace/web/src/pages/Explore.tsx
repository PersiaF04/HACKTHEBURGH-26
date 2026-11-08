import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ConceptResponse, GapSummary, MapResponse, SearchResponse } from "../api";
import { BranchPanel } from "../components/BranchPanel";
import { ConceptPanel, ConceptPanelSkeleton } from "../components/ConceptPanel";
import { DEFAULT_FILTERS, FiltersPanel } from "../components/FiltersPanel";
import type { ExploreFilters } from "../components/FiltersPanel";
import MapCanvas3DLazy from "../components/MapCanvas3DLazy";
import { MapLegend } from "../components/MapLegend";
import { MapSkeleton } from "../components/MapSkeleton";
import { SearchBar } from "../components/SearchBar";
import { fmtInt } from "../lib/format";
import { buildHierarchy, DEFAULT_PER_BRANCH, isSynthetic } from "../lib/hierarchy";
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
  papers: "Distinct papers in the exported corpus. A paper with several concepts is counted once.",
  predicted: "Predicted new links that involve the selected concept.",
} as const;

export function Explore({ map, selectedYear, loading, selectedConceptId, onSelectConcept, onSearch }: ExploreProps) {
  // Explicit "go to this concept" request; each new tick recentres the map (search, panel links).
  const [focusReq, setFocusReq] = useState<{ id: string; tick: number } | null>(null);
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [detail, setDetail] = useState<ConceptResponse | null | undefined>(undefined);
  const [offAreas, setOffAreas] = useState<Set<string>>(new Set());
  const [gaps, setGaps] = useState<GapSummary[] | undefined>(undefined);
  const [perBranch, setPerBranch] = useState(DEFAULT_PER_BRANCH);
  const [showGaps, setShowGaps] = useState(false);
  const [gapCount, setGapCount] = useState(8);
  const [works, setWorks] = useState<number | null>(null);
  const [synth, setSynth] = useState<string | null>(null);
  const [ranked, setRanked] = useState<GapSummary[]>([]);

  const showMap = map.year === selectedYear && !loading;
  const skeleton = showMap && (map.placeholder || (map.concepts.length === 0 && !map.no_data));
  const live = showMap && !skeleton && !map.no_data;
  const selected = live ? map.concepts.find((concept) => concept.id === selectedConceptId) : undefined;
  const selectedId = selected?.id ?? null;

  // Single selection: the store toggles and appends, so set the list directly.
  function pick(id: string) {
    if (!live) return;
    if (isSynthetic(id)) { setSynth((cur) => (cur === id ? null : id)); setFocusReq((prev) => ({ id, tick: (prev?.tick ?? 0) + 1 })); return; }
    setSynth(null);
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

  useEffect(() => {
    let current = true;
    api.gaps({ limit: 50 }).then((value) => { if (current) setRanked(value.items); }).catch(() => { if (current) setRanked([]); });
    return () => { current = false; };
  }, [selectedYear]);
  useEffect(() => {
    let current = true;
    api.meta().then((m) => { if (current) setWorks(typeof m.counts?.works === "number" ? m.counts.works : null); }).catch(() => undefined);
    return () => { current = false; };
  }, []);
  const hierarchy = useMemo(() => (live ? buildHierarchy(map.concepts, showGaps ? ranked.slice(0, gapCount) : [], perBranch) : null), [live, map.concepts, ranked, perBranch, showGaps, gapCount]);

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
  const shownNodes = useMemo(
    () => (hierarchy
      ? hierarchy.nodes.filter((n) => {
        if (n.kind === "concept") return visibleIds.has(n.id);
        // A hypothesis needs both of its concepts on screen, so filters never leave it floating alone.
        if (n.kind === "hypothesis") return n.id.slice(4).split("|").every((id) => visibleIds.has(id));
        return true;
      })
      : visible),
    [hierarchy, visible, visibleIds],
  );
  const shownStructure = useMemo(() => {
    const ids = new Set(shownNodes.map((n) => n.id));
    return (hierarchy?.structure ?? []).filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [hierarchy, shownNodes]);

  const edges = useMemo(
    () => map.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [map.edges, visibleIds],
  );
  const linkedEdges = useMemo(
    () => (map.linked_edges ?? []).filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [map.linked_edges, visibleIds],
  );
  // Supporting links: the strongest predicted links, plus every link of the selected concept.
  const supportEdges = useMemo(() => {
    const own = selectedId ? edges.filter((e) => e.source === selectedId || e.target === selectedId) : [];
    return own;
  }, [edges, selectedId]);
  const fromSelection = selectedId ? edges.filter((e) => e.source === selectedId || e.target === selectedId).length : 0;
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
  const kindCount = (kind: string) => shownNodes.filter((n) => (n as { kind?: string }).kind === kind).length;
  const graphCaption = hierarchy ? `Graph draws ${fmtInt(kindCount("concept"))} concepts in ${fmtInt(kindCount("branch"))} branches${showGaps ? ` and ${fmtInt(kindCount("hypothesis"))} gaps` : ""}` : "";
  const stats: { label: string; value: string; help: string; caption: string; accent?: boolean }[] = [
    { label: "Concepts shown", value: nothing ? fmtInt(null) : fmtInt(visible.length), help: STAT_HELP.shown, caption: hierarchy ? graphCaption : "Dots on the map" },
    { label: "Papers in the corpus", value: nothing || works === null ? fmtInt(null) : fmtInt(works), help: STAT_HELP.papers, caption: "Distinct papers in the export" },
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
          graph={hierarchy ? { perBranch, onPerBranch: setPerBranch, showGaps, onShowGaps: setShowGaps, gapCount, onGapCount: setGapCount } : undefined}
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
                concepts={shownNodes}
                allConcepts={hierarchy?.nodes ?? map.concepts}
                resetKey={selectedYear}
                edges={hierarchy ? supportEdges : edges}
                showAreaLabels={false}
                linkedEdges={linkedEdges}
                structure={shownStructure}
                selectedConceptId={synth ?? selectedId}
                focus={map.focus}
                focusRequest={focusReq}
                showPredicted={filters.showPredicted}
                onSelectConcept={pick}
                placeholder={false}
              />
            </div>
            {hierarchy ? (
              <div className="ex__heatlegend" aria-label="Colour key">
                {showGaps && <span><strong>A gap</strong>: two topics not studied together yet. A line joins them with a purple dot in the middle; a bigger dot means a likelier link. Click the dot for details.</span>}
                <span className="ex__heatlegend-bar" aria-hidden="true" />
                <span>Red: branch hubs and their biggest subtopics</span>
                <span>Blue: smaller subtopics</span>
                <span>Dot size = papers</span>
              </div>
            ) : <MapLegend view="3d" hasLinked={hasLinked} />}
            {hierarchy && (
              <p className="ws-note ex__structure-note">
                Graph structure: the hot red dots are branches (clusters found in the map layout, named for the words their concepts share), joined by the heavier lines. Around each branch, concepts cool from red for the biggest to blue for the smallest. With “Show gaps and their links” on, the top ranked gaps are drawn as bridges between the two concepts they join (choose how many with “Gaps shown”); selecting a concept always shows its own predicted links. Branches are derived in the app, not exported by the pipeline.
              </p>
            )}
          </>
        ) : (
          <div className="ex__loading" role="status" aria-live="polite">
            {loading || !showMap ? `Loading ${selectedYear}…` : `No data for ${selectedYear}`}
          </div>
        )}
      </section>

      {skeleton ? (
        <ConceptPanelSkeleton />
      ) : synth && hierarchy ? (
        <BranchPanel
          branch={hierarchy.branchInfo.get(synth)}
          hypothesis={hierarchy.hypothesisInfo.get(synth)}
          onSelectConcept={pickAndFocus}
          onClose={() => setSynth(null)}
        />
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
