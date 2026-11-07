import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
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

const VIEW_SIZE = 960;
const MAP_MIN = 42;
const MAP_MAX = VIEW_SIZE - 42;
const DEFAULT_TRANSFORM: ViewTransform = { x: 0, y: 0, scale: 1 };

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
  if (growth === null) return "#718096";
  if (growth > 0) return "#2864b4";
  if (growth < 0) return "#b6533b";
  return "#718096";
}

export function MapCanvas({
  concepts,
  edges,
  selectedConceptId,
  focus,
  placeholder,
  onSelectConcept,
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const [transform, setTransform] = useState<ViewTransform>(DEFAULT_TRANSFORM);
  const [activeIndex, setActiveIndex] = useState(0);

  const extents = useMemo(
    () => {
      const x = extent(concepts.map((concept) => concept.x));
      const y = extent(concepts.map((concept) => concept.y));
      return {
        xCenter: (x[0] + x[1]) / 2,
        yCenter: (y[0] + y[1]) / 2,
        range: Math.max(x[1] - x[0], y[1] - y[0]),
      };
    },
    [concepts],
  );
  const positioned = useMemo(
    () => concepts.map((concept) => ({
      ...concept,
      mapX: VIEW_SIZE / 2 + ((concept.x - extents.xCenter) / extents.range) * (MAP_MAX - MAP_MIN),
      mapY: VIEW_SIZE / 2 - ((concept.y - extents.yCenter) / extents.range) * (MAP_MAX - MAP_MIN),
    })),
    [concepts, extents],
  );
  const byId = useMemo(() => new Map(positioned.map((concept) => [concept.id, concept])), [positioned]);

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

  useEffect(() => {
    if (activeIndex >= concepts.length) setActiveIndex(Math.max(0, concepts.length - 1));
  }, [activeIndex, concepts.length]);

  const zoom = (factor: number) => {
    setTransform((current) => {
      const scale = Math.max(0.6, Math.min(5, current.scale * factor));
      const ratio = scale / current.scale;
      return {
        scale,
        x: VIEW_SIZE / 2 - (VIEW_SIZE / 2 - current.x) * ratio,
        y: VIEW_SIZE / 2 - (VIEW_SIZE / 2 - current.y) * ratio,
      };
    });
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-map-node='true']")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleFactor = VIEW_SIZE / bounds.width;
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    svgRef.current?.setAttribute("data-drag-scale", String(scaleFactor));
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const scaleFactor = Number(svgRef.current?.getAttribute("data-drag-scale") ?? 1);
    const drag = dragRef.current;
    setTransform((current) => ({
      ...current,
      x: drag.originX + (event.clientX - drag.pointerX) * scaleFactor,
      y: drag.originY + (event.clientY - drag.pointerY) * scaleFactor,
    }));
  };

  const finishDrag = () => {
    dragRef.current = null;
  };

  const handleNodeKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(concepts.length - 1, index + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      requestAnimationFrame(() => svgRef.current?.querySelector<SVGGElement>(`[data-node-index="${nextIndex}"]`)?.focus());
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectConcept(concepts[index].id);
    }
  };

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

      {!concepts.length ? (
        <div className="whitespace-map__empty" role="status">
          <strong>No concepts are available for this year.</strong>
          <span>Choose another snapshot origin to explore the map.</span>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="whitespace-map__canvas"
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          role="group"
          aria-label={`Research map with ${concepts.length} concepts. Drag to pan and use the mouse wheel or zoom buttons to zoom.`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {edges.map((edge) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.mapX}
                  y1={source.mapY}
                  x2={target.mapX}
                  y2={target.mapY}
                  className="whitespace-map__edge"
                  strokeOpacity={Math.max(0.18, Math.min(0.8, edge.p_link))}
                />
              );
            })}
            {positioned.map((concept, index) => (
              <g
                key={concept.id}
                data-map-node="true"
                data-node-index={index}
                role="button"
                tabIndex={activeIndex === index ? 0 : -1}
                aria-label={`${concept.label}; ${concept.paper_count ?? "paper count unavailable"} papers; ${concept.growth === null ? "growth unavailable" : `growth ${concept.growth}`}`}
                aria-pressed={selectedConceptId === concept.id}
                onFocus={() => setActiveIndex(index)}
                onClick={() => onSelectConcept(concept.id)}
                onKeyDown={(event) => handleNodeKeyDown(event, index)}
              >
                <circle
                  cx={concept.mapX}
                  cy={concept.mapY}
                  r={nodeRadius(concept.paper_count ?? 0)}
                  fill={growthColor(concept.growth)}
                  className={selectedConceptId === concept.id ? "whitespace-map__node whitespace-map__node--selected" : "whitespace-map__node"}
                />
                <circle cx={concept.mapX} cy={concept.mapY} r={Math.max(12, nodeRadius(concept.paper_count ?? 0) + 5)} className="whitespace-map__hit-area" />
              </g>
            ))}
          </g>
        </svg>
      )}

      <div className="whitespace-map__legend" role="group" aria-label="Map legend">
        <span><i className="whitespace-map__legend-dot whitespace-map__legend-dot--up" /> Growing</span>
        <span><i className="whitespace-map__legend-dot whitespace-map__legend-dot--flat" /> No change or unavailable</span>
        <span><i className="whitespace-map__legend-dot whitespace-map__legend-dot--down" /> Declining</span>
        <span>Circle size = paper count</span>
      </div>
      <p className="whitespace-map__note">Map distance is a 2D projection, not a definitive measure of research similarity.</p>
    </section>
  );
}
