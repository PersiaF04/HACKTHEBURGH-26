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
export type HNode = ConceptPoint & { kind: NodeKind };
export type BranchInfo = { id: string; label: string; total: number; papers: number; growth: number | null; shown: ConceptPoint[]; hypotheses: GapSummary[] };
export type Hierarchy = {
  nodes: HNode[]; structure: StructureEdge[]; branches: number;
  branchInfo: Map<string, BranchInfo>; hypothesisInfo: Map<string, GapSummary>;
};

const K = 7;
const MEMBERS_PER_BRANCH = 24;
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

export function buildHierarchy(concepts: ConceptPoint[], gaps: GapSummary[]): Hierarchy {
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
    const core = members.slice(0, MEMBERS_PER_BRANCH);
    const x = core.reduce((s, m) => s + m.x, 0) / core.length;
    const y = core.reduce((s, m) => s + m.y, 0) / core.length;
    const gs = core.filter((m) => typeof m.growth === "number" && !Number.isNaN(m.growth));
    const growth = gs.length ? gs.reduce((s, m) => s + (m.growth as number), 0) / gs.length : null;
    const total = members.reduce((s, m) => s + (m.paper_count ?? 0), 0);
    const id = `${BRANCH_PREFIX}${b}`;
    nodes.push({ id, label: name, x, y, paper_count: total, growth, kind: "branch" });
    hubs.push({ id, x, y });
    // Only each branch's largest concepts (and any concept in a ranked gap) are drawn, so the tree stays readable.
    const drawn = members.filter((m, i) => i < MEMBERS_PER_BRANCH || inGap.has(m.id));
    branchInfo.set(id, { id, label: name, total: members.length, papers: total, growth, shown: drawn, hypotheses: [] });
    for (const m of drawn) { nodes.push({ ...m, kind: "concept" }); conceptBranch.set(m.id, id); }
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
      x: mx, y: my, kind: "hypothesis",
    });
    hypothesisInfo.set(id, g);
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
 * Re-position the nodes into separate clusters: hubs on a ring (keeping their neighbours from the
 * map layout adjacent), concepts in a spiral around their hub, hypotheses outside the ring. Heights
 * still come from growth. This is a reading layout, not a measured one.
 */
function layOut(nodes: HNode[], structure: StructureEdge[], hubs: { id: string; x: number; y: number }[]) {
  const cx = hubs.reduce((s, h) => s + h.x, 0) / hubs.length;
  const cy = hubs.reduce((s, h) => s + h.y, 0) / hubs.length;
  const order = [...hubs].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const ring = new Map(order.map((h, i) => {
    const a = (Math.PI * 2 * i) / order.length - Math.PI / 2;
    return [h.id, { x: Math.cos(a), y: Math.sin(a) }];
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const members = new Map<string, string[]>();
  for (const e of structure) if (e.kind === "member") members.set(e.source, [...(members.get(e.source) ?? []), e.target]);
  for (const [hubId, ids] of members) {
    const hub = byId.get(hubId)!, at = ring.get(hubId)!;
    hub.x = at.x; hub.y = at.y;
    ids.forEach((id, i) => {
      const n = byId.get(id)!;
      const ang = i * 2.399963 + Math.atan2(at.y, at.x);
      const rad = 0.07 * Math.sqrt(i + 1) + 0.05;
      n.x = at.x + Math.cos(ang) * rad;
      n.y = at.y + Math.sin(ang) * rad;
    });
  }
  for (const n of nodes) {
    if (n.kind !== "hypothesis") continue;
    const [a, b] = n.id.slice(HYPOTHESIS_PREFIX.length).split("|").map((id) => byId.get(id));
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(mx, my) || 1;
    n.x = mx + (mx / len) * 0.16;
    n.y = my + (my / len) * 0.16;
  }
}
