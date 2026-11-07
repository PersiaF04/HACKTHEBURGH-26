import { useState } from "react";
import type { FocusPoint, MapResponse, SearchResponse, YearRange } from "../api";
import { MapCanvas } from "../components/MapCanvas";
import { SearchBar } from "../components/SearchBar";
import { TimeSlider } from "../components/TimeSlider";
import "../components/explore.css";

type ExploreProps = {
  map: MapResponse;
  yearRange: YearRange;
  selectedConceptId: string | null;
  onYearChange: (year: number) => void;
  onSelectConcept: (id: string) => void;
  onSearch: (query: string) => Promise<SearchResponse>;
};

export function Explore({
  map,
  yearRange,
  selectedConceptId,
  onYearChange,
  onSelectConcept,
  onSearch,
}: ExploreProps) {
  const [searchFocus, setSearchFocus] = useState<FocusPoint>(null);
  const [searchFocusSet, setSearchFocusSet] = useState(false);
  const selected = map.concepts.find((concept) => concept.id === selectedConceptId);

  function handleSearchResults(results: SearchResponse) {
    setSearchFocus(results.focus);
    setSearchFocusSet(true);
  }

  function selectConcept(id: string) {
    onSelectConcept(id);
    const point = map.concepts.find((concept) => concept.id === id);
    if (point) {
      setSearchFocus({ x: point.x, y: point.y });
      setSearchFocusSet(true);
    }
  }

  return (
    <section className="whitespace-explore" aria-label="Explore research concepts">
      <div className="whitespace-explore__controls">
        <SearchBar onSearch={onSearch} onResults={handleSearchResults} onSelectConcept={selectConcept} />
        <TimeSlider
          year={map.year}
          minYear={yearRange.min}
          maxYear={yearRange.max}
          onChange={onYearChange}
        />
      </div>

      <MapCanvas
        concepts={map.concepts}
        edges={map.edges}
        selectedConceptId={selectedConceptId}
        focus={searchFocusSet ? searchFocus : map.focus}
        placeholder={map.placeholder}
        onSelectConcept={selectConcept}
      />

      {selected && (
        <aside className="whitespace-explore__selection" aria-live="polite" aria-label="Selected concept">
          <h2>{selected.label}</h2>
          {typeof selected.paper_count === "number" && <p>{selected.paper_count.toLocaleString()} papers in this snapshot.</p>}
        </aside>
      )}
    </section>
  );
}
