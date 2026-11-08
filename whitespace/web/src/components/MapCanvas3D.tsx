import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ConceptPoint, PredictedEdge } from "../api";
import "./map3d.css";

type MapFocus = { x: number; y: number } | null;
type MapConcept = ConceptPoint & { area?: string };
type LinkedEdge = { source: string; target: string };

export type MapCanvas3DProps = {
  concepts: MapConcept[];
  edges: PredictedEdge[];
  selectedConceptId: string | null;
  focus: MapFocus;
  placeholder: boolean;
  onSelectConcept: (id: string) => void;
  linkedEdges?: LinkedEdge[];
  showPredicted?: boolean;
  showAreaLabels?: boolean;
  /** Called once if WebGL cannot be created, so the parent can fall back to the 2D map. */
  onUnsupported?: () => void;
};

const GROWTH_COLORS = ["#C3C7CF", "#F0C9A0", "#EDA060", "#E07432", "#BF4A0E"] as const;
const GROWTH_LABELS = ["Shrinking", "0 to 15%", "15 to 30%", "30 to 45%", "45% or more"] as const;
const UNKNOWN_COLOR = "#9AA0AA";
const SPAN_XY = 100; // x,y mapped into [-50, 50]
const SPAN_Z = 50; // z mapped into [-25, 25]
const FOV = 45;
const MAX_LABELS = 60;
const HOME = new THREE.Vector3(0, -105, 75);
const TARGET = new THREE.Vector3(0, 0, 0);

function growthBucket(g: number | null): number {
  if (g === null || Number.isNaN(g)) return 5;
  if (g < 0) return 0;
  if (g < 0.15) return 1;
  if (g < 0.3) return 2;
  if (g < 0.45) return 3;
  return 4;
}

function describe(c: ConceptPoint): string {
  const papers = typeof c.paper_count === "number" ? `${c.paper_count.toLocaleString("en-GB")} papers` : "paper count unavailable";
  const growth = c.growth === null ? "growth unavailable" : `growth ${(c.growth * 100).toFixed(1)}%`;
  return `${c.label}; ${papers}; ${growth}`;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(3.0, aSize * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float rim = smoothstep(0.40, 0.48, d);
  gl_FragColor = vec4(mix(vColor, vec3(1.0), rim * 0.85), 1.0);
}`;

type Scene3D = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  requestRender: () => void;
  resetView: () => void;
  zoom: (factor: number) => void;
  rotate: (dAzimuth: number, dPolar: number) => void;
};

export function MapCanvas3D({
  concepts, edges, selectedConceptId, focus, placeholder, onSelectConcept,
  linkedEdges, showPredicted = true, showAreaLabels = true, onUnsupported,
}: MapCanvas3DProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Scene3D | null>(null);
  const hoverRef = useRef(-1);
  const [unsupported, setUnsupported] = useState(false);
  const [hoverText, setHoverText] = useState("");

  // Geometry-level derived data: world positions, sizes, colour buckets.
  const data = useMemo(() => {
    const n = concepts.length;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const c of concepts) {
      if (c.x < xmin) xmin = c.x; if (c.x > xmax) xmax = c.x;
      if (c.y < ymin) ymin = c.y; if (c.y > ymax) ymax = c.y;
    }
    const range = Math.max(xmax - xmin, ymax - ymin) || 1;
    const xc = (xmin + xmax) / 2, yc = (ymin + ymax) / 2;
    // z scale: 95th percentile of |growth| so a few outliers do not flatten everything.
    const mags = concepts.filter((c) => c.growth !== null && !Number.isNaN(c.growth)).map((c) => Math.abs(c.growth as number)).sort((a, b) => a - b);
    const zRef = Math.max(0.05, mags.length ? mags[Math.floor(mags.length * 0.95)] ?? mags[mags.length - 1] : 0.05);
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const bucket = new Uint8Array(n);
    const tmp = new THREE.Color();
    concepts.forEach((c, i) => {
      pos[i * 3] = ((c.x - xc) / range) * SPAN_XY;
      pos[i * 3 + 1] = ((c.y - yc) / range) * SPAN_XY;
      const g = c.growth === null || Number.isNaN(c.growth) ? 0 : c.growth;
      pos[i * 3 + 2] = Math.max(-1, Math.min(1, g / zRef)) * (SPAN_Z / 2);
      size[i] = Math.max(0.5, Math.min(3.2, Math.sqrt(Math.max(0, c.paper_count ?? 0)) * 0.07 + 0.3)); // world diameter
      const b = growthBucket(c.growth);
      bucket[i] = b;
      tmp.set(b === 5 ? UNKNOWN_COLOR : GROWTH_COLORS[b]).convertLinearToSRGB(); // shader writes raw values
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
    return { n, pos, size, color, bucket, indexById, labelOrder, areas };
  }, [concepts]);

  // Latest props for the render loop (no re-creation of the engine).
  const live = useRef({ data, concepts, edges, selectedConceptId, showPredicted, showAreaLabels, onSelectConcept });
  live.current = { data, concepts, edges, selectedConceptId, showPredicted, showAreaLabels, onSelectConcept };

  // Engine: renderer, camera, controls, picking, overlay. Created once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !stage || !overlay) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      if (!renderer.getContext()) throw new Error("no context");
    } catch {
      setUnsupported(true);
      onUnsupported?.();
      return undefined;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xfbfbf9, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.copy(HOME);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(TARGET);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.minDistance = 8;
    controls.maxDistance = 400;
    controls.zoomSpeed = 0.9;
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

    // Persistent point cloud, rebuilt when data changes (see effect below).
    const pointsMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 1 } },
    });
    let points: THREE.Points | null = null;
    let edgeLines: THREE.LineSegments | null = null;
    let linkLines: THREE.LineSegments | null = null;
    const edgeMat = new THREE.LineDashedMaterial({ color: 0x2952e3, dashSize: 1.6, gapSize: 1.0, transparent: true, opacity: 0.85 });
    const linkMat = new THREE.LineBasicMaterial({ color: 0xb9bcc4, transparent: true, opacity: 0.6 });

    let width = 0, height = 0;
    let screen = new Float32Array(0); // projected x,y,depth per node (CSS px)
    let projDirty = true;
    let rafId = 0;
    let dirty = true;
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

    const pxSize = (i: number, depth: number) => {
      const scale = (height * renderer.getPixelRatio()) / (2 * Math.tan((FOV * Math.PI) / 360));
      return Math.max(3, (live.current.data.size[i] * scale) / depth) / renderer.getPixelRatio();
    };

    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.display = "block";
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    const placeRing = (el: HTMLElement, i: number) => {
      const depth = screen[i * 3 + 2];
      if (i < 0 || depth <= 0) { el.style.display = "none"; return; }
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
        const text = s.concepts[i].label;
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
        el.textContent = `P ${e.p.toFixed(2)}`;
        place(el, (v.x * 0.5 + 0.5) * width - 22, (1 - (v.y * 0.5 + 0.5)) * height - 9);
      });
    };

    const renderNow = () => {
      if (width <= 0 || height <= 0) return;
      pointsMat.uniforms.uScale.value = (height * renderer.getPixelRatio()) / (2 * Math.tan((FOV * Math.PI) / 360));
      renderer.render(scene, camera);
      project();
      updateOverlay();
    };

    const loop = () => {
      rafId = 0;
      const moved = controls.update();
      if (moved || dirty) {
        dirty = false;
        projDirty = true;
        renderNow();
      }
      if (moved) rafId = requestAnimationFrame(loop);
    };
    const requestRender = () => {
      dirty = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    };
    controls.addEventListener("change", requestRender);

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);

    // Picking: nearest projected node within its pixel radius (no raycast, no per-frame work).
    const hit = (clientX: number, clientY: number): number => {
      if (projDirty) { camera.updateMatrixWorld(); project(); }
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left, py = clientY - rect.top;
      const n = live.current.data.n;
      let best = -1, bestScore = Infinity;
      for (let i = 0; i < n; i += 1) {
        const depth = screen[i * 3 + 2];
        if (depth <= 0) continue;
        const dx = screen[i * 3] - px;
        if (dx > 24 || dx < -24) continue;
        const dy = screen[i * 3 + 1] - py;
        const dist = Math.hypot(dx, dy);
        const reach = Math.max(9, pxSize(i, depth) / 2 + 3);
        if (dist <= reach) {
          const score = dist + depth * 0.02; // prefer closer to the cursor, then nearer to the camera
          if (score < bestScore) { best = i; bestScore = score; }
        }
      }
      return best;
    };

    let down: { x: number; y: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, moved: false }; };
    const onMove = (e: PointerEvent) => {
      if (down) {
        if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) down.moved = true;
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
      down = null;
      if (d0 && !d0.moved && e.button === 0) {
        const i = hit(e.clientX, e.clientY);
        if (i >= 0) live.current.onSelectConcept(live.current.concepts[i].id);
      }
    };
    const onLeave = () => {
      if (hoverRef.current >= 0) { hoverRef.current = -1; setHoverText(""); requestRender(); }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    const zoom = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
      camera.position.copy(controls.target).add(offset.setLength(len));
      controls.update();
      requestRender();
    };
    const rotate = (dAz: number, dPol: number) => {
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
      camera.position.copy(HOME);
      controls.target.copy(TARGET);
      controls.update();
      requestRender();
    };

    const onKey = (e: KeyboardEvent) => {
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

    // Expose rebuild hooks via the engine object.
    const setData = () => {
      const d = live.current.data;
      if (points) { scene.remove(points); points.geometry.dispose(); points = null; }
      if (d.n) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
        g.setAttribute("aSize", new THREE.BufferAttribute(d.size, 1));
        g.setAttribute("aColor", new THREE.BufferAttribute(d.color, 3));
        g.computeBoundingSphere();
        points = new THREE.Points(g, pointsMat);
        points.frustumCulled = false;
        scene.add(points);
      }
      hoverRef.current = -1;
      projDirty = true;
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
      for (const l of [edgeLines, linkLines]) if (l) { scene.remove(l); l.geometry.dispose(); }
      const pred: Array<[number, number]> = [];
      if (s.showPredicted) {
        for (const e of s.edges) {
          const a = d.indexById.get(e.source), b = d.indexById.get(e.target);
          if (a !== undefined && b !== undefined) pred.push([a, b]);
        }
      }
      edgeLines = build(pred, edgeMat, true);
      const lk: Array<[number, number]> = [];
      for (const e of linkedRef.current ?? []) {
        const a = d.indexById.get(e.source), b = d.indexById.get(e.target);
        if (a !== undefined && b !== undefined) lk.push([a, b]);
      }
      linkLines = build(lk, linkMat, false);
      requestRender();
    };

    engineRef.current = {
      renderer, scene, camera, controls, requestRender, resetView, zoom, rotate,
    };
    (engineRef.current as unknown as { setData: () => void; setLines: () => void }).setData = setData;
    (engineRef.current as unknown as { setData: () => void; setLines: () => void }).setLines = setLines;
    setData();
    setLines();
    resize();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("keydown", onKey);
      for (const o of [points, edgeLines, linkLines]) if (o) o.geometry.dispose();
      pointsMat.dispose(); edgeMat.dispose(); linkMat.dispose();
      for (const el of [...labelEls, ...areaEls, ...chipEls, hoverRing, selRing]) el.remove();
      renderer.dispose();
      renderer.forceContextLoss();
      engineRef.current = null;
    };
    // The engine is created once; later prop changes are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedRef = useRef(linkedEdges);
  linkedRef.current = linkedEdges;

  type Hooks = { setData: () => void; setLines: () => void } | null;
  const hooks = () => engineRef.current as unknown as Hooks;

  useEffect(() => { hooks()?.setData(); hooks()?.setLines(); }, [data]);
  useEffect(() => { hooks()?.setLines(); }, [edges, linkedEdges, showPredicted, data]);
  useEffect(() => { engineRef.current?.requestRender(); }, [selectedConceptId, showAreaLabels]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !focus || !data.n) return;
    // Aim at the concept nearest the 2D focus so the target sits at its real height.
    let best = -1, bd = Infinity;
    concepts.forEach((c, i) => {
      const d = (c.x - focus.x) ** 2 + (c.y - focus.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    const t = new THREE.Vector3(data.pos[best * 3], data.pos[best * 3 + 1], data.pos[best * 3 + 2]);
    const delta = t.clone().sub(eng.controls.target);
    eng.controls.target.copy(t);
    eng.camera.position.add(delta);
    eng.controls.update();
    eng.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.x, focus?.y, data]);

  const onZoom = useCallback((f: number) => engineRef.current?.zoom(f), []);

  return (
    <section className="ws3d" aria-label="3D research concept map">
      <div
        ref={stageRef}
        className="ws3d__stage"
        tabIndex={0}
        role="application"
        aria-label="3D concept map. Arrow keys rotate, plus and minus zoom, zero resets. Use the concept list to select a concept with the keyboard."
      >
        <canvas ref={canvasRef} className="ws3d__canvas" aria-hidden="true" hidden={unsupported} />
        {unsupported ? (
          <div className="ws3d__unsupported" role="status">3D view is not supported in this browser. Use the concept list below.</div>
        ) : (
          <>
            <div ref={overlayRef} className="ws3d__overlay" aria-hidden="true" />
            {placeholder && <span className="ws3d__tag">Placeholder data: this map is not the real corpus</span>}
            <div className="ws3d__controls" role="group" aria-label="Map controls">
              <button type="button" onClick={() => onZoom(0.8)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => onZoom(1.25)} aria-label="Zoom out">{"−"}</button>
              <button type="button" onClick={() => engineRef.current?.resetView()}>Reset view</button>
            </div>
            {!concepts.length && <div className="ws3d__unsupported" role="status" style={{ position: "absolute", inset: 0 }}>No concepts are available for this year.</div>}
            {hoverText && <div className="ws3d__hover" aria-hidden="true">{hoverText}</div>}
            <div className="ws3d__legend" aria-hidden="true">
              <span>height = 3-yr growth</span>
              <span className="ws3d__legend-swatches">
                {GROWTH_COLORS.map((c, k) => <i key={c} style={{ background: c }} title={GROWTH_LABELS[k]} />)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default MapCanvas3D;
