import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ConceptPoint, PredictedEdge } from "../api";
import { fmtGrowth, fmtInt, fmtP, fmtText } from "../lib/format";
import type { NodeKind, StructureEdge } from "../lib/hierarchy";
import { readMapTheme } from "../lib/mapTheme";
import { useTheme } from "../lib/useTheme";
import "./map3d.css";

type MapFocus = { x: number; y: number } | null;
type MapConcept = ConceptPoint & { area?: string; kind?: NodeKind; branch?: string; ends?: [string, string]; scale?: number; heat?: number; strength?: number; gapEnd?: boolean };
type LinkedEdge = { source: string; target: string };

export type MapCanvas3DProps = {
  concepts: MapConcept[];
  /** Unfiltered concepts of the current year. Bounds and area offsets come from these, so filtering never rescales the cloud. */
  allConcepts?: MapConcept[];
  /** The camera resets on first data and when this changes (the selected year), never on a filter change. */
  resetKey?: string | number;
  edges: PredictedEdge[];
  selectedConceptId: string | null;
  focus: MapFocus;
  /** Explicit "go to this concept" request (search, panel link). Each new tick flies the camera to the concept. */
  focusRequest?: { id: string; tick: number } | null;
  placeholder: boolean;
  onSelectConcept: (id: string) => void;
  linkedEdges?: LinkedEdge[];
  /** Branch splits, branch-to-concept and hypothesis links. Drawn as solid lines of three weights. */
  structure?: StructureEdge[];
  showPredicted?: boolean;
  showAreaLabels?: boolean;
  /** Called once if WebGL cannot be created, so the host can report unavailable 3D. */
  onUnsupported?: () => void;
};

const SPAN_XY = 140; // x,y mapped into [-70, 70] for more room between clusters
const SPAN_Z = 64; // z mapped into [-32, 32]
const FOV = 45;
const MAX_LABELS = 30;
const HOME = new THREE.Vector3(0, -150, 105);
const TARGET = new THREE.Vector3(0, 0, 0);
const TOP_DOWN = new THREE.Vector3(0, -1, 185);
const FRONT_ON = new THREE.Vector3(0, -185, 8);
const HELP = "Drag to orbit around the centre, scroll or pinch to zoom, then click a node for details. Use Top and Front to orient the map.";
type CameraView = "top" | "front" | "overview";

function growthBucket(g: number | null): number {
  if (g === null || g === undefined || Number.isNaN(g)) return 5;
  if (g < 0) return 0;
  if (g < 0.15) return 1;
  if (g < 0.3) return 2;
  if (g < 0.45) return 3;
  return 4;
}

function describe(c: ConceptPoint & { kind?: NodeKind }): string {
  if (c.kind === "branch") return `Branch: ${fmtText(c.label)}; click for its subtopics`;
  if (c.kind === "hypothesis") return `Predicted gap: ${fmtText(c.label)}; click for details`;
  return `${fmtText(c.label)}; papers ${fmtInt(c.paper_count)}; 3-yr growth ${fmtGrowth(c.growth)}`;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aHeat;
uniform float uScale;
varying vec3 vColor;
varying float vHeat;
void main() {
  vColor = aColor;
  vHeat = aHeat;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(3.0, aSize * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vHeat;
uniform vec3 uRim;
uniform float uHeatmap;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float rim = smoothstep(0.40, 0.48, d);
  vec3 cold = vec3(0.12, 0.35, 0.76);
  vec3 warm = vec3(0.96, 0.22, 0.08);
  vec3 base = mix(vColor, mix(cold, warm, vHeat), uHeatmap);
  gl_FragColor = vec4(mix(base, uRim, rim * 0.85), 1.0);
}`;

type Scene3D = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  requestRender: () => void;
  resetView: () => void;
  setCameraView: (view: CameraView) => void;
  setHeatmap: (enabled: boolean) => void;
  zoom: (factor: number) => void;
  rotate: (dAzimuth: number, dPolar: number) => void;
  setData: () => void;
  applyTheme: () => void;
  setLines: () => void;
  /** Move the orbit target to a concept; animated unless `instant` or reduced motion. */
  flyTo: (index: number, instant: boolean) => void;
  /** Whether this engine has had its first focus yet. */
  focused: boolean;
};

type Flight = { t0: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromO: THREE.Vector3; toO: THREE.Vector3 };

export function MapCanvas3D({
  concepts, allConcepts, resetKey, edges, selectedConceptId, focus, focusRequest, placeholder, onSelectConcept,
  linkedEdges, structure, showPredicted = true, showAreaLabels = true, onUnsupported,
}: MapCanvas3DProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Scene3D | null>(null);
  const hoverRef = useRef(-1);
  const [unsupported, setUnsupported] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [hoverText, setHoverText] = useState("");
  const { theme } = useTheme();

  // Layout from the UNFILTERED set: bounds, z scale and area offsets are fixed per year, so a filter only hides dots.
  const base = allConcepts ?? concepts;
  const layout = useMemo(() => {
    const all = base;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const c of all) {
      if (c.x < xmin) xmin = c.x; if (c.x > xmax) xmax = c.x;
      if (c.y < ymin) ymin = c.y; if (c.y > ymax) ymax = c.y;
    }
    const range = Math.max(xmax - xmin, ymax - ymin) || 1;
    const xc = (xmin + xmax) / 2, yc = (ymin + ymax) / 2;
    // z scale: 95th percentile of |growth| so a few outliers do not flatten everything.
    const mags = all.filter((c) => c.growth !== null && !Number.isNaN(c.growth)).map((c) => Math.abs(c.growth as number)).sort((a, b) => a - b);
    const zRef = Math.max(0.05, mags.length ? mags[Math.floor(mags.length * 0.95)] ?? mags[mags.length - 1] : 0.05);
    const pos = new Float32Array(all.length * 3);
    all.forEach((c, i) => {
      const g = c.growth === null || c.growth === undefined || Number.isNaN(c.growth) ? 0 : c.growth;
      pos[i * 3] = ((c.x - xc) / range) * SPAN_XY;
      pos[i * 3 + 1] = ((c.y - yc) / range) * SPAN_XY;
      pos[i * 3 + 2] = Math.max(-1, Math.min(1, g / zRef)) * (SPAN_Z / 2);
    });
    // Preserve each area's internal geometry, but make the largest named areas visually distinct.
    // This is a navigation layout aid; node height and colour still come from the observed growth data.
    const areaGroups = new Map<string, { indices: number[]; x: number; y: number }>();
    all.forEach((concept, i) => {
      if (!concept.area) return;
      const group = areaGroups.get(concept.area) ?? { indices: [], x: 0, y: 0 };
      group.indices.push(i);
      group.x += pos[i * 3]; group.y += pos[i * 3 + 1];
      areaGroups.set(concept.area, group);
    });
    const rankedAreas = [...areaGroups.entries()]
      .map(([name, group]) => ({ name, group, x: group.x / group.indices.length, y: group.y / group.indices.length }))
      .sort((a, b) => b.group.indices.length - a.group.indices.length);
    const majorCount = Math.min(5, Math.max(0, Math.ceil(Math.sqrt(rankedAreas.length))));
    rankedAreas.forEach((area, rank) => {
      const major = rank < majorCount;
      const angle = major ? (Math.PI * 2 * rank) / Math.max(1, majorCount) - Math.PI / 2 : Math.atan2(area.y, area.x);
      const radius = major ? SPAN_XY * 0.42 : Math.min(SPAN_XY * 0.22, Math.hypot(area.x, area.y) * 0.62);
      const targetX = Math.cos(angle) * radius;
      const targetY = Math.sin(angle) * radius;
      for (const i of area.group.indices) {
        pos[i * 3] += targetX - area.x;
        pos[i * 3 + 1] += targetY - area.y;
      }
    });
    const center = new THREE.Vector3();
    for (let i = 0; i < all.length; i += 1) center.add(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    if (all.length > 0) center.multiplyScalar(1 / all.length);
    return { pos, slot: new Map(all.map((c, i) => [c.id, i])), zRef, center };
  }, [base]);

  // Geometry-level derived data: world positions (looked up from the fixed layout), sizes, colour buckets.
  const data = useMemo(() => {
    const n = concepts.length;
    const { zRef } = layout;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const heat = new Float32Array(n);
    const bucket = new Uint8Array(n);
    const tmp = new THREE.Color();
    const themeHues = readMapTheme();
    const palette = themeHues.growth;
    const pmax = Math.max(1, ...concepts.filter((c) => c.kind !== "branch" && c.kind !== "hypothesis").map((c) => c.paper_count ?? 0));
    concepts.forEach((c, i) => {
      const k = (layout.slot.get(c.id) ?? 0) * 3;
      pos[i * 3] = layout.pos[k]; pos[i * 3 + 1] = layout.pos[k + 1]; pos[i * 3 + 2] = layout.pos[k + 2];
      const g = c.growth === null || c.growth === undefined || Number.isNaN(c.growth) ? 0 : c.growth;
      heat[i] = c.heat !== undefined ? c.heat : Math.max(0, Math.min(1, (g / zRef + 1) / 2));
      // Dot area is proportional to papers (diameter to its square root), scaled to the biggest concept drawn.
      size[i] = 1.0 + 2.4 * Math.sqrt(Math.max(0, c.paper_count ?? 0) / pmax); // world diameter
      const b = growthBucket(c.growth);
      bucket[i] = b;
      if (c.scale) size[i] *= c.scale;
      if (c.kind === "branch") size[i] = 6.2;
      else if (c.kind === "hypothesis") size[i] = 1.8 + 2.4 * (c.strength ?? 0.5);
      else if (c.gapEnd) size[i] = Math.max(size[i] * 1.8, 1.6);
      const hue = c.kind === "branch" ? themeHues.ink : c.kind === "hypothesis" ? themeHues.accent : palette[b];
      tmp.set(hue).convertLinearToSRGB(); // shader writes raw values
      color[i * 3] = tmp.r; color[i * 3 + 1] = tmp.g; color[i * 3 + 2] = tmp.b;
    });
    const indexById = new Map(concepts.map((c, i) => [c.id, i]));
    // Branch drift: each branch (hub plus its concepts) floats gently; a hypothesis follows the mean of its two branches.
    const groupIds = [...new Set(concepts.map((c) => c.branch).filter((b): b is string => !!b))];
    const groupOf = new Map(groupIds.map((g, k) => [g, k]));
    const group = Int16Array.from(concepts, (c) => (c.branch ? groupOf.get(c.branch) ?? -1 : -1));
    const ends = Int16Array.from(concepts.flatMap((c) => (c.ends ? c.ends.map((e) => groupOf.get(e) ?? -1) : [-1, -1])));
    const base = pos.slice();
    const rank = (c: MapConcept) => (c.gapEnd || c.kind === "hypothesis" ? 1e12 : c.kind === "branch" ? 1e11 : c.paper_count ?? 0);
    const labelOrder = concepts.map((_, i) => i).sort((a, b) => rank(concepts[b]) - rank(concepts[a]));
    const sums = new Map<string, { x: number; y: number; z: number; n: number }>();
    concepts.forEach((c, i) => {
      if (!c.area) return;
      const s = sums.get(c.area) ?? { x: 0, y: 0, z: 0, n: 0 };
      s.x += pos[i * 3]; s.y += pos[i * 3 + 1]; s.z += pos[i * 3 + 2]; s.n += 1;
      sums.set(c.area, s);
    });
    const areas = [...sums].map(([name, s]) => ({ name, v: new THREE.Vector3(s.x / s.n, s.y / s.n, s.z / s.n) }));
    const center = layout.center;
    return { n, pos, size, color, heat, bucket, indexById, labelOrder, areas, center, group, groupCount: groupIds.length, ends, base };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, layout, theme]);

  // Latest props for the render loop (no re-creation of the engine).
  const live = useRef({ resetKey, data, concepts, edges, linkedEdges, structure, selectedConceptId, showPredicted, showAreaLabels, onSelectConcept });
  live.current = { resetKey, data, concepts, edges, linkedEdges, structure, selectedConceptId, showPredicted, showAreaLabels, onSelectConcept };

  // Engine: renderer, camera, controls, picking, overlay. Created once per mount.
  useEffect(() => {
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!stage || !overlay) return undefined;
    // The canvas is created here and removed in cleanup. Reusing one canvas across a StrictMode
    // remount would hand the second renderer a context that forceContextLoss() already killed.
    const canvas = document.createElement("canvas");
    canvas.className = "ws3d__canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.insertBefore(canvas, stage.firstChild);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      if (!renderer.getContext()) throw new Error("no context");
    } catch {
      canvas.remove();
      setUnsupported(true);
      onUnsupported?.();
      return undefined;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    renderer.setClearColor(new THREE.Color(readMapTheme().mapBg), 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.copy(HOME);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(TARGET);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.8;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minDistance = 8;
    controls.maxDistance = 400;
    controls.zoomSpeed = 0.8;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.update();

    // Labels pool and rings, built once.
    const mk = (cls: string, count: number) => Array.from({ length: count }, () => {
      const el = document.createElement("div");
      el.className = cls;
      overlay.appendChild(el);
      return el;
    });
    const labelEls = mk("ws3d__label", MAX_LABELS + 2);
    const areaEls = mk("ws3d__area", 16);
    const chipEls = mk("ws3d__chip", 3);
    const hoverRing = mk("ws3d__ring ws3d__ring--hover", 1)[0];
    const selRing = mk("ws3d__ring ws3d__ring--sel", 1)[0];

    // Persistent point cloud, rebuilt when data changes.
    const pointsMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 1 }, uRim: { value: new THREE.Vector3(1, 1, 1) }, uHeatmap: { value: 0 } },
    });
    let points: THREE.Points | null = null;
    let edgeLines: THREE.LineSegments | null = null;
    let linkLines: THREE.LineSegments | null = null;
    const structLines: Array<THREE.LineSegments | null> = [null, null, null];
    let lineSets: Array<{ geom: THREE.BufferGeometry; arr: Float32Array; pairs: Array<[number, number]> }> = [];
    const splitMat = new THREE.LineBasicMaterial({ color: 0x808080, transparent: true, opacity: 0.95 });
    const memberMat = new THREE.LineBasicMaterial({ color: 0x808080, transparent: true, opacity: 0.28 });
    const hypMat = new THREE.LineBasicMaterial({ color: 0x6b8cff, transparent: true, opacity: 0.8 });
    const edgeMat = new THREE.LineDashedMaterial({ color: 0x6b8cff, dashSize: 1.6, gapSize: 1.0, transparent: true, opacity: 0.85 });
    const linkMat = new THREE.LineBasicMaterial({ color: 0x808080, transparent: true, opacity: 0.6 });

    let width = 0, height = 0;
    let screen = new Float32Array(0); // projected x,y,depth per node (CSS px)
    let projDirty = true;
    let rafId = 0;
    let dirty = true;
    let flight: Flight | null = null;
    const lockPrev = new THREE.Vector3();
    const flightQ = new THREE.Quaternion(), flightId = new THREE.Quaternion(), flightTo = new THREE.Vector3();
    let lockIdx = -1; // node the camera is locked onto; it keeps following it as its branch drifts
    const v = new THREE.Vector3();
    const proj = new THREE.Matrix4();

    const project = () => {
      const { data: d } = live.current;
      if (screen.length !== d.n * 3) screen = new Float32Array(d.n * 3);
      proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const e = proj.elements;
      for (let i = 0; i < d.n; i += 1) {
        const x = d.pos[i * 3], y = d.pos[i * 3 + 1], z = d.pos[i * 3 + 2];
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
        screen[i * 3] = (cx / w * 0.5 + 0.5) * width;
        screen[i * 3 + 1] = (1 - (cy / w * 0.5 + 0.5)) * height;
        screen[i * 3 + 2] = w > 0 ? w : -1; // w = view depth
      }
      projDirty = false;
    };

    const focalPx = () => height / (2 * Math.tan((FOV * Math.PI) / 360)); // CSS px
    const pxSize = (i: number, depth: number) => Math.max(3 / renderer.getPixelRatio(), (live.current.data.size[i] * focalPx()) / depth);

    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.display = "block";
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    const placeRing = (el: HTMLElement, i: number) => {
      const depth = i >= 0 ? screen[i * 3 + 2] : -1;
      if (!(depth > 0)) { el.style.display = "none"; return; }
      const d = Math.max(pxSize(i, depth) + 12, el === selRing ? 34 : 0);
      el.style.display = "block";
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.transform = `translate(${(screen[i * 3] - d / 2).toFixed(1)}px, ${(screen[i * 3 + 1] - d / 2).toFixed(1)}px)`;
    };

    const updateOverlay = () => {
      const s = live.current;
      const d = s.data;
      const selIdx = s.selectedConceptId ? d.indexById.get(s.selectedConceptId) ?? -1 : -1;
      const hov = hoverRef.current;
      if (hov >= 0 && hov !== selIdx) placeRing(hoverRing, hov); else hoverRing.style.display = "none";
      if (selIdx >= 0) placeRing(selRing, selIdx); else selRing.style.display = "none";

      // Concept labels, greedy collision control.
      const placed: number[][] = [];
      const labelled = new Set<number>();
      let used = 0;
      // Free-space test: a label may not touch another node, a connection line or another label.
      const CELL = 40;
      const grid = new Map<number, number[]>();
      for (let j = 0; j < d.n; j += 1) {
        if (screen[j * 3 + 2] <= 0) continue;
        const key = Math.floor(screen[j * 3] / CELL) * 4096 + Math.floor(screen[j * 3 + 1] / CELL);
        const cell = grid.get(key);
        if (cell) cell.push(j); else grid.set(key, [j]);
      }
      const segs: number[][] = [];
      for (const e of s.structure ?? []) {
        const a = d.indexById.get(e.source), b = d.indexById.get(e.target);
        if (a === undefined || b === undefined || screen[a * 3 + 2] <= 0 || screen[b * 3 + 2] <= 0) continue;
        segs.push([screen[a * 3], screen[a * 3 + 1], screen[b * 3], screen[b * 3 + 1], a, b]);
      }
      const segHits = (sg: number[], x0: number, y0: number, x1: number, y1: number) => {
        let t0 = 0, t1 = 1;
        const dx = sg[2] - sg[0], dy = sg[3] - sg[1];
        const p = [-dx, dx, -dy, dy], q = [sg[0] - x0, x1 - sg[0], sg[1] - y0, y1 - sg[1]];
        for (let k = 0; k < 4; k += 1) {
          if (p[k] === 0) { if (q[k] < 0) return false; }
          else { const r = q[k] / p[k]; if (p[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
        }
        return true;
      };
      const free = (self: number, x0: number, y0: number, x1: number, y1: number) => {
        if (x0 < 2 || y0 < 2 || x1 > width - 2 || y1 > height - 2) return false;
        for (const p of placed) if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return false;
        for (let cx = Math.floor((x0 - 8) / CELL); cx <= Math.floor((x1 + 8) / CELL); cx += 1) {
          for (let cy = Math.floor((y0 - 8) / CELL); cy <= Math.floor((y1 + 8) / CELL); cy += 1) {
            for (const j of grid.get(cx * 4096 + cy) ?? []) {
              if (j === self) continue;
              const r = pxSize(j, screen[j * 3 + 2]) / 2 + 1;
              if (screen[j * 3] > x0 - r && screen[j * 3] < x1 + r && screen[j * 3 + 1] > y0 - r && screen[j * 3 + 1] < y1 + r) return false;
            }
          }
        }
        for (const sg of segs) if (sg[4] !== self && sg[5] !== self && segHits(sg, x0, y0, x1, y1)) return false;
        return true;
      };
      const tryLabel = (i: number, strong: boolean, hub = false) => {
        if (used >= labelEls.length || labelled.has(i)) return false;
        const depth = screen[i * 3 + 2];
        const x = screen[i * 3], y = screen[i * 3 + 1];
        if (depth <= 0 || x < -10 || y < -10 || x > width + 10 || y > height + 10) return false;
        const text = fmtText(s.concepts[i].label);
        const w = hub ? text.length * 7.6 + 18 : text.length * 5.8 + 4;
        const h = hub ? 22 : 14;
        const r = pxSize(i, depth) / 2;
        // Candidates: beside the dot first (right, left), then above/below, then further out. Hubs and picked dots may fall back to the first spot.
        const gap = 4;
        const cands: [number, number][] = [];
        for (const extra of [0, 8, 18]) {
          cands.push([x + r + gap + extra, y - h / 2], [x - r - gap - extra - w, y - h / 2],
            [x - w / 2, y - r - gap - extra - h], [x - w / 2, y + r + gap + extra],
            [x + r + gap + extra, y - r - h - extra], [x - r - gap - extra - w, y - r - h - extra],
            [x + r + gap + extra, y + r + extra], [x - r - gap - extra - w, y + r + extra]);
        }
        let spot: [number, number] | null = null;
        for (const c of cands) if (free(i, c[0], c[1], c[0] + w, c[1] + h)) { spot = c; break; }
        if (!spot) {
          if (!strong) return false;
          spot = cands[0];
          if (spot[0] + w > width - 4) spot = cands[1];
        }
        placed.push([spot[0], spot[1], spot[0] + w, spot[1] + h]);
        labelled.add(i);
        const el = labelEls[used++];
        if (el.textContent !== text) el.textContent = text;
        el.classList.toggle("ws3d__label--strong", strong);
        el.classList.toggle("ws3d__label--hub", hub);
        place(el, spot[0], spot[1] + (hub ? 0 : -1));
        return true;
      };
      if (selIdx >= 0) tryLabel(selIdx, true, true); // the picked node is always named first, in the bold chip
      for (let i = 0; i < s.concepts.length; i += 1) if (s.concepts[i].kind === "branch") tryLabel(i, true, true);
      if (hov >= 0 && hov !== selIdx) tryLabel(hov, true);
      let count = used;
      let checked = 0;
      for (const i of d.labelOrder) {
        if (count >= MAX_LABELS || checked > 800) break;
        if (i === selIdx || i === hov) continue;
        checked += 1;
        if (tryLabel(i, false)) count += 1;
      }
      for (let k = used; k < labelEls.length; k += 1) labelEls[k].style.display = "none";

      // Area labels.
      areaEls.forEach((el, k) => {
        const a = s.showAreaLabels ? d.areas[k] : undefined;
        if (!a) { el.style.display = "none"; return; }
        v.copy(a.v).project(camera);
        if (v.z > 1) { el.style.display = "none"; return; }
        if (el.textContent !== a.name) el.textContent = a.name;
        const w = a.name.length * 6.4;
        place(el, (v.x * 0.5 + 0.5) * width - w / 2, (1 - (v.y * 0.5 + 0.5)) * height - 22);
      });

      // P chips on the top three predicted links.
      const top = s.showPredicted
        ? s.edges.map((e) => ({ a: d.indexById.get(e.source), b: d.indexById.get(e.target), p: e.p_link }))
          .filter((e): e is { a: number; b: number; p: number } => e.a !== undefined && e.b !== undefined)
          .sort((p, q) => q.p - p.p).slice(0, 3)
        : [];
      chipEls.forEach((el, k) => {
        const e = top[k];
        if (!e) { el.style.display = "none"; return; }
        v.set(
          (d.pos[e.a * 3] + d.pos[e.b * 3]) / 2,
          (d.pos[e.a * 3 + 1] + d.pos[e.b * 3 + 1]) / 2,
          (d.pos[e.a * 3 + 2] + d.pos[e.b * 3 + 2]) / 2,
        ).project(camera);
        if (v.z > 1) { el.style.display = "none"; return; }
        el.textContent = `P ${fmtP(e.p)}`;
        place(el, (v.x * 0.5 + 0.5) * width - 22, (1 - (v.y * 0.5 + 0.5)) * height - 9);
      });
    };

    const renderNow = () => {
      if (width <= 0 || height <= 0) return;
      pointsMat.uniforms.uScale.value = focalPx() * renderer.getPixelRatio(); // point size is in device px
      renderer.render(scene, camera);
      project();
      updateOverlay();
    };

    // Zooming toward the cursor moves the orbit target; without a guard it can wander off the graph and
    // leave you looking at empty space. Keep the target inside the graph, and drift it back to the centre
    // as you zoom out, panning camera and target together so the view only slides, never turns.
    let prevDist = camera.position.distanceTo(controls.target);
    let boundsFor: unknown = null, boundsR = 100;
    const keepInView = () => {
      const d = live.current.data;
      if (boundsFor !== d) {
        boundsFor = d;
        let r = 20;
        for (let i = 0; i < d.n; i += 1) r = Math.max(r, Math.hypot(d.pos[i * 3] - d.center.x, d.pos[i * 3 + 1] - d.center.y, d.pos[i * 3 + 2] - d.center.z));
        boundsR = r;
      }
      const dist = camera.position.distanceTo(controls.target);
      const off = v.copy(controls.target).sub(d.center);
      const limit = boundsR * 1.05;
      let shift = 0;
      const len = off.length();
      if (dist > prevDist * 1.0005 && len > 0.01) shift = Math.min(len, len * Math.min(0.5, ((dist - prevDist) / dist) * 3)); // zooming out: slide back to the centre
      if (len - shift > limit) shift = len - limit; // never let the target leave the graph
      if (shift > 0) {
        off.setLength(shift);
        controls.target.sub(off);
        camera.position.sub(off);
      }
      prevDist = camera.position.distanceTo(controls.target);
    };

    const loop = (now: number) => {
      rafId = 0;
      let flying = false;
      if (flight) {
        const k = Math.min(1, (now - flight.t0) / flight.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; // ease in and out: starts and settles gently
        controls.target.lerpVectors(flight.fromT, flight.toT, e);
        // Swing round the target on an arc (spherical interpolation) while the distance eases, instead of cutting straight through it.
        const lf = flight.fromO.length(), lt = flight.toO.length();
        flightQ.setFromUnitVectors(v.copy(flight.fromO).normalize(), flightTo.copy(flight.toO).normalize());
        flightId.identity().slerp(flightQ, e);
        v.copy(flight.fromO).normalize().applyQuaternion(flightId).multiplyScalar(lf + (lt - lf) * e);
        camera.position.copy(controls.target).add(v);
        flying = k < 1;
        if (!flying) flight = null;
        dirty = true;
      }
      const moved = controls.update();
      if (moved && !flying) keepInView();
      if (moved || dirty) {
        dirty = false;
        projDirty = true;
        renderNow();
      }
      if (moved || flying) rafId = requestAnimationFrame(loop);
    };
    const requestRender = () => {
      dirty = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    };
    controls.addEventListener("change", requestRender);

    const resize = () => {
      // Size from the canvas itself (not the bordered stage) so pixels, picking and overlay agree.
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // follows browser zoom and monitor changes
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      projDirty = true;
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);

    // Picking: nearest projected node within its pixel radius (no raycast, no per-frame work).
    const hit = (clientX: number, clientY: number, slop = 0): number => {
      if (projDirty) { camera.updateMatrixWorld(); project(); }
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left, py = clientY - rect.top;
      const n = live.current.data.n;
      let best = -1, bestScore = Infinity;
      for (let i = 0; i < n; i += 1) {
        const depth = screen[i * 3 + 2];
        if (depth <= 0) continue;
        const isHub = live.current.concepts[i]?.kind === "branch";
        const reach = Math.max((isHub ? 26 : 12) + slop, pxSize(i, depth) / 2 + 4 + slop);
        const dx = screen[i * 3] - px;
        if (dx > reach || dx < -reach) continue;
        const dy = screen[i * 3 + 1] - py;
        const dist = Math.hypot(dx, dy);
        if (dist <= reach) {
          const score = dist + depth * 0.02 - (isHub ? 14 : 0); // prefer closer to the cursor, then nearer to the camera
          if (score < bestScore) { best = i; bestScore = score; }
        }
      }
      return best;
    };

    // A second finger (pinch) or any drag never counts as a tap; touch taps get a larger hit radius.
    let down: { x: number; y: number; moved: boolean } | null = null;
    const pointers = new Set<number>();
    const onDown = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      const wasMulti = pointers.size > 1;
      down = { x: e.clientX, y: e.clientY, moved: wasMulti };
      flight = null; // the user takes over from any camera flight
      lockIdx = -1;
      if (hoverRef.current >= 0) { hoverRef.current = -1; canvas.style.cursor = ""; setHoverText(""); requestRender(); }
    };
    const onMove = (e: PointerEvent) => {
      if (down) {
        if (pointers.size > 1) down.moved = true;
        else if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) down.moved = true;
        return;
      }
      const i = hit(e.clientX, e.clientY);
      if (i !== hoverRef.current) {
        hoverRef.current = i;
        canvas.style.cursor = i >= 0 ? "pointer" : "";
        setHoverText(i >= 0 ? describe(live.current.concepts[i]) : "");
        requestRender();
      }
    };
    const onUp = (e: PointerEvent) => {
      const d0 = down;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) down = null; else if (down) down.moved = true;
      if (d0 && !d0.moved && e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const i = hit(e.clientX, e.clientY, e.pointerType === "touch" ? 14 : 0);
        if (i >= 0) live.current.onSelectConcept(live.current.concepts[i].id);
      }
    };
    const onCancel = (e: PointerEvent) => { pointers.delete(e.pointerId); down = null; };
    const onLeave = () => {
      if (hoverRef.current >= 0) { hoverRef.current = -1; setHoverText(""); requestRender(); }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);
    const onDouble = (e: MouseEvent) => { if (hit(e.clientX, e.clientY) < 0) resetView(); };
    canvas.addEventListener("dblclick", onDouble);
    // A wheel turn takes over from any camera flight so the two never fight.
    const onWheel = () => { flight = null; };
    canvas.addEventListener("wheel", onWheel, { passive: true });

    const zoom = (factor: number) => {
      flight = null;
      const offset = camera.position.clone().sub(controls.target);
      const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
      camera.position.copy(controls.target).add(offset.setLength(len));
      controls.update();
      requestRender();
    };
    const rotate = (dAz: number, dPol: number) => {
      flight = null;
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0))));
      sph.theta += dAz;
      sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi + dPol));
      offset.setFromSpherical(sph).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), camera.up));
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
      requestRender();
    };
    const resetView = () => {
      flight = null;
      lockIdx = -1;
      const center = live.current.data.center;
      camera.position.copy(center).add(HOME);
      controls.target.copy(center);
      controls.update();
      requestRender();
    };
    const setCameraView = (view: CameraView) => {
      lockIdx = -1;
      if (view === "overview") { resetView(); return; }
      const center = live.current.data.center;
      const direction = (view === "top" ? TOP_DOWN : FRONT_ON).clone().normalize();
      const distance = Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.distanceTo(center)));
      const toO = direction.multiplyScalar(distance);
      if (reduced) {
        flight = null;
        controls.target.copy(center);
        camera.position.copy(center).add(toO);
        controls.update();
        requestRender();
        return;
      }
      flight = { t0: performance.now(), dur: 260, fromT: controls.target.clone(), toT: center.clone(), fromO: camera.position.clone().sub(controls.target), toO };
      requestRender();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = 0.12;
      switch (e.key) {
        case "ArrowLeft": rotate(-step, 0); break;
        case "ArrowRight": rotate(step, 0); break;
        case "ArrowUp": rotate(0, -step); break;
        case "ArrowDown": rotate(0, step); break;
        case "+": case "=": zoom(0.8); break;
        case "-": case "_": zoom(1.25); break;
        case "0": resetView(); break;
        default: return;
      }
      e.preventDefault();
    };
    stage.addEventListener("keydown", onKey);

    const applyTheme = () => {
      const T = readMapTheme();
      renderer.setClearColor(new THREE.Color(T.mapBg), 1);
      edgeMat.color.set(T.accent);
      linkMat.color.set(T.rule);
      splitMat.color.set(T.ink);
      memberMat.color.set(T.muted);
      hypMat.color.set(T.accent);
      const rim = new THREE.Color(T.surface).convertLinearToSRGB(); // shader writes raw values
      (pointsMat.uniforms.uRim.value as THREE.Vector3).set(rim.r, rim.g, rim.b);
      requestRender();
    };
    let viewKey: string | number | undefined;
    let viewSet = false;
    const setData = () => {
      const d = live.current.data;
      if (points) { scene.remove(points); points.geometry.dispose(); points = null; }
      if (d.n) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
        g.setAttribute("aSize", new THREE.BufferAttribute(d.size, 1));
        g.setAttribute("aColor", new THREE.BufferAttribute(d.color, 3));
        g.setAttribute("aHeat", new THREE.BufferAttribute(d.heat, 1));
        g.computeBoundingSphere();
        points = new THREE.Points(g, pointsMat);
        points.frustumCulled = false;
        scene.add(points);
      }
      hoverRef.current = -1;
      projDirty = true;
      // Reset the camera on first data and on a year change only; a filter change keeps the pose.
      if (d.n && (!viewSet || viewKey !== live.current.resetKey)) { resetView(); viewSet = true; viewKey = live.current.resetKey; }
      requestRender();
    };
    const setLines = () => {
      const s = live.current;
      const d = s.data;
      const build = (pairs: Array<[number, number]>, mat: THREE.Material, dashed: boolean) => {
        if (!pairs.length) return null;
        const arr = new Float32Array(pairs.length * 6);
        pairs.forEach(([a, b], k) => {
          arr.set(d.pos.subarray(a * 3, a * 3 + 3), k * 6);
          arr.set(d.pos.subarray(b * 3, b * 3 + 3), k * 6 + 3);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        lineSets.push({ geom: g, arr, pairs });
        const l = new THREE.LineSegments(g, mat);
        l.frustumCulled = false;
        if (dashed) l.computeLineDistances();
        scene.add(l);
        return l;
      };
      lineSets = [];
      for (const l of [edgeLines, linkLines, ...structLines]) if (l) { scene.remove(l); l.geometry.dispose(); }
      const pred: Array<[number, number]> = [];
      if (s.showPredicted) {
        for (const e of s.edges) {
          const a = d.indexById.get(e.source), b = d.indexById.get(e.target);
          if (a !== undefined && b !== undefined) pred.push([a, b]);
        }
      }
      edgeLines = build(pred, edgeMat, true);
      const lk: Array<[number, number]> = [];
      for (const e of s.linkedEdges ?? []) {
        const a = d.indexById.get(e.source), b = d.indexById.get(e.target);
        if (a !== undefined && b !== undefined) lk.push([a, b]);
      }
      linkLines = build(lk, linkMat, false);
      const parts: Record<StructureEdge["kind"], Array<[number, number]>> = { split: [], member: [], hypothesis: [] };
      for (const e of s.structure ?? []) {
        const a = d.indexById.get(e.source), b = d.indexById.get(e.target);
        if (a !== undefined && b !== undefined) parts[e.kind].push([a, b]);
      }
      structLines[0] = build(parts.split, splitMat, false);
      structLines[1] = build(parts.member, memberMat, false);
      structLines[2] = build(parts.hypothesis, hypMat, false);
      requestRender();
    };
    // Slow float of each branch. Off for reduced motion, hidden tabs and the flat views.
    let driftId = 0, driftLast = 0;
    const offs = new Float32Array(64 * 3);
    const drift = (now: number) => {
      driftId = requestAnimationFrame(drift);
      const d = live.current.data;
      if (!d.groupCount || document.hidden || now - driftLast < 33) return;
      driftLast = now;
      const G = Math.min(64, d.groupCount);
      for (let g = 0; g < G; g += 1) {
        offs[g * 3] = Math.sin(now * 0.00011 + g * 1.9) * 3.2;
        offs[g * 3 + 1] = Math.cos(now * 0.0001 + g * 2.7) * 3.2;
        offs[g * 3 + 2] = Math.sin(now * 0.00008 + g * 1.3) * 1.8;
      }
      for (let i = 0; i < d.n; i += 1) {
        const g = d.group[i];
        for (let k = 0; k < 3; k += 1) {
          let o = 0;
          if (g >= 0 && g < G) o = offs[g * 3 + k];
          else if (d.ends[i * 2] >= 0 && d.ends[i * 2 + 1] >= 0) o = (offs[d.ends[i * 2] * 3 + k] + offs[d.ends[i * 2 + 1] * 3 + k]) / 2;
          d.pos[i * 3 + k] = d.base[i * 3 + k] + o;
        }
      }
      if (lockIdx >= 0 && lockIdx < d.n) {
        // Follow the node's own movement (not its absolute position), so zooming and orbiting still feel free.
        const nx = d.pos[lockIdx * 3], ny = d.pos[lockIdx * 3 + 1], nz = d.pos[lockIdx * 3 + 2];
        if (!flight) {
          const dx = nx - lockPrev.x, dy = ny - lockPrev.y, dz = nz - lockPrev.z;
          controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
          camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
        }
        lockPrev.set(nx, ny, nz);
      }
      if (points) (points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      for (const set of lineSets) {
        set.pairs.forEach(([a, b], k) => {
          set.arr.set(d.pos.subarray(a * 3, a * 3 + 3), k * 6);
          set.arr.set(d.pos.subarray(b * 3, b * 3 + 3), k * 6 + 3);
        });
        (set.geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      }
      projDirty = true;
      requestRender();
    };
    if (!reduced) driftId = requestAnimationFrame(drift);
    const setHeatmap = (enabled: boolean) => {
      pointsMat.uniforms.uHeatmap.value = enabled ? 1 : 0;
      requestRender();
    };

    const flyTo = (index: number, instant: boolean) => {
      const d = live.current.data;
      if (index < 0 || index >= d.n) return;
      // Lock onto the node: the orbit point moves to it and the camera closes in along its current line of sight,
      // so the node ends up dead centre and orbiting spins around it.
      const toT = new THREE.Vector3(d.pos[index * 3], d.pos[index * 3 + 1], d.pos[index * 3 + 2]);
      const fromO = camera.position.clone().sub(controls.target);
      const isHub = live.current.concepts[index]?.kind === "branch";
      const dist = Math.max(controls.minDistance, Math.min(fromO.length(), isHub ? 70 : 45));
      // Choose the viewing direction that shows this node best: try many directions round it and keep the one with the
      // fewest dots between the camera and the node (blocking it) and the fewest right behind it (clutter). A clear
      // swing is still required, so a direction close to the current one is penalised.
      const fromDir = fromO.clone().normalize();
      const rel = new THREE.Vector3(), u = new THREE.Vector3();
      let bestScore = Infinity;
      let want = fromDir.clone();
      const selSize = d.size[index];
      for (let el = 0; el < 4; el += 1) {
        const elev = [0.3, 0.6, 0.95, 1.25][el];
        for (let az = 0; az < 24; az += 1) {
          const ang = (az / 24) * Math.PI * 2;
          u.set(Math.cos(elev) * Math.cos(ang), Math.cos(elev) * Math.sin(ang), Math.sin(elev));
          let front = 0, behind = 0;
          for (let j = 0; j < d.n; j += 1) {
            if (j === index) continue;
            rel.set(d.pos[j * 3] - toT.x, d.pos[j * 3 + 1] - toT.y, d.pos[j * 3 + 2] - toT.z);
            const along = rel.dot(u);
            if (along > dist * 0.95 || along < -dist) continue;
            const perp = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
            const reach = (selSize + d.size[j]) * 0.5 * 1.25 + 0.5;
            if (along > 0 && perp < reach) front += 1;
            else if (along <= 0 && perp < reach * 0.8) behind += 0.2;
          }
          const turn = u.angleTo(fromDir);
          const score = front * 4 + behind + (turn < 0.9 ? 6 : 0) + (turn < 0.5 ? 6 : 0) + (1.25 - elev) * 0.2;
          if (score < bestScore) { bestScore = score; want = u.clone(); }
        }
      }
      const toO = want.setLength(dist);
      lockIdx = index;
      lockPrev.copy(toT);
      if (instant || reduced) {
        flight = null;
        controls.target.copy(toT);
        camera.position.copy(toT).add(toO);
        controls.update();
        requestRender();
        return;
      }
      flight = { t0: performance.now(), dur: 1100, fromT: controls.target.clone(), toT, fromO, toO };
      requestRender();
    };

    // A lost WebGL context must not leave a frozen canvas: say so, and rebuild when it returns.
    const onContextLost = (event: Event) => { event.preventDefault(); setContextLost(true); };
    const onContextRestored = () => { setContextLost(false); setData(); setLines(); requestRender(); };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    engineRef.current = {
      renderer, scene, camera, controls, requestRender, resetView, setCameraView, setHeatmap, zoom, rotate, setData, applyTheme, setLines, flyTo, focused: false,
    };
    applyTheme();
    setData();
    setLines();
    resize();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (driftId) cancelAnimationFrame(driftId);
      flight = null;
      observer.disconnect();
      window.removeEventListener("resize", resize);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("dblclick", onDouble);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      stage.removeEventListener("keydown", onKey);
      for (const o of [points, edgeLines, linkLines, ...structLines]) if (o) o.geometry.dispose();
      pointsMat.dispose(); edgeMat.dispose(); linkMat.dispose(); splitMat.dispose(); memberMat.dispose(); hypMat.dispose();
      for (const el of [...labelEls, ...areaEls, ...chipEls, hoverRing, selRing]) el.remove();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      engineRef.current = null;
    };
    // The engine is created once; later prop changes are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.applyTheme(); engineRef.current?.setData(); engineRef.current?.setLines(); }, [data]);
  useEffect(() => { engineRef.current?.applyTheme(); }, [theme]);
  // Heat is intrinsic to the hierarchy graph: red hubs and big subtopics, blue small ones.
  const hasHeat = concepts.some((c) => c.heat !== undefined);
  useEffect(() => { engineRef.current?.setHeatmap(hasHeat); }, [hasHeat, data]);
  useEffect(() => { engineRef.current?.setLines(); }, [edges, linkedEdges, structure, showPredicted, data]);
  useEffect(() => { engineRef.current?.requestRender(); }, [selectedConceptId, showAreaLabels]);

  // Camera focus: an explicit request (search, panel link) wins; otherwise the map's initial focus point.
  // The first focus on a new engine is instant, so switching 2D/3D lands on the selection without a fly-in.
  const focusTick = focusRequest?.tick;
  const hasData = data.n > 0;
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !hasData) return;
    let target = focusRequest ? data.indexById.get(focusRequest.id) ?? -1 : -1;
    if (target < 0 && focus && !eng.focused) {
      let bd = Infinity;
      concepts.forEach((c, i) => {
        const dd = (c.x - focus.x) ** 2 + (c.y - focus.y) ** 2;
        if (dd < bd) { bd = dd; target = i; }
      });
    }
    if (target < 0) return;
    eng.flyTo(target, !eng.focused);
    eng.focused = true;
    // Only a new request (or the first data for this engine) moves the camera, never a filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick, hasData]);

  const onZoom = useCallback((f: number) => engineRef.current?.zoom(f), []);
  const [cameraView, setCameraView] = useState<CameraView>("overview");
  const chooseCameraView = useCallback((view: CameraView) => {
    engineRef.current?.setCameraView(view);
    setCameraView(view);
  }, []);

  return (
    <section className="ws3d" aria-label="3D research concept map">
      <div
        ref={stageRef}
        className="ws3d__stage"
        tabIndex={0}
        role="region"
        title={HELP}
        aria-label="3D concept map. Drag to orbit around the centre, scroll or pinch to zoom. Use Top, Front, or Default camera controls. Arrow keys rotate, plus and minus zoom, zero resets."
      >
        {unsupported ? (
          <div className="ws3d__unsupported" role="status">This browser cannot display the 3D research map.</div>
        ) : (
          <>
            <div ref={overlayRef} className="ws3d__overlay" aria-hidden="true" />
            {placeholder && <span className="ws3d__tag">Placeholder data: this map is not the real corpus</span>}
            <div className="ws3d__controls" role="group" aria-label="3D map controls" title={HELP}>
              <div className="ws3d__camera" role="group" aria-label="Camera angle">
                <button type="button" aria-pressed={cameraView === "top"} onClick={() => chooseCameraView("top")} title="Look straight down on the map">Top</button>
                <button type="button" aria-pressed={cameraView === "front"} onClick={() => chooseCameraView("front")} title="Look across the map at node height">Front</button>
                <button type="button" aria-pressed={cameraView === "overview"} onClick={() => chooseCameraView("overview")} title="Restore the centred default camera">Default</button>
              </div>
              <button type="button" onClick={() => onZoom(0.8)} aria-label="Zoom in" title="Zoom in (+)">+</button>
              <button type="button" onClick={() => onZoom(1.25)} aria-label="Zoom out" title="Zoom out (-)">{"−"}</button>
            </div>
            <p className="ws3d__guide">Drag to orbit · Right-drag to pan · Scroll to zoom · Double-click empty space to reset</p>
            {!concepts.length && <div className="ws3d__unsupported ws3d__empty" role="status">No concepts match the current filters.</div>}
            {contextLost && <div className="ws3d__unsupported ws3d__empty" role="status">The 3D display was interrupted and is restoring. If it does not recover, refresh the page.</div>}
            {hoverText && <div className="ws3d__hover" aria-hidden="true">{hoverText}</div>}
          </>
        )}
      </div>
    </section>
  );
}

export default MapCanvas3D;
