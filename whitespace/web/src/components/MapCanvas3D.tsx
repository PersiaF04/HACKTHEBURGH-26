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
type MapConcept = ConceptPoint & { area?: string; kind?: NodeKind };
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

function describe(c: ConceptPoint): string {
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
  const [heatmap, setHeatmap] = useState(false);
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
    concepts.forEach((c, i) => {
      const k = (layout.slot.get(c.id) ?? 0) * 3;
      pos[i * 3] = layout.pos[k]; pos[i * 3 + 1] = layout.pos[k + 1]; pos[i * 3 + 2] = layout.pos[k + 2];
      const g = c.growth === null || c.growth === undefined || Number.isNaN(c.growth) ? 0 : c.growth;
      heat[i] = Math.max(0, Math.min(1, (g / zRef + 1) / 2));
      size[i] = Math.max(0.5, Math.min(3.2, Math.sqrt(Math.max(0, c.paper_count ?? 0)) * 0.07 + 0.3)); // world diameter
      const b = growthBucket(c.growth);
      bucket[i] = b;
      if (c.kind === "branch") size[i] = 3.8;
      else if (c.kind === "hypothesis") size[i] = 1.5;
      const hue = c.kind === "branch" ? themeHues.ink : c.kind === "hypothesis" ? themeHues.accent : palette[b];
      tmp.set(hue).convertLinearToSRGB(); // shader writes raw values
      color[i * 3] = tmp.r; color[i * 3 + 1] = tmp.g; color[i * 3 + 2] = tmp.b;
    });
    const indexById = new Map(concepts.map((c, i) => [c.id, i]));
    const labelOrder = concepts.map((_, i) => i).sort((a, b) => (concepts[b].paper_count ?? 0) - (concepts[a].paper_count ?? 0));
    const sums = new Map<string, { x: number; y: number; z: number; n: number }>();
    concepts.forEach((c, i) => {
      if (!c.area) return;
      const s = sums.get(c.area) ?? { x: 0, y: 0, z: 0, n: 0 };
      s.x += pos[i * 3]; s.y += pos[i * 3 + 1]; s.z += pos[i * 3 + 2]; s.n += 1;
      sums.set(c.area, s);
    });
    const areas = [...sums].map(([name, s]) => ({ name, v: new THREE.Vector3(s.x / s.n, s.y / s.n, s.z / s.n) }));
    const center = layout.center;
    return { n, pos, size, color, heat, bucket, indexById, labelOrder, areas, center };
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
    controls.dampingFactor = 0.12;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 400;
    controls.zoomSpeed = 0.9;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
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
      const d = pxSize(i, depth) + 8;
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
      let used = 0;
      const tryLabel = (i: number, strong: boolean) => {
        if (used >= labelEls.length) return false;
        const depth = screen[i * 3 + 2];
        const x = screen[i * 3], y = screen[i * 3 + 1];
        if (depth <= 0 || x < -10 || y < -10 || x > width + 10 || y > height + 10) return false;
        const text = fmtText(s.concepts[i].label);
        const w = text.length * 5.8 + 4;
        const lx = x + pxSize(i, depth) / 2 + 4, ly = y - 7;
        for (const p of placed) if (lx < p[2] && lx + w > p[0] && ly < p[3] && ly + 14 > p[1]) return false;
        placed.push([lx, ly, lx + w, ly + 14]);
        const el = labelEls[used++];
        if (el.textContent !== text) el.textContent = text;
        el.classList.toggle("ws3d__label--strong", strong);
        place(el, lx, ly);
        return true;
      };
      if (selIdx >= 0) tryLabel(selIdx, true);
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

    const loop = (now: number) => {
      rafId = 0;
      let flying = false;
      if (flight) {
        const k = Math.min(1, (now - flight.t0) / flight.dur);
        const e = 1 - (1 - k) ** 3;
        controls.target.lerpVectors(flight.fromT, flight.toT, e);
        camera.position.copy(controls.target).add(v.lerpVectors(flight.fromO, flight.toO, e));
        flying = k < 1;
        if (!flying) flight = null;
        dirty = true;
      }
      const moved = controls.update();
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
        const reach = Math.max(9 + slop, pxSize(i, depth) / 2 + 3 + slop);
        const dx = screen[i * 3] - px;
        if (dx > reach || dx < -reach) continue;
        const dy = screen[i * 3 + 1] - py;
        const dist = Math.hypot(dx, dy);
        if (dist <= reach) {
          const score = dist + depth * 0.02; // prefer closer to the cursor, then nearer to the camera
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
      const center = live.current.data.center;
      camera.position.copy(center).add(HOME);
      controls.target.copy(center);
      controls.update();
      requestRender();
    };
    const setCameraView = (view: CameraView) => {
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
        const l = new THREE.LineSegments(g, mat);
        l.frustumCulled = false;
        if (dashed) l.computeLineDistances();
        scene.add(l);
        return l;
      };
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
    const setHeatmap = (enabled: boolean) => {
      pointsMat.uniforms.uHeatmap.value = enabled ? 1 : 0;
      requestRender();
    };

    const flyTo = (index: number, instant: boolean) => {
      const d = live.current.data;
      if (index < 0 || index >= d.n) return;
      const toT = d.center.clone();
      const fromO = camera.position.clone().sub(controls.target);
      const relative = new THREE.Vector3(d.pos[index * 3], d.pos[index * 3 + 1], d.pos[index * 3 + 2]).sub(toT);
      const toO = new THREE.Vector3(-relative.x, -relative.y, Math.max(18, relative.z + 28)).normalize().multiplyScalar(Math.max(controls.minDistance, Math.min(fromO.length(), 90)));
      if (instant || reduced) {
        flight = null;
        controls.target.copy(toT);
        camera.position.copy(toT).add(toO);
        controls.update();
        requestRender();
        return;
      }
      flight = { t0: performance.now(), dur: 450, fromT: controls.target.clone(), toT, fromO, toO };
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
  useEffect(() => { engineRef.current?.setHeatmap(heatmap); }, [heatmap]);
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
              <button type="button" className="ws3d__heat" aria-pressed={heatmap} onClick={() => setHeatmap((value) => !value)} title="Highlight recent paper growth: cool is colder and warm is emerging">Heat map</button>
              <button type="button" onClick={() => onZoom(0.8)} aria-label="Zoom in" title="Zoom in (+)">+</button>
              <button type="button" onClick={() => onZoom(1.25)} aria-label="Zoom out" title="Zoom out (-)">{"−"}</button>
            </div>
            <p className="ws3d__guide">{heatmap ? "Growth heat: cool = colder · warm = emerging" : "Drag to orbit · Scroll to zoom · Click a node to inspect it"}</p>
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
