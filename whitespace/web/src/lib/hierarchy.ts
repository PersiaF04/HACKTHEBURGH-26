import type { ConceptPoint, GapSummary, PredictedEdge } from "../api";

/**
 * Branch -> concept -> Hypothesis structure, derived from the export.
 *   Branch      a hub for one cluster of the map layout (k-means on x,y; labelled by its largest concept)
 *   Concept     the middle tier, standing in for papers (the map has concepts, not individual papers)
 *   Hypothesis  a ranked gap, drawn as a node between its two concepts
 * Branches are derived here, not exported by the pipeline, so the UI says so.
 */
export type NodeKind = "branch" | "concept" | "hypothesis";
export type StructureKind = "split" | "member" | "hypothesis";
export type StructureEdge = { source: string; target: string; kind: StructureKind };
export type HNode = ConceptPoint & { kind: NodeKind; branch?: string; ends?: [string, string]; scale?: number; heat?: number; strength?: number; gapEnd?: boolean };
export type BranchInfo = { id: string; label: string; total: number; papers: number; growth: number | null; shown: ConceptPoint[]; hypotheses: GapSummary[] };
export type Hierarchy = {
  nodes: HNode[]; structure: StructureEdge[]; branches: number;
  branchInfo: Map<string, BranchInfo>; hypothesisInfo: Map<string, GapSummary>;
};

const K = 7;
export const DEFAULT_PER_BRANCH = 60;
export const BRANCH_PREFIX = "branch:";
export const HYPOTHESIS_PREFIX = "hyp:";
export const isSynthetic = (id: string) => id.startsWith(BRANCH_PREFIX) || id.startsWith(HYPOTHESIS_PREFIX);

function kmeans(points: ConceptPoint[], k: number): number[] {
  // Deterministic farthest-point start, then a few Lloyd passes.
  const centres: [number, number][] = [];
  const heaviest = points.reduce((best, p, i) => ((p.paper_count ?? 0) > (points[best].paper_count ?? 0) ? i : best), 0);
  centres.push([points[heaviest].x, points[heaviest].y]);
  while (centres.length < k) {
    let far = 0, farD = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centres.map(([cx, cy]) => (p.x - cx) ** 2 + (p.y - cy) ** 2));
      if (d > farD) { farD = d; far = i; }
    });
    centres.push([points[far].x, points[far].y]);
  }
  const assign = new Array<number>(points.length).fill(0);
  for (let pass = 0; pass < 8; pass += 1) {
    points.forEach((p, i) => {
      let best = 0, bd = Infinity;
      centres.forEach(([cx, cy], c) => {
        const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
        if (d < bd) { bd = d; best = c; }
      });
      assign[i] = best;
    });
    centres.forEach((_, c) => {
      let sx = 0, sy = 0, n = 0;
      points.forEach((p, i) => { if (assign[i] === c) { sx += p.x; sy += p.y; n += 1; } });
      if (n) centres[c] = [sx / n, sy / n];
    });
  }
  return assign;
}

export function buildHierarchy(concepts: ConceptPoint[], gaps: GapSummary[], perBranch = DEFAULT_PER_BRANCH): Hierarchy {
  if (concepts.length < K * 2) return { nodes: concepts.map((c) => ({ ...c, kind: "concept" as const })), structure: [], branches: 0, branchInfo: new Map(), hypothesisInfo: new Map() };
  const inGap = new Set(gaps.flatMap((g) => [g.a, g.b]));
  const assign = kmeans(concepts, K);
  const byBranch: ConceptPoint[][] = Array.from({ length: K }, () => []);
  concepts.forEach((c, i) => byBranch[assign[i]].push(c));

  const nodes: HNode[] = [];
  const structure: StructureEdge[] = [];
  const hubs: { id: string; x: number; y: number }[] = [];
  const branchInfo = new Map<string, BranchInfo>();
  const conceptBranch = new Map<string, string>();
  const hypothesisInfo = new Map<string, GapSummary>();
  byBranch.forEach((members, b) => {
    if (!members.length) return;
    members.sort((p, q) => (q.paper_count ?? 0) - (p.paper_count ?? 0));
    const name = `${members[0].label} branch`;
    const core = members.slice(0, perBranch);
    const x = core.reduce((s, m) => s + m.x, 0) / core.length;
    const y = core.reduce((s, m) => s + m.y, 0) / core.length;
    const gs = core.filter((m) => typeof m.growth === "number" && !Number.isNaN(m.growth));
    const growth = gs.length ? gs.reduce((s, m) => s + (m.growth as number), 0) / gs.length : null;
    const total = members.reduce((s, m) => s + (m.paper_count ?? 0), 0);
    const id = `${BRANCH_PREFIX}${b}`;
    nodes.push({ id, label: name, x, y, paper_count: total, growth, kind: "branch", branch: id, heat: 1 });
    hubs.push({ id, x, y });
    // Only each branch's largest concepts (and any concept in a ranked gap) are drawn, so the tree stays readable.
    const drawn = members.filter((m, i) => i < perBranch || inGap.has(m.id));
    branchInfo.set(id, { id, label: name, total: members.length, papers: total, growth, shown: drawn, hypotheses: [] });
    // Heat: the hub is hottest; subtopics cool from warm (largest in the branch) to blue (smallest).
    drawn.forEach((m, i) => { nodes.push({ ...m, kind: "concept", branch: id, heat: 0.85 * (1 - i / Math.max(1, drawn.length)) ** 0.8 }); conceptBranch.set(m.id, id); });
    for (const m of drawn) structure.push({ source: id, target: m.id, kind: "member" });
  });

  // Branch splits: a minimum spanning tree over the hubs, so the macro skeleton stays sparse.
  const inTree = new Set([hubs[0]?.id]);
  while (inTree.size < hubs.length) {
    let best: [string, string] | null = null, bd = Infinity;
    for (const a of hubs) {
      if (!inTree.has(a.id)) continue;
      for (const c of hubs) {
        if (inTree.has(c.id)) continue;
        const d = (a.x - c.x) ** 2 + (a.y - c.y) ** 2;
        if (d < bd) { bd = d; best = [a.id, c.id]; }
      }
    }
    if (!best) break;
    structure.push({ source: best[0], target: best[1], kind: "split" });
    inTree.add(best[1]);
  }

  // Hypotheses: each ranked gap sits between its two concepts, pushed out from the centre of its branch.
  const pos = new Map(nodes.map((n) => [n.id, n]));
  for (const g of gaps) {
    const a = pos.get(g.a), b = pos.get(g.b);
    if (!a || !b) continue;
    const id = `${HYPOTHESIS_PREFIX}${g.a}|${g.b}`;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    nodes.push({
      id, label: `${a.label} × ${b.label}`, growth: null,
      x: mx, y: my, kind: "hypothesis", heat: 0.5, strength: g.p_link, ends: [conceptBranch.get(g.a) ?? "", conceptBranch.get(g.b) ?? ""],
    });
    hypothesisInfo.set(id, g);
    a.gapEnd = true; b.gapEnd = true;
    for (const end of new Set([conceptBranch.get(g.a), conceptBranch.get(g.b)])) if (end) branchInfo.get(end)?.hypotheses.push(g);
    structure.push({ source: g.a, target: id, kind: "hypothesis" }, { source: g.b, target: id, kind: "hypothesis" });
  }
  layOut(nodes, structure, hubs);
  return { nodes, structure, branches: hubs.length, branchInfo, hypothesisInfo };
}

/** Supporting links: predicted edges kept only when both ends are in the graph. */
export const supporting = (edges: PredictedEdge[], ids: Set<string>) =>
  edges.filter((e) => ids.has(e.source) && ids.has(e.target));

/**
 * Layout formula, one rule applied at each level (smaller scale each level down).
 *
 * Level 1, the concepts of a branch: a sunflower (Vogel) spiral, p_i = c * sqrt(i + 1/2) at angle i * 137.5 deg.
 *   With c = 0.7 the nearest two points are at least D0 = 1 unit apart, and a branch of n concepts fills a disc of
 *   radius R = c * sqrt(n) + D0 / 2. No two concepts overlap by construction, so no iteration is needed.
 * Level 0, the branches: K discs of radius up to Rmax sit evenly on a ring of radius
 *   Rring = Rmax * (1 + G) / sin(pi / K),
 *   so neighbouring centres are 2 * Rmax * (1 + G) apart and every pair of discs clears by G * Rmax (G = 0.9).
 * The same rule would repeat for deeper levels with D0 and c scaled down per level (here there are two levels).
 * Dot size is scaled so the nearest concepts do not touch, since the map is drawn into a fixed 140-unit span.
 */
const C_SPIRAL = 0.7;
const D0 = 1;
const G = 0.9;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const WORLD_SPAN = 140;
const DOT_WORLD = 3.4; // world diameter of the largest concept dot

function layOut(nodes: HNode[], structure: StructureEdge[], hubs: { id: string; x: number; y: number }[]) {
  const cx = hubs.reduce((s, h) => s + h.x, 0) / hubs.length;
  const cy = hubs.reduce((s, h) => s + h.y, 0) / hubs.length;
  const order = [...hubs].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)); // keep map neighbours adjacent
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const members = new Map<string, string[]>();
  for (const e of structure) if (e.kind === "member") members.set(e.source, [...(members.get(e.source) ?? []), e.target]);

  const radius = (n: number) => C_SPIRAL * Math.sqrt(n) + D0 / 2;
  const Rmax = Math.max(...order.map((h) => radius(members.get(h.id)?.length ?? 0)));
  const K = order.length;
  const Rring = (Rmax * (1 + G)) / Math.sin(Math.PI / Math.max(3, K));

  order.forEach((h, k) => {
    const angle = (Math.PI * 2 * k) / K - Math.PI / 2;
    const hub = byId.get(h.id)!;
    hub.x = Math.cos(angle) * Rring; hub.y = Math.sin(angle) * Rring;
    const ids = members.get(h.id) ?? [];
    ids.forEach((id, i) => {
      const n = byId.get(id)!;
      const rho = C_SPIRAL * Math.sqrt(i + 0.5);
      n.x = hub.x + Math.cos(i * GOLDEN + angle) * rho;
      n.y = hub.y + Math.sin(i * GOLDEN + angle) * rho;
    });
  });

  // Dot size follows the room each concept gets in the fixed world span.
  const worldPerUnit = WORLD_SPAN / (2 * (Rring + Rmax + 1));
  const scale = Math.max(0.3, Math.min(1, (D0 * worldPerUnit) / DOT_WORLD));
  for (const n of nodes) if (n.kind === "concept") n.scale = scale;

  // A gap is a bridge: its dot sits at the midpoint of the line joining its two concepts.
  for (const n of nodes) {
    if (n.kind !== "hypothesis") continue;
    const [a, b] = n.id.slice(HYPOTHESIS_PREFIX.length).split("|").map((id) => byId.get(id));
    if (!a || !b) continue;
    n.x = (a.x + b.x) / 2;
    n.y = (a.y + b.y) / 2;
  }
}
