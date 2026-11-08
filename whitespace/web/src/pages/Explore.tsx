import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ConceptResponse, FocusPoint, GapSummary, MapResponse, SearchResponse, YearRange } from "../api";
import { ConceptPanel } from "../components/ConceptPanel";
import { DEFAULT_FILTERS, FiltersPanel } from "../components/FiltersPanel";
import type { ExploreFilters } from "../components/FiltersPanel";
import { MapCanvas } from "../components/MapCanvas";
import { SearchBar } from "../components/SearchBar";
import { TimeSlider } from "../components/TimeSlider";
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

export function Explore({ map, selectedYear, loading, yearRange, selectedConceptId, onYearChange, onSelectConcept, onSearch }: ExploreProps) {
  const [searchFocus, setSearchFocus] = useState<FocusPoint>(null);
  const [searchFocusSet, setSearchFocusSet] = useState(false);
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [detail, setDetail] = useState<ConceptResponse | null | undefined>(undefined);
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
  const visible = useMemo(() => map.concepts.filter((concept) => {
    if (filters.minPapers > 0 && (concept.paper_count ?? 0) < filters.minPapers) return false;
    if (filters.growth === "up") return concept.growth !== null && concept.growth >= 0.25;
    if (filters.growth === "down") return concept.growth !== null && concept.growth < 0;
    return true;
  }), [map.concepts, filters.minPapers, filters.growth]);
  const visibleIds = useMemo(() => new Set(visible.map((c) => c.id)), [visible]);
  const edges = useMemo(
    () => (filters.showPredicted ? map.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)) : []),
    [map.edges, visibleIds, filters.showPredicted],
  );
  const fromSelection = selectedId ? edges.filter((e) => e.source === selectedId || e.target === selectedId).length : 0;
  const hasCounts = visible.some((c) => typeof c.paper_count === "number");
  const papers = visible.reduce((sum, c) => sum + (c.paper_count ?? 0), 0);

  return (
    <div className="ex">
      <aside className="ex__left" aria-label="Search and filters">
        <SearchBar onSearch={onSearch} onResults={(r) => { setSearchFocus(r.focus); setSearchFocusSet(true); }} onSelectConcept={selectConcept} concepts={map.concepts} />
        <section aria-labelledby="ex-areas" className="ex__section">
          <h2 id="ex-areas" className="ex__h">Research areas</h2>
          <p className="ex__muted">Not available: this export does not assign concepts to research areas.</p>
        </section>
        <FiltersPanel filters={filters} maxPapers={maxPapers} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} />
      </aside>

      <section className="ex__centre" aria-label="Research map">
        <div className="ex__title">
          <h2>Research map</h2>
          <span className="ex__muted">Click a concept for its details</span>
        </div>
        <dl className="ex-stats" aria-label="Map summary">
          <div><dt>Concepts shown</dt><dd>{fmt(visible.length)}</dd></div>
          <div><dt>Predicted links shown</dt><dd>{fmt(edges.length)}</dd></div>
          <div><dt>Papers covered</dt><dd>{hasCounts ? fmt(papers) : "not available"}</dd></div>
          <div><dt>Predicted from selection</dt><dd className="ex-stats__accent">{selectedId ? fmt(fromSelection) : "–"}</dd></div>
        </dl>
        <div className="ex-time">
          <TimeSlider year={selectedYear} minYear={yearRange.min} maxYear={yearRange.max} onChange={onYearChange} />
        </div>
        {showMap ? (
          <MapCanvas
            concepts={visible}
            edges={edges}
            selectedConceptId={selectedId}
            focus={searchFocusSet ? searchFocus : map.focus}
            placeholder={map.placeholder}
            onSelectConcept={selectConcept}
          />
        ) : (
          <p className="ex__loading" role="status" aria-live="polite">
            {loading ? `Loading the ${selectedYear} snapshot…` : `The ${selectedYear} snapshot is not available yet.`}
          </p>
        )}
      </section>

      <ConceptPanel
        concept={selected}
        detail={detail}
        gaps={gaps}
        placeholder={map.placeholder}
        year={selectedYear}
        onSelectConcept={selectConcept}
      />
    </div>
  );
}
