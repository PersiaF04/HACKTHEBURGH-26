import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { ConceptPoint, PredictedEdge } from "../api";
import "./map.css";

type MapFocus = { x: number; y: number } | null;
/** Additive optional field: a concept may carry a research-area name used for area labels. */
type MapConcept = ConceptPoint & { area?: string };
type LinkedEdge = { source: string; target: string };
type MapCanvasProps = {
  concepts: MapConcept[];
  edges: PredictedEdge[];
  selectedConceptId: string | null;
  focus: MapFocus;
  placeholder?: boolean;
  onSelectConcept: (id: string) => void;
  /** Optional observed links (3+ shared papers), drawn as solid grey lines. Absent from the current export. */
  linkedEdges?: LinkedEdge[];
  /** Optional: hide predicted links (the "Show predicted links" filter). Defaults to true. */
  showPredicted?: boolean;
  /** Optional: show the research-area labels. Defaults to true. */
  showAreaLabels?: boolean;
};
type View = { cx: number; cy: number; scale: number };
type Size = { width: number; height: number };
type DragState = { pointerX: number; pointerY: number; cx: number; cy: number; moved: boolean };
type Node = { id: string; wx: number; wy: number; r: number; color: number; papers: number; label: string; area?: string };

const VIEW_SIZE = 960;
const MAP_MIN = 48;
const MAP_MAX = VIEW_SIZE - 48;
const LIST_PAGE_SIZE = 50;
const MIN_SCALE = 0.6;
const MAX_SCALE = 12;
const DEFAULT_VIEW: View = { cx: VIEW_SIZE / 2, cy: VIEW_SIZE / 2, scale: 1 };
const GRID_CELL = 20;
const MAX_LABELS = 60;
const FONT_SANS = "'IBM Plex Sans', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

const GROWTH_STEPS = [
  { color: "#C3C7CF", label: "Shrinking" },
  { color: "#F0C9A0", label: "0 to 15%" },
  { color: "#EDA060", label: "15 to 30%" },
  { color: "#E07432", label: "30 to 45%" },
  { color: "#BF4A0E", label: "45% or more" },
] as const;
const UNKNOWN_COLOR = "#9AA0AA";
/** Bucket index 0..4 for GROWTH_STEPS, 5 for unknown growth. */
const COLORS: string[] = [...GROWTH_STEPS.map((step) => step.color), UNKNOWN_COLOR];

function extent(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  let low = Infinity;
  let high = -Infinity;
  for (const v of values) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  return low === high ? [low - 0.5, high + 0.5] : [low, high];
}

function nodeRadius(paperCount: number): number {
  return Math.max(2.2, Math.min(12, Math.sqrt(Math.max(0, paperCount)) * 0.45));
}

function growthBucket(growth: number | null): number {
  if (growth === null || Number.isNaN(growth)) return 5;
  if (growth < 0) return 0;
  if (growth < 0.15) return 1;
  if (growth < 0.3) return 2;
  if (growth < 0.45) return 3;
  return 4;
}

function nodeDescription(concept: ConceptPoint): string {
  const papers = typeof concept.paper_count === "number"
    ? `${concept.paper_count.toLocaleString("en-GB")} papers`
    : "paper count unavailable";
  const growth = concept.growth === null ? "growth unavailable" : `growth ${(concept.growth * 100).toFixed(1)}%`;
  return `${concept.label}; ${papers}; ${growth}`;
}

/** Marker radius on screen: grows gently with zoom so dense maps stay legible. */
function screenRadius(r: number, scale: number): number {
  return r * Math.min(2.4, 0.55 + 0.45 * scale);
}

export function MapCanvas({
  concepts, edges, selectedConceptId, focus, onSelectConcept,
  linkedEdges, showPredicted = true, showAreaLabels = true,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewRef = useRef<View>({ ...DEFAULT_VIEW });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const hoverRef = useRef<number>(-1);
  const frameRef = useRef<number>(0);
  const [listPage, setListPage] = useState(0);
  const [hoverText, setHoverText] = useState("");

  const extents = useMemo(() => {
    const x = extent(concepts.map((concept) => concept.x));
    const y = extent(concepts.map((concept) => concept.y));
    return { xCenter: (x[0] + x[1]) / 2, yCenter: (y[0] + y[1]) / 2, xRange: x[1] - x[0], yRange: y[1] - y[0] };
  }, [concepts]);

  const toWorld = useCallback((x: number, y: number): [number, number] => [
    VIEW_SIZE / 2 + ((x - extents.xCenter) / extents.xRange) * (MAP_MAX - MAP_MIN),
    VIEW_SIZE / 2 - ((y - extents.yCenter) / extents.yRange) * (MAP_MAX - MAP_MIN),
  ], [extents]);

  const nodes = useMemo<Node[]>(() => concepts.map((concept) => {
    const [wx, wy] = toWorld(concept.x, concept.y);
    return {
      id: concept.id, wx, wy, r: nodeRadius(concept.paper_count ?? 0), color: growthBucket(concept.growth),
      papers: concept.paper_count ?? 0, label: concept.label, area: concept.area,
    };
  }), [concepts, toWorld]);

  const indexById = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);
  /** Indices by paper count, largest first: label priority order. */
  const labelOrder = useMemo(
    () => nodes.map((_, i) => i).sort((a, b) => nodes[b].papers - nodes[a].papers),
    [nodes],
  );
  /** Uniform grid over world space for hit testing. */
  const grid = useMemo(() => {
    const cells = new Map<number, number[]>();
    nodes.forEach((n, i) => {
      const key = Math.floor(n.wx / GRID_CELL) * 100000 + Math.floor(n.wy / GRID_CELL);
      const bucket = cells.get(key);
      if (bucket) bucket.push(i); else cells.set(key, [i]);
    });
    return cells;
  }, [nodes]);
  const areaCentroids = useMemo(() => {
    const sums = new Map<string, { x: number; y: number; n: number }>();
    for (const n of nodes) {
      if (!n.area) continue;
      const s = sums.get(n.area) ?? { x: 0, y: 0, n: 0 };
      s.x += n.wx; s.y += n.wy; s.n += 1;
      sums.set(n.area, s);
    }
    return [...sums].map(([name, s]) => ({ name, x: s.x / s.n, y: s.y / s.n }));
  }, [nodes]);
  const linked = useMemo(() => {
    const out: Array<readonly [number, number]> = [];
    for (const e of linkedEdges ?? []) {
      const a = indexById.get(e.source);
      const b = indexById.get(e.target);
      if (a !== undefined && b !== undefined) out.push([a, b]);
    }
    return out;
  }, [linkedEdges, indexById]);
  const predicted = useMemo(() => {
    const out: Array<{ a: number; b: number; p: number }> = [];
    for (const e of edges) {
      const a = indexById.get(e.source);
      const b = indexById.get(e.target);
      if (a !== undefined && b !== undefined) out.push({ a, b, p: e.p_link });
    }
    return out;
  }, [edges, indexById]);
  const topPredicted = useMemo(() => [...predicted].sort((x, y) => y.p - x.p).slice(0, 3), [predicted]);

  const pageCount = Math.max(1, Math.ceil(concepts.length / LIST_PAGE_SIZE));
  const pageStart = Math.min(listPage, pageCount - 1) * LIST_PAGE_SIZE;
  const pageConcepts = concepts.slice(pageStart, pageStart + LIST_PAGE_SIZE);

  const scene = useRef({ nodes, linked, predicted, topPredicted, areaCentroids, selectedConceptId, showPredicted, showAreaLabels, labelOrder, indexById });
  scene.current = { nodes, linked, predicted, topPredicted, areaCentroids, selectedConceptId, showPredicted, showAreaLabels, labelOrder, indexById };

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const { width, height } = sizeRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = scene.current;
    const view = viewRef.current;
    const ratio = window.devicePixelRatio || 1;
    const targetW = Math.round(width * ratio);
    const targetH = Math.round(height * ratio);
    if (canvas.width !== targetW || canvas.height !== targetH) { canvas.width = targetW; canvas.height = targetH; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const kx = (width / VIEW_SIZE) * view.scale;
    const ky = (height / VIEW_SIZE) * view.scale;
    const sx = (wx: number) => width / 2 + (wx - view.cx) * kx;
    const sy = (wy: number) => height / 2 + (wy - view.cy) * ky;
    const selIdx = s.selectedConceptId ? s.indexById.get(s.selectedConceptId) ?? -1 : -1;
    const hoverIdx = hoverRef.current;
    const margin = 14;
    const inView = (x: number, y: number) => x > -margin && y > -margin && x < width + margin && y < height + margin;

    // Observed links: one batched path.
    if (s.linked.length) {
      ctx.beginPath();
      for (const [a, b] of s.linked) {
        const na = s.nodes[a], nb = s.nodes[b];
        const ax = sx(na.wx), ay = sy(na.wy), bx = sx(nb.wx), by = sy(nb.wy);
        if ((ax < 0 && bx < 0) || (ay < 0 && by < 0) || (ax > width && bx > width) || (ay > height && by > height)) continue;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#D3D5DA";
      ctx.stroke();
      if (selIdx >= 0) {
        ctx.beginPath();
        for (const [a, b] of s.linked) {
          if (a !== selIdx && b !== selIdx) continue;
          ctx.moveTo(sx(s.nodes[a].wx), sy(s.nodes[a].wy));
          ctx.lineTo(sx(s.nodes[b].wx), sy(s.nodes[b].wy));
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#15171C";
        ctx.stroke();
      }
    }

    // Predicted links: dashed accent, stronger when more probable.
    if (s.showPredicted && s.predicted.length) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.75;
      for (const e of s.predicted) {
        const na = s.nodes[e.a], nb = s.nodes[e.b];
        ctx.beginPath();
        ctx.moveTo(sx(na.wx), sy(na.wy));
        ctx.lineTo(sx(nb.wx), sy(nb.wy));
        ctx.strokeStyle = `rgba(41, 82, 227, ${Math.max(0.3, Math.min(0.9, e.p))})`;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Nodes batched by colour bucket (one fill per bucket).
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.88;
    for (let bucket = 0; bucket < COLORS.length; bucket += 1) {
      ctx.beginPath();
      let any = false;
      for (const n of s.nodes) {
        if (n.color !== bucket) continue;
        const x = sx(n.wx), y = sy(n.wy);
        if (!inView(x, y)) continue;
        const r = screenRadius(n.r, view.scale);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        any = true;
      }
      if (!any) continue;
      ctx.fillStyle = COLORS[bucket];
      ctx.fill();
      if (s.nodes.length < 2500) ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Hover and selection rings.
    const ring = (i: number, lineWidth: number, gap: number, colour: string) => {
      const n = s.nodes[i];
      if (!n) return;
      ctx.beginPath();
      ctx.arc(sx(n.wx), sy(n.wy), screenRadius(n.r, view.scale) + gap, 0, Math.PI * 2);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = colour;
      ctx.stroke();
    };
    if (hoverIdx >= 0 && hoverIdx !== selIdx) ring(hoverIdx, 1.5, 2, "#5B606B");
    if (selIdx >= 0) {
      ring(selIdx, 2.5, 0, "#15171C");
      ring(selIdx, 1.5, 5, "#15171C");
    }

    // Area labels (fade as the user zooms in).
    ctx.textBaseline = "alphabetic";
    if (s.showAreaLabels && s.areaCentroids.length) {
      ctx.font = `500 12px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(91, 96, 107, ${Math.max(0.35, 1 - (view.scale - 1) * 0.25)})`;
      for (const a of s.areaCentroids) ctx.fillText(a.name, sx(a.x), sy(a.y) - 16);
    }

    // Concept labels with greedy collision control: selected, hovered, then biggest first.
    ctx.textAlign = "left";
    const placed: number[][] = [];
    const tryLabel = (i: number, bold: boolean) => {
      const n = s.nodes[i];
      const x = sx(n.wx), y = sy(n.wy);
      if (!inView(x, y)) return false;
      ctx.font = `${bold ? 600 : 500} 11px ${FONT_SANS}`;
      const textW = ctx.measureText(n.label).width;
      let l = x + screenRadius(n.r, view.scale) + 4;
      if (l + textW > width - 6) l = x - screenRadius(n.r, view.scale) - 4 - textW; // flip to the left near the edge
      const box = [l - 2, y - 7, l + textW + 2, y + 7];
      for (const p of placed) {
        if (box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]) return false;
      }
      placed.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.strokeText(n.label, l, y + 4);
      ctx.fillStyle = "#15171C";
      ctx.fillText(n.label, l, y + 4);
      return true;
    };
    if (selIdx >= 0) tryLabel(selIdx, true);
    if (hoverIdx >= 0 && hoverIdx !== selIdx) tryLabel(hoverIdx, true);
    let count = placed.length;
    let checked = 0;
    for (const i of s.labelOrder) {
      if (count >= MAX_LABELS || checked > 800) break;
      if (i === selIdx || i === hoverIdx) continue;
      checked += 1;
      if (tryLabel(i, false)) count += 1;
    }

    // Probability chips on the strongest predicted links.
    if (s.showPredicted) {
      ctx.font = `500 10.5px ${FONT_MONO}`;
      ctx.textAlign = "center";
      for (const e of s.topPredicted) {
        const na = s.nodes[e.a], nb = s.nodes[e.b];
        const mx = sx((na.wx + nb.wx) / 2), my = sy((na.wy + nb.wy) / 2);
        if (!inView(mx, my)) continue;
        const text = `P ${e.p.toFixed(2)}`;
        const w = ctx.measureText(text).width + 12;
        ctx.fillStyle = "#2952E3";
        ctx.beginPath();
        ctx.roundRect(mx - w / 2, my - 9, w, 18, 4);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(text, mx, my + 4);
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = 0; }, []);

  // Redraw whenever the scene changes.
  useEffect(() => { schedule(); }, [schedule, nodes, linked, predicted, selectedConceptId, showPredicted, showAreaLabels]);

  const hasConcepts = concepts.length > 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      schedule();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [schedule, hasConcepts]);

  useEffect(() => {
    if (!focus || !concepts.length) return;
    const [wx, wy] = toWorld(focus.x, focus.y);
    viewRef.current = { ...viewRef.current, cx: wx, cy: wy };
    schedule();
  }, [focus?.x, focus?.y, concepts.length, toWorld, schedule]);

  useEffect(() => setListPage(0), [concepts]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const { width, height } = sizeRef.current;
    const view = viewRef.current;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
    if (scale === view.scale || width <= 0) return;
    const fitX = width / VIEW_SIZE;
    const fitY = height / VIEW_SIZE;
    const ax = px ?? width / 2;
    const ay = py ?? height / 2;
    // Keep the world point under the anchor fixed.
    const wx = view.cx + (ax - width / 2) / (fitX * view.scale);
    const wy = view.cy + (ay - height / 2) / (fitY * view.scale);
    viewRef.current = { scale, cx: wx - (ax - width / 2) / (fitX * scale), cy: wy - (ay - height / 2) / (fitY * scale) };
    schedule();
  }, [schedule]);

  // Non-passive wheel listener so the page does not scroll while zooming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt, hasConcepts]);

  function hitTest(clientX: number, clientY: number): number {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const { width, height } = sizeRef.current;
    const view = viewRef.current;
    const kx = (width / VIEW_SIZE) * view.scale;
    const ky = (height / VIEW_SIZE) * view.scale;
    const wx = view.cx + (clientX - rect.left - width / 2) / kx;
    const wy = view.cy + (clientY - rect.top - height / 2) / ky;
    const reach = 14 / Math.min(kx, ky) + 12;
    const x0 = Math.floor((wx - reach) / GRID_CELL);
    const x1 = Math.floor((wx + reach) / GRID_CELL);
    const y0 = Math.floor((wy - reach) / GRID_CELL);
    const y1 = Math.floor((wy + reach) / GRID_CELL);
    let best = -1;
    let bestDist = Infinity;
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gy = y0; gy <= y1; gy += 1) {
        const bucket = grid.get(gx * 100000 + gy);
        if (!bucket) continue;
        for (const i of bucket) {
          const n = nodes[i];
          const dist = Math.hypot((n.wx - wx) * kx, (n.wy - wy) * ky);
          if (dist <= Math.max(10, screenRadius(n.r, view.scale) + 3) && dist < bestDist) {
            best = i;
            bestDist = dist;
          }
        }
      }
    }
    return best;
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerX: event.clientX, pointerY: event.clientY, cx: viewRef.current.cx, cy: viewRef.current.cy, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) {
      const index = hitTest(event.clientX, event.clientY);
      if (index !== hoverRef.current) {
        hoverRef.current = index;
        event.currentTarget.style.cursor = index >= 0 ? "pointer" : "";
        setHoverText(index >= 0 ? nodeDescription(concepts[index]) : "");
        schedule();
      }
      return;
    }
    const dx = event.clientX - drag.pointerX;
    const dy = event.clientY - drag.pointerY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const { width, height } = sizeRef.current;
    const kx = (width / VIEW_SIZE) * viewRef.current.scale;
    const ky = (height / VIEW_SIZE) * viewRef.current.scale;
    viewRef.current = { ...viewRef.current, cx: drag.cx - dx / kx, cy: drag.cy - dy / ky };
    schedule();
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      const index = hitTest(event.clientX, event.clientY);
      if (index >= 0) onSelectConcept(nodes[index].id);
    }
  }

  function resetView() {
    viewRef.current = { ...DEFAULT_VIEW };
    schedule();
  }

  function selectConcept(id: string) {
    onSelectConcept(id);
    const index = concepts.findIndex((concept) => concept.id === id);
    if (index >= 0) setListPage(Math.floor(index / LIST_PAGE_SIZE));
  }

  const hasLinked = (linkedEdges?.length ?? 0) > 0;
  const iconProps = { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true } as const;

  return (
    <section className="whitespace-map" aria-label="Research concept map">
      <div className="whitespace-map__stage">
        {!concepts.length ? (
          <div className="whitespace-map__empty" role="status">No concepts to show</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="whitespace-map__canvas"
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              if (hoverRef.current >= 0) {
                hoverRef.current = -1;
                setHoverText("");
                schedule();
              }
            }}
            onPointerCancel={() => { dragRef.current = null; }}
          />
        )}
        {hoverText && <div className="whitespace-map__hover" aria-hidden="true">{hoverText}</div>}
        <div className="whitespace-map__zoom" role="group" aria-label="Map controls">
          <button type="button" onClick={() => zoomAt(1.25)} aria-label="Zoom in"><svg {...iconProps}><path d="M7 2v10M2 7h10" stroke="#15171C" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
          <button type="button" onClick={() => zoomAt(0.8)} aria-label="Zoom out"><svg {...iconProps}><path d="M2 7h10" stroke="#15171C" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
          <button type="button" onClick={resetView} aria-label="Reset view"><svg {...iconProps}><rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke="#15171C" strokeWidth="1.5" /></svg></button>
        </div>
      </div>

      <div className="whitespace-map__legend" role="group" aria-label="Legend">
        <span className="whitespace-map__legend-scale">
          <span>Shrinking</span>
          <span className="whitespace-map__legend-swatches">
            {GROWTH_STEPS.map((step) => (
              <i key={step.label} style={{ background: step.color }} aria-hidden="true" />
            ))}
          </span>
          <span>Fast-growing</span>
          <span className="whitespace-map__legend-sub">{"\u00b7"} colour = 3-yr paper growth</span>
        </span>
        <span>
          <span className="whitespace-map__legend-sizes" aria-hidden="true">
            <i style={{ width: 6, height: 6 }} /><i style={{ width: 11, height: 11 }} /><i style={{ width: 17, height: 17 }} />
          </span>
          Size = papers
        </span>
        {hasLinked && <span><i className="whitespace-map__legend-solid" aria-hidden="true" />Linked {"\u00b7"} 3+ shared papers</span>}
        <span><i className="whitespace-map__legend-dash" aria-hidden="true" />Predicted link {"\u00b7"} next 3 years</span>
      </div>

      <div className="whitespace-map__browse">
        <h2>Concepts</h2>
        <ul className="whitespace-map__concept-list">
          {pageConcepts.map((concept) => (
            <li key={concept.id}>
              <button
                type="button"
                aria-pressed={selectedConceptId === concept.id}
                aria-label={nodeDescription(concept)}
                onClick={() => selectConcept(concept.id)}
              >
                {concept.label}
              </button>
            </li>
          ))}
        </ul>
        <nav aria-label="Concept list pages">
          <button type="button" disabled={listPage <= 0} onClick={() => setListPage((page) => Math.max(0, page - 1))}>Previous</button>
          <span>Page {Math.min(listPage + 1, pageCount)} of {pageCount}</span>
          <button type="button" disabled={listPage + 1 >= pageCount} onClick={() => setListPage((page) => Math.min(pageCount - 1, page + 1))}>Next</button>
        </nav>
      </div>
    </section>
  );
}
