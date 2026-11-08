import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { GapDrawer } from "../components/gaps/GapDrawer";
import { GapTable } from "../components/gaps/GapTable";
import "../components/gaps/gaps.css";
const sorters = {
    p_link: (gap) => gap.p_link,
    momentum: (gap) => gap.momentum,
    novelty: (gap) => gap.novelty,
    gap_rate: (gap) => gap.gap_rate,
    gap_score: (gap) => gap.gap_score,
};
function id(gap) {
    return `${gap.a}::${gap.b}`;
}
export function GapsPage({ response, loadDetail, loading = false, error }) {
    const [area, setArea] = useState("");
    const [minimumProbability, setMinimumProbability] = useState(0);
    const [sort, setSort] = useState("p_link");
    const [sortDirection, setSortDirection] = useState("desc");
    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const requestId = useRef(0);
    const items = useMemo(() => {
        const query = area.trim().toLocaleLowerCase();
        return response.items
            .filter((gap) => gap.p_link >= minimumProbability)
            .filter((gap) => !query || `${gap.a_label} ${gap.b_label}`.toLocaleLowerCase().includes(query))
            .sort((left, right) => {
            const a = sorters[sort](left);
            const b = sorters[sort](right);
            if (a == null && b == null)
                return 0;
            if (a == null)
                return 1;
            if (b == null)
                return -1;
            return (a - b) * (sortDirection === "asc" ? 1 : -1);
        })
            .slice(0, 50);
    }, [response.items, area, minimumProbability, sort, sortDirection]);
    useEffect(() => {
        if (!selected)
            return;
        const currentRequest = ++requestId.current;
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        loadDetail(selected)
            .then((result) => {
            if (currentRequest === requestId.current)
                setDetail(result);
        })
            .catch((reason) => {
            if (currentRequest === requestId.current) {
                setDetailError(reason instanceof Error ? reason.message : "The detail could not be loaded.");
            }
        })
            .finally(() => {
            if (currentRequest === requestId.current)
                setDetailLoading(false);
        });
        return () => {
            requestId.current += 1;
        };
    }, [selected, loadDetail]);
    function handleSort(key) {
        if (sort === key)
            setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
        else {
            setSort(key);
            setSortDirection("desc");
        }
    }
    function closeDetail() {
        requestId.current += 1;
        setSelected(null);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(false);
    }
    return (_jsxs("div", { className: "gaps-page", children: [_jsx("p", { className: "gaps-page__intro", children: "Explore concept pairs that the model ranks as possible future links. P(link) is a model probability; the gap score is a separate ranking score." }), _jsxs("form", { className: "gaps-filters", onSubmit: (event) => event.preventDefault(), "aria-label": "Filter ranked gaps", children: [_jsxs("label", { className: "gaps-filter", children: [_jsx("span", { children: "Filter by area or concept" }), _jsx("input", { type: "search", value: area, onChange: (event) => setArea(event.currentTarget.value), placeholder: "Search concept labels" })] }), _jsxs("label", { className: "gaps-filter", children: [_jsx("span", { children: "Minimum P(link)" }), _jsx("input", { type: "number", min: "0", max: "1", step: "0.05", value: minimumProbability, onChange: (event) => setMinimumProbability(Math.min(1, Math.max(0, Number(event.currentTarget.value) || 0))) })] }), _jsxs("p", { className: "gaps-filters__count", "aria-live": "polite", children: ["Showing ", items.length, " of ", response.items.length, " pairs"] })] }), _jsx(GapTable, { items: items, selectedId: selected ? id(selected) : null, sort: sort, sortDirection: sortDirection, loading: loading, error: error, placeholder: response.placeholder && items.length === 0, onSort: handleSort, onSelect: setSelected }), _jsx(GapDrawer, { open: selected !== null, detail: detail, loading: detailLoading, error: detailError, placeholder: response.placeholder, onClose: closeDetail })] }));
}
