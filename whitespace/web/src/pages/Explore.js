import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { MapCanvas } from "../components/MapCanvas";
import { SearchBar } from "../components/SearchBar";
import { TimeSlider } from "../components/TimeSlider";
import "../components/explore.css";
export function Explore({ map, selectedYear, loading, yearRange, selectedConceptId, onYearChange, onSelectConcept, onSearch, }) {
    const [searchFocus, setSearchFocus] = useState(null);
    const [searchFocusSet, setSearchFocusSet] = useState(false);
    const mapMatchesSelection = map.year === selectedYear;
    const showMap = mapMatchesSelection && !loading;
    const selected = showMap ? map.concepts.find((concept) => concept.id === selectedConceptId) : undefined;
    function handleSearchResults(results) {
        setSearchFocus(results.focus);
        setSearchFocusSet(true);
    }
    function selectConcept(id) {
        if (!showMap)
            return;
        onSelectConcept(id);
        const point = map.concepts.find((concept) => concept.id === id);
        if (point) {
            setSearchFocus({ x: point.x, y: point.y });
            setSearchFocusSet(true);
        }
    }
    return (_jsxs("section", { className: "whitespace-explore", "aria-label": "Explore research concepts", children: [_jsxs("div", { className: "whitespace-explore__controls", children: [_jsx(SearchBar, { onSearch: onSearch, onResults: handleSearchResults, onSelectConcept: selectConcept }), _jsx(TimeSlider, { year: selectedYear, minYear: yearRange.min, maxYear: yearRange.max, onChange: onYearChange })] }), showMap ? (_jsx(MapCanvas, { concepts: map.concepts, edges: map.edges, selectedConceptId: selectedConceptId, focus: searchFocusSet ? searchFocus : map.focus, placeholder: map.placeholder, onSelectConcept: selectConcept })) : (_jsx("p", { className: "whitespace-explore__loading", role: "status", "aria-live": "polite", children: loading ? `Loading the ${selectedYear} snapshot…` : `The ${selectedYear} snapshot is not available yet.` })), selected && (_jsxs("aside", { className: "whitespace-explore__selection", "aria-live": "polite", "aria-label": "Selected concept", children: [_jsx("h2", { children: selected.label }), typeof selected.paper_count === "number" && _jsxs("p", { children: [selected.paper_count.toLocaleString(), " papers in this snapshot."] })] }))] }));
}
