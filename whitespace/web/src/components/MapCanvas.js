import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import "./map.css";
const VIEW_SIZE = 960;
const MAP_MIN = 42;
const MAP_MAX = VIEW_SIZE - 42;
const LIST_PAGE_SIZE = 50;
const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1 };
const GROWTH_STEPS = [
    { color: "#C3C7CF", label: "Shrinking" },
    { color: "#F0C9A0", label: "0 to 15%" },
    { color: "#EDA060", label: "15 to 30%" },
    { color: "#E07432", label: "30 to 45%" },
    { color: "#BF4A0E", label: "45% or more" },
];
function extent(values) {
    if (!values.length)
        return [0, 1];
    const low = Math.min(...values);
    const high = Math.max(...values);
    return low === high ? [low - 0.5, high + 0.5] : [low, high];
}
function nodeRadius(paperCount) {
    return Math.max(2.5, Math.min(12, Math.sqrt(Math.max(0, paperCount)) * 0.45));
}
function growthColor(growth) {
    if (growth === null)
        return "#9AA0AA";
    if (growth < 0)
        return GROWTH_STEPS[0].color;
    if (growth < 0.15)
        return GROWTH_STEPS[1].color;
    if (growth < 0.3)
        return GROWTH_STEPS[2].color;
    if (growth < 0.45)
        return GROWTH_STEPS[3].color;
    return GROWTH_STEPS[4].color;
}
function nodeDescription(concept) {
    const papers = typeof concept.paper_count === "number"
        ? `${concept.paper_count.toLocaleString("en-GB")} papers`
        : "paper count unavailable";
    const growth = concept.growth === null ? "growth unavailable" : `growth ${(concept.growth * 100).toFixed(1)}%`;
    return `${concept.label}; ${papers}; ${growth}`;
}
export function MapCanvas({ concepts, edges, selectedConceptId, focus, placeholder, onSelectConcept }) {
    const canvasRef = useRef(null);
    const dragRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [transform, setTransform] = useState(DEFAULT_TRANSFORM);
    const [listPage, setListPage] = useState(0);
    const extents = useMemo(() => {
        const x = extent(concepts.map((concept) => concept.x));
        const y = extent(concepts.map((concept) => concept.y));
        return {
            xCenter: (x[0] + x[1]) / 2,
            yCenter: (y[0] + y[1]) / 2,
            range: Math.max(x[1] - x[0], y[1] - y[0]),
        };
    }, [concepts]);
    const positioned = useMemo(() => concepts.map((concept) => ({
        ...concept,
        mapX: VIEW_SIZE / 2 + ((concept.x - extents.xCenter) / extents.range) * (MAP_MAX - MAP_MIN),
        mapY: VIEW_SIZE / 2 - ((concept.y - extents.yCenter) / extents.range) * (MAP_MAX - MAP_MIN),
    })), [concepts, extents]);
    const byId = useMemo(() => new Map(positioned.map((concept) => [concept.id, concept])), [positioned]);
    const pageCount = Math.max(1, Math.ceil(positioned.length / LIST_PAGE_SIZE));
    const pageStart = Math.min(listPage, pageCount - 1) * LIST_PAGE_SIZE;
    const pageConcepts = positioned.slice(pageStart, pageStart + LIST_PAGE_SIZE);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return undefined;
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            setCanvasSize({ width: rect.width, height: rect.height });
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (!focus || !concepts.length)
            return;
        const targetX = VIEW_SIZE / 2 + ((focus.x - extents.xCenter) / extents.range) * (MAP_MAX - MAP_MIN);
        const targetY = VIEW_SIZE / 2 - ((focus.y - extents.yCenter) / extents.range) * (MAP_MAX - MAP_MIN);
        setTransform((current) => ({
            ...current,
            x: VIEW_SIZE / 2 - targetX * current.scale,
            y: VIEW_SIZE / 2 - targetY * current.scale,
        }));
    }, [focus?.x, focus?.y, concepts.length, extents]);
    useEffect(() => setListPage(0), [concepts]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0)
            return undefined;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(canvasSize.width * ratio);
        canvas.height = Math.round(canvasSize.height * ratio);
        const context = canvas.getContext("2d");
        if (!context)
            return undefined;
        context.setTransform(ratio * canvasSize.width / VIEW_SIZE, 0, 0, ratio * canvasSize.height / VIEW_SIZE, 0, 0);
        context.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
        context.save();
        context.translate(transform.x, transform.y);
        context.scale(transform.scale, transform.scale);
        for (const edge of edges) {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            if (!source || !target)
                continue;
            context.beginPath();
            context.setLineDash([6, 4]);
            context.lineWidth = 1.5;
            context.strokeStyle = `rgba(41, 82, 227, ${Math.max(0.2, Math.min(0.8, edge.p_link))})`;
            context.moveTo(source.mapX, source.mapY);
            context.lineTo(target.mapX, target.mapY);
            context.stroke();
        }
        for (const concept of positioned) {
            const radius = nodeRadius(concept.paper_count ?? 0);
            context.beginPath();
            context.setLineDash([]);
            context.arc(concept.mapX, concept.mapY, radius, 0, Math.PI * 2);
            context.fillStyle = growthColor(concept.growth);
            context.fill();
            context.lineWidth = selectedConceptId === concept.id ? 3 : 1.5;
            context.strokeStyle = selectedConceptId === concept.id ? "#15171C" : "#FFFFFF";
            context.stroke();
            if (selectedConceptId === concept.id) {
                context.beginPath();
                context.arc(concept.mapX, concept.mapY, radius + 5, 0, Math.PI * 2);
                context.lineWidth = 1.5;
                context.strokeStyle = "#15171C";
                context.stroke();
            }
        }
        context.restore();
        return undefined;
    }, [canvasSize, edges, byId, positioned, selectedConceptId, transform]);
    function zoom(factor) {
        setTransform((current) => {
            const scale = Math.max(0.6, Math.min(5, current.scale * factor));
            const ratio = scale / current.scale;
            return {
                scale,
                x: VIEW_SIZE / 2 - (VIEW_SIZE / 2 - current.x) * ratio,
                y: VIEW_SIZE / 2 - (VIEW_SIZE / 2 - current.y) * ratio,
            };
        });
    }
    function handleWheel(event) {
        event.preventDefault();
        zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    }
    function handlePointerDown(event) {
        if (event.button !== 0)
            return;
        dragRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            originX: transform.x,
            originY: transform.y,
            moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function handlePointerMove(event) {
        const drag = dragRef.current;
        if (!drag)
            return;
        const dx = event.clientX - drag.pointerX;
        const dy = event.clientY - drag.pointerY;
        if (Math.abs(dx) + Math.abs(dy) > 4)
            drag.moved = true;
        if (!drag.moved)
            return;
        const rect = event.currentTarget.getBoundingClientRect();
        setTransform((current) => ({
            ...current,
            x: drag.originX + dx * VIEW_SIZE / rect.width,
            y: drag.originY + dy * VIEW_SIZE / rect.height,
        }));
    }
    function hitTest(clientX, clientY) {
        const canvas = canvasRef.current;
        if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0)
            return undefined;
        const rect = canvas.getBoundingClientRect();
        const screenX = (clientX - rect.left) * VIEW_SIZE / rect.width;
        const screenY = (clientY - rect.top) * VIEW_SIZE / rect.height;
        const mapX = (screenX - transform.x) / transform.scale;
        const mapY = (screenY - transform.y) / transform.scale;
        const displayScale = Math.min(rect.width, rect.height) / VIEW_SIZE * transform.scale;
        let nearest;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const concept of positioned) {
            const distance = Math.hypot(concept.mapX - mapX, concept.mapY - mapY);
            const hitRadius = Math.max(12 / displayScale, nodeRadius(concept.paper_count ?? 0) + 5);
            if (distance <= hitRadius && distance < nearestDistance) {
                nearest = concept;
                nearestDistance = distance;
            }
        }
        return nearest;
    }
    function handlePointerUp(event) {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag && !drag.moved) {
            const concept = hitTest(event.clientX, event.clientY);
            if (concept)
                onSelectConcept(concept.id);
        }
    }
    function selectConcept(id) {
        onSelectConcept(id);
        const index = positioned.findIndex((concept) => concept.id === id);
        if (index >= 0)
            setListPage(Math.floor(index / LIST_PAGE_SIZE));
    }
    return (_jsxs("section", { className: "whitespace-map", "aria-label": "Research concept map", children: [_jsxs("div", { className: "whitespace-map__toolbar", children: [placeholder && _jsx("span", { className: "whitespace-placeholder-tag", children: "Placeholder data" }), _jsxs("div", { className: "whitespace-map__zoom", role: "group", "aria-label": "Map controls", children: [_jsx("button", { type: "button", onClick: () => zoom(1.25), "aria-label": "Zoom in", children: "+" }), _jsx("button", { type: "button", onClick: () => zoom(0.8), "aria-label": "Zoom out", children: "\u2212" }), _jsx("button", { type: "button", onClick: () => setTransform(DEFAULT_TRANSFORM), children: "Reset view" })] })] }), !positioned.length ? (_jsxs("div", { className: "whitespace-map__empty", role: "status", children: [_jsx("strong", { children: "No concepts are available for this year." }), _jsx("span", { children: "Choose another snapshot origin to explore the map." })] })) : (_jsx("canvas", { ref: canvasRef, className: "whitespace-map__canvas", "aria-hidden": "true", onWheel: handleWheel, onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: () => { dragRef.current = null; } })), _jsxs("p", { className: "whitespace-map__note", children: ["The map shows ", positioned.length.toLocaleString("en-GB"), " concepts. Use the complete keyboard-accessible list below to select one. Map distance is a 2D projection, not a definitive measure of research similarity."] }), _jsxs("div", { className: "whitespace-map__legend", role: "group", "aria-label": "Map legend", children: [_jsxs("span", { className: "whitespace-map__legend-scale", children: ["Colour = 3-year paper growth:", GROWTH_STEPS.map((step) => (_jsxs("span", { className: "whitespace-map__legend-step", children: [_jsx("i", { style: { background: step.color }, "aria-hidden": "true" }), step.label] }, step.label)))] }), _jsx("span", { children: "Circle size = paper count" }), _jsxs("span", { children: [_jsx("i", { className: "whitespace-map__legend-dash", "aria-hidden": "true" }), " Predicted link (placeholder P)"] })] }), _jsxs("details", { className: "whitespace-map__browse", children: [_jsxs("summary", { children: ["Browse all ", positioned.length.toLocaleString("en-GB"), " concepts"] }), _jsxs("div", { className: "whitespace-map__browse-status", role: "status", "aria-live": "polite", children: ["Showing ", positioned.length ? pageStart + 1 : 0, "\u2013", Math.min(pageStart + LIST_PAGE_SIZE, positioned.length), " of ", positioned.length, " concepts"] }), _jsx("ul", { className: "whitespace-map__concept-list", children: pageConcepts.map((concept) => (_jsx("li", { children: _jsxs("button", { type: "button", "aria-pressed": selectedConceptId === concept.id, "aria-label": nodeDescription(concept), onClick: () => selectConcept(concept.id), children: [_jsx("span", { children: concept.label }), _jsxs("span", { className: "whitespace-map__concept-meta", children: [concept.paper_count === undefined ? "Papers n/a" : `${concept.paper_count.toLocaleString("en-GB")} papers`, concept.growth === null ? " · growth n/a" : ` · ${concept.growth >= 0 ? "+" : ""}${(concept.growth * 100).toFixed(1)}%`] })] }) }, concept.id))) }), _jsxs("nav", { className: "whitespace-map__pagination", "aria-label": "Concept list pages", children: [_jsx("button", { type: "button", disabled: listPage <= 0, onClick: () => setListPage((page) => Math.max(0, page - 1)), children: "Previous" }), _jsxs("span", { children: ["Page ", Math.min(listPage + 1, pageCount), " of ", pageCount] }), _jsx("button", { type: "button", disabled: listPage + 1 >= pageCount, onClick: () => setListPage((page) => Math.min(pageCount - 1, page + 1)), children: "Next" })] })] })] }));
}
