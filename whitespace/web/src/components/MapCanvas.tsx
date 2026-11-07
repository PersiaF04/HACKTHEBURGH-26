import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import type { ConceptPoint, PredictedEdge } from "../api";
import "./map.css";

type MapFocus = { x: number; y: number } | null;
type MapCanvasProps = {
  concepts: ConceptPoint[];
  edges: PredictedEdge[];
  selectedConceptId: string | null;
  focus: MapFocus;
  placeholder: boolean;
  onSelectConcept: (id: string) => void;
};
type ViewTransform = { x: number; y: number; scale: number };
type CanvasSize = { width: number; height: number };
type DragState = { pointerX: number; pointerY: number; originX: number; originY: number; moved: boolean };
type PositionedConcept = ConceptPoint & { mapX: number; mapY: number };

const VIEW_SIZE = 960;
const MAP_MIN = 42;
const MAP_MAX = VIEW_SIZE - 42;
const LIST_PAGE_SIZE = 50;
const DEFAULT_TRANSFORM: ViewTransform = { x: 0, y: 0, scale: 1 };

const GROWTH_STEPS = [
  { color: "#C3C7CF", label: "Shrinking" },
  { color: "#F0C9A0", label: "0 to 15%" },
  { color: "#EDA060", label: "15 to 30%" },
  { color: "#E07432", label: "30 to 45%" },
  { color: "#BF4A0E", label: "45% or more" },
] as const;

function extent(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? [low - 0.5, high + 0.5] : [low, high];
}

function nodeRadius(paperCount: number): number {
  return Math.max(2.5, Math.min(12, Math.sqrt(Math.max(0, paperCount)) * 0.45));
}

function growthColor(growth: number | null): string {
  if (growth === null) return "#9AA0AA";
  if (growth < 0) return GROWTH_STEPS[0].color;
  if (growth < 0.15) return GROWTH_STEPS[1].color;
  if (growth < 0.3) return GROWTH_STEPS[2].color;
  if (growth < 0.45) return GROWTH_STEPS[3].color;
  return GROWTH_STEPS[4].color;
}

function nodeDescription(concept: ConceptPoint): string {
  const papers = typeof concept.paper_count === "number"
    ? `${concept.paper_count.toLocaleString("en-GB")} papers`
    : "paper count unavailable";
  const growth = concept.growth === null ? "growth unavailable" : `growth ${(concept.growth * 100).toFixed(1)}%`;
  return `${concept.label}; ${papers}; ${growth}`;
}

export function MapCanvas({ concepts, edges, selectedConceptId, focus, placeholder, onSelectConcept }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
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
  const positioned = useMemo<PositionedConcept[]>(
    () => concepts.map((concept) => ({
      ...concept,
      mapX: VIEW_SIZE / 2 + ((concept.x - extents.xCenter) / extents.range) * (MAP_MAX - MAP_MIN),
      mapY: VIEW_SIZE / 2 - ((concept.y - extents.yCenter) / extents.range) * (MAP_MAX - MAP_MIN),
    })),
    [concepts, extents],
  );
  const byId = useMemo(() => new Map(positioned.map((concept) => [concept.id, concept])), [positioned]);
  const pageCount = Math.max(1, Math.ceil(positioned.length / LIST_PAGE_SIZE));
  const pageStart = Math.min(listPage, pageCount - 1) * LIST_PAGE_SIZE;
  const pageConcepts = positioned.slice(pageStart, pageStart + LIST_PAGE_SIZE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
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
    if (!focus || !concepts.length) return;
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
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return undefined;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasSize.width * ratio);
    canvas.height = Math.round(canvasSize.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    context.setTransform(ratio * canvasSize.width / VIEW_SIZE, 0, 0, ratio * canvasSize.height / VIEW_SIZE, 0, 0);
    context.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
    context.save();
    context.translate(transform.x, transform.y);
    context.scale(transform.scale, transform.scale);

    for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
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

  function zoom(factor: number) {
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

  function handleWheel(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.pointerX;
    const dy = event.clientY - drag.pointerY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTransform((current) => ({
      ...current,
      x: drag.originX + dx * VIEW_SIZE / rect.width,
      y: drag.originY + dy * VIEW_SIZE / rect.height,
    }));
  }

  function hitTest(clientX: number, clientY: number): PositionedConcept | undefined {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return undefined;
    const rect = canvas.getBoundingClientRect();
    const screenX = (clientX - rect.left) * VIEW_SIZE / rect.width;
    const screenY = (clientY - rect.top) * VIEW_SIZE / rect.height;
    const mapX = (screenX - transform.x) / transform.scale;
    const mapY = (screenY - transform.y) / transform.scale;
    const displayScale = Math.min(rect.width, rect.height) / VIEW_SIZE * transform.scale;
    let nearest: PositionedConcept | undefined;
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

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      const concept = hitTest(event.clientX, event.clientY);
      if (concept) onSelectConcept(concept.id);
    }
  }

  function selectConcept(id: string) {
    onSelectConcept(id);
    const index = positioned.findIndex((concept) => concept.id === id);
    if (index >= 0) setListPage(Math.floor(index / LIST_PAGE_SIZE));
  }

  return (
    <section className="whitespace-map" aria-label="Research concept map">
      <div className="whitespace-map__toolbar">
        {placeholder && <span className="whitespace-placeholder-tag">Placeholder data</span>}
        <div className="whitespace-map__zoom" role="group" aria-label="Map controls">
          <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setTransform(DEFAULT_TRANSFORM)}>Reset view</button>
        </div>
      </div>

      {!positioned.length ? (
        <div className="whitespace-map__empty" role="status">
          <strong>No concepts are available for this year.</strong>
          <span>Choose another snapshot origin to explore the map.</span>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="whitespace-map__canvas"
          aria-hidden="true"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
        />
      )}

      <p className="whitespace-map__note">
        The map shows {positioned.length.toLocaleString("en-GB")} concepts. Use the complete keyboard-accessible list below to select one. Map distance is a 2D projection, not a definitive measure of research similarity.
      </p>
      <div className="whitespace-map__legend" role="group" aria-label="Map legend">
        <span className="whitespace-map__legend-scale">
          Colour = 3-year paper growth:
          {GROWTH_STEPS.map((step) => (
            <span key={step.label} className="whitespace-map__legend-step">
              <i style={{ background: step.color }} aria-hidden="true" />
              {step.label}
            </span>
          ))}
        </span>
        <span>Circle size = paper count</span>
        <span><i className="whitespace-map__legend-dash" aria-hidden="true" /> Predicted link (placeholder P)</span>
      </div>

      <details className="whitespace-map__browse">
        <summary>Browse all {positioned.length.toLocaleString("en-GB")} concepts</summary>
        <div className="whitespace-map__browse-status" role="status" aria-live="polite">
          Showing {positioned.length ? pageStart + 1 : 0}–{Math.min(pageStart + LIST_PAGE_SIZE, positioned.length)} of {positioned.length} concepts
        </div>
        <ul className="whitespace-map__concept-list">
          {pageConcepts.map((concept) => (
            <li key={concept.id}>
              <button
                type="button"
                aria-pressed={selectedConceptId === concept.id}
                aria-label={nodeDescription(concept)}
                onClick={() => selectConcept(concept.id)}
              >
                <span>{concept.label}</span>
                <span className="whitespace-map__concept-meta">
                  {concept.paper_count === undefined ? "Papers n/a" : `${concept.paper_count.toLocaleString("en-GB")} papers`}
                  {concept.growth === null ? " · growth n/a" : ` · ${concept.growth >= 0 ? "+" : ""}${(concept.growth * 100).toFixed(1)}%`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <nav className="whitespace-map__pagination" aria-label="Concept list pages">
          <button type="button" disabled={listPage <= 0} onClick={() => setListPage((page) => Math.max(0, page - 1))}>Previous</button>
          <span>Page {Math.min(listPage + 1, pageCount)} of {pageCount}</span>
          <button type="button" disabled={listPage + 1 >= pageCount} onClick={() => setListPage((page) => Math.min(pageCount - 1, page + 1))}>Next</button>
        </nav>
      </details>
    </section>
  );
}
