// TEMPORARY: delete src/demo and DemoToggle when real data is connected.
// Everything here is INVENTED and generated deterministically. Concept names are generic AI/ML topic names;
// every number, paper title and sentence is made up and says so ("Demo paper N", "Demo sentence:").
import type {
  ConceptPoint, ConceptResponse, ConceptSummary, GapDetail, GapListResponse, GapQuery, GapSummary, MapResponse,
  MetaResponse, OpenProblem, OpenProblemRatePoint, OpenProblemResponse, PaperSummary, PredictedEdge, SearchResponse,
} from "../api";

const YEAR_MIN = 2015;
const YEAR_MAX = 2024;

// ---------------------------------------------------------------- seeded randomness
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const round = (v: number, d = 3) => Number(v.toFixed(d));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------- concepts
const AREAS: Array<{ name: string; growth: number; topics: string[] }> = [
  { name: "Language models", growth: 0.42, topics: ["Transformers", "Large language models", "Instruction tuning", "In-context learning", "Prompt engineering", "Retrieval-augmented generation", "Machine translation", "Text summarization", "Question answering", "Named entity recognition", "Sentiment analysis", "Word embeddings", "Tokenization", "Long-context modelling", "Code generation", "Dialogue systems", "Hallucination detection", "Parameter-efficient fine-tuning", "Mixture of experts", "Speech recognition", "Text-to-speech", "Multilingual models", "Reading comprehension", "Knowledge distillation"] },
  { name: "Computer vision", growth: 0.2, topics: ["Image classification", "Object detection", "Semantic segmentation", "Instance segmentation", "Vision transformers", "Image captioning", "Visual question answering", "Face recognition", "Pose estimation", "Optical flow", "Depth estimation", "Image super-resolution", "Video understanding", "Action recognition", "Medical image analysis", "3D reconstruction", "Neural radiance fields", "Point cloud processing", "Visual tracking", "Scene text recognition", "Image retrieval", "Self-supervised vision", "Multimodal pretraining", "Diffusion image synthesis"] },
  { name: "Reinforcement learning", growth: 0.12, topics: ["Policy gradients", "Q-learning", "Model-based reinforcement learning", "Offline reinforcement learning", "Multi-agent reinforcement learning", "Reward shaping", "Imitation learning", "Inverse reinforcement learning", "Exploration strategies", "Hierarchical reinforcement learning", "Safe reinforcement learning", "Sim-to-real transfer", "Meta-reinforcement learning", "Curriculum learning", "Game playing agents", "Robot manipulation", "Autonomous driving", "Planning under uncertainty", "Bandit algorithms", "Reward modelling from feedback", "Goal-conditioned policies", "World models", "Decision transformers", "Motion planning"] },
  { name: "Generative models", growth: 0.55, topics: ["Diffusion models", "Generative adversarial networks", "Variational autoencoders", "Normalizing flows", "Autoregressive generation", "Text-to-image synthesis", "Text-to-video synthesis", "Music generation", "Voice cloning", "Score-based models", "Latent diffusion", "Energy-based models", "Image editing", "Style transfer", "Data augmentation by synthesis", "Synthetic tabular data", "Molecule generation", "Controllable generation", "Watermarking generated content", "Deepfake detection", "Evaluation of generative models", "Consistency models", "Flow matching", "3D asset generation"] },
  { name: "Learning theory and optimisation", growth: 0.05, topics: ["Stochastic gradient descent", "Adaptive optimisers", "Batch normalisation", "Generalisation bounds", "Double descent", "Neural tangent kernel", "Lottery ticket hypothesis", "Loss landscape analysis", "Implicit regularisation", "Overparameterisation", "Learning rate schedules", "Second-order optimisation", "Convex relaxation", "Online learning", "PAC-Bayes", "Sample complexity", "Kernel methods", "Gaussian processes", "Bayesian deep learning", "Variational inference", "Monte Carlo methods", "Causal inference", "Active learning", "Few-shot learning"] },
  { name: "Trustworthy AI", growth: 0.33, topics: ["Adversarial robustness", "Fairness in machine learning", "Differential privacy", "Federated learning", "Explainable AI", "Saliency methods", "Mechanistic interpretability", "Model calibration", "Uncertainty quantification", "Out-of-distribution detection", "Backdoor attacks", "Membership inference", "Model watermarking", "AI alignment", "Red teaming", "Bias in language models", "Concept bottleneck models", "Counterfactual explanations", "Machine unlearning", "Content moderation", "Safety evaluation", "Dataset documentation", "Model auditing", "Certified defences"] },
  { name: "Graphs and structured data", growth: 0.15, topics: ["Graph neural networks", "Node classification", "Link prediction", "Knowledge graph embedding", "Graph transformers", "Molecular property prediction", "Recommender systems", "Collaborative filtering", "Community detection", "Temporal graph learning", "Graph generation", "Heterogeneous graphs", "Graph pooling", "Time series forecasting", "Anomaly detection", "Tabular deep learning", "Symbolic regression", "Neurosymbolic reasoning", "Program synthesis", "Relational learning", "Spatiotemporal forecasting", "Traffic prediction", "Protein structure prediction", "Drug discovery"] },
  { name: "Efficient and systems ML", growth: 0.28, topics: ["Model quantisation", "Network pruning", "Neural architecture search", "Low-rank adaptation", "Efficient attention", "Speculative decoding", "Mixed-precision training", "Distributed training", "Pipeline parallelism", "On-device inference", "Edge AI", "Neuromorphic computing", "Hardware-aware design", "Compiler optimisation for ML", "KV-cache compression", "Sparse training", "Continual learning", "Transfer learning", "Domain adaptation", "Multi-task learning", "AutoML", "Hyperparameter optimisation", "Data-centric AI", "Benchmark design"] },
];

export type DemoConcept = ConceptPoint & { area: string; paper_count: number };

function buildConcepts(): DemoConcept[] {
  const r = rng("demo-concepts");
  const out: DemoConcept[] = [];
  AREAS.forEach((area, ai) => {
    const angle = (ai / AREAS.length) * Math.PI * 2 + 0.3;
    const cx = Math.cos(angle) * 5.2, cy = Math.sin(angle) * 4.4;
    area.topics.forEach((label) => {
      const x = cx + gauss(r) * 1.35, y = cy + gauss(r) * 1.35;
      const papers = Math.round(40 + Math.exp(r() * 5.2) * 14);
      const growth = round(area.growth + gauss(r) * 0.22 - (papers > 1500 ? 0.1 : 0), 2);
      out.push({ id: slug(label), label, x: round(x), y: round(y), paper_count: papers, growth, area: area.name });
    });
  });
  // A few concepts with unknown growth, to exercise the grey "unknown" colour and the dash.
  [7, 61, 115].forEach((i) => { out[i].growth = null; });
  return out;
}
export const DEMO_CONCEPTS: DemoConcept[] = buildConcepts();
const BY_ID = new Map(DEMO_CONCEPTS.map((c) => [c.id, c]));

function nearest(c: DemoConcept, count: number): DemoConcept[] {
  return DEMO_CONCEPTS.filter((o) => o.id !== c.id)
    .map((o) => ({ o, d: (o.x - c.x) ** 2 + (o.y - c.y) ** 2 }))
    .sort((a, b) => a.d - b.d).slice(0, count).map((v) => v.o);
}

function buildEdges(): { predicted: PredictedEdge[]; linked: { source: string; target: string }[] } {
  const r = rng("demo-edges");
  const linked = new Map<string, { source: string; target: string }>();
  DEMO_CONCEPTS.forEach((c) => {
    nearest(c, 2).forEach((o) => {
      const key = [c.id, o.id].sort().join("|");
      if (!linked.has(key)) linked.set(key, { source: c.id, target: o.id });
    });
  });
  const predicted: PredictedEdge[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (predicted.length < 42 && guard < 4000) {
    guard += 1;
    const a = DEMO_CONCEPTS[Math.floor(r() * DEMO_CONCEPTS.length)];
    const b = DEMO_CONCEPTS[Math.floor(r() * DEMO_CONCEPTS.length)];
    if (a.id === b.id || a.area === b.area) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > 7) continue;
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key) || linked.has(key)) continue;
    seen.add(key);
    predicted.push({ source: a.id, target: b.id, p_link: round(0.28 + r() * 0.6, 2) });
  }
  return { predicted, linked: [...linked.values()] };
}
const EDGES = buildEdges();

// ---------------------------------------------------------------- papers and sentences
function demoPaper(key: string, about: string, n: number): PaperSummary {
  const r = rng(`paper-${key}-${n}`);
  const number = 1 + Math.floor(r() * 400);
  const framings = ["a made-up study of", "an invented survey of", "a placeholder analysis of", "an imaginary benchmark for"];
  return {
    id: `demo-paper-${number}`,
    title: `Demo paper ${number}: ${framings[Math.floor(r() * framings.length)]} ${about.toLowerCase()}`,
    year: YEAR_MIN + Math.floor(r() * (YEAR_MAX - YEAR_MIN + 1)),
    url: "", // no links: nothing here is a real paper
  };
}
const SENTENCE_TEMPLATES: Record<OpenProblem["type"], string[]> = {
  open_problem: ["It is still unknown how {c} behaves at larger scale.", "Whether {c} generalises beyond the tested setting stays unresolved."],
  limitation: ["The approach to {c} was only tried on a small invented sample.", "Results for {c} may not transfer to other settings."],
  future_work: ["Future work could combine {c} with a second, unrelated method.", "A natural next step for {c} is a longer study."],
};
const TYPES: OpenProblem["type"][] = ["open_problem", "limitation", "future_work"];
function demoProblems(concept: ConceptSummary, count: number): OpenProblem[] {
  const r = rng(`problems-${concept.id}`);
  return Array.from({ length: count }, (_, i) => {
    const type = TYPES[(i + Math.floor(r() * 3)) % 3];
    const templates = SENTENCE_TEMPLATES[type];
    return {
      sentence: `Demo sentence: ${templates[Math.floor(r() * templates.length)].replace("{c}", concept.label.toLowerCase())}`,
      type,
      confidence: round(0.45 + r() * 0.5, 2),
      concept_ids: [concept.id],
      paper: demoPaper(concept.id, concept.label, 10 + i),
    };
  });
}

// ---------------------------------------------------------------- gaps
function buildGaps(): GapSummary[] {
  const r = rng("demo-gaps");
  const pairs: Array<[string, string]> = ([
    ["Diffusion models", "Offline reinforcement learning"], ["Mechanistic interpretability", "Graph neural networks"],
    ["Federated learning", "Large language models"], ["Neural radiance fields", "World models"],
    ["Differential privacy", "Latent diffusion"], ["Knowledge graph embedding", "Retrieval-augmented generation"],
    ["Model quantisation", "Medical image analysis"], ["World models", "Text-to-video synthesis"],
    ["Causal inference", "Recommender systems"], ["Machine unlearning", "Federated learning"],
    ["Neurosymbolic reasoning", "Code generation"], ["Spatiotemporal forecasting", "Graph transformers"],
    ["Uncertainty quantification", "Autonomous driving"], ["Continual learning", "Mixture of experts"],
  ] as Array<[string, string]>).map(([a, b]) => [slug(a), slug(b)]);
  return pairs.map(([a, b], i) => {
    const ca = BY_ID.get(a)!, cb = BY_ID.get(b)!;
    const p = round(0.86 - i * 0.043 + (r() - 0.5) * 0.04, 2);
    const nullish = i === 4 || i === 9; // exercise the "—" display
    return {
      a, b, a_label: ca.label, b_label: cb.label,
      p_link: p,
      p_lo: nullish ? null : round(p - 0.09 - r() * 0.04, 2),
      p_hi: nullish ? null : round(Math.min(0.99, p + 0.07 + r() * 0.05), 2),
      momentum: nullish ? null : round(0.2 + r() * 1.4, 2),
      novelty: round(0.3 + r() * 0.65, 2),
      gap_rate: round(0.03 + r() * 0.18, 2),
      gap_score: round(p * (0.6 + r() * 0.4), 2),
      starting_weight: (i % 3) as 0 | 1 | 2,
      growth_a: ca.growth, growth_b: cb.growth,
      cosine: round(0.15 + r() * 0.5, 2),
      neighbour_overlap: round(r() * 0.4, 2),
      gap_rate_a: round(0.03 + r() * 0.2, 2), gap_rate_b: round(0.03 + r() * 0.2, 2),
      interval_validation: nullish ? null : { validated: false, interpretation: "Demo interpretation: invented interval, not validated.", coverage: null },
    } satisfies GapSummary;
  });
}
const GAPS = buildGaps();

// ---------------------------------------------------------------- responses
export function demoMeta(): MetaResponse {
  return {
    placeholder: false,
    year_range: { min: YEAR_MIN, max: YEAR_MAX },
    counts: { concepts: DEMO_CONCEPTS.length, gaps: GAPS.length, papers: 12345 },
    headline_metrics: { demo: "invented numbers" },
    titles_available: true,
    titles_note: null,
  };
}

export function demoMap(year: number): MapResponse {
  const middle = DEMO_CONCEPTS[Math.floor(DEMO_CONCEPTS.length / 2)];
  return {
    placeholder: false,
    year,
    concepts: DEMO_CONCEPTS.map((c) => ({ id: c.id, label: c.label, x: c.x, y: c.y, paper_count: c.paper_count, growth: c.growth, area: c.area })),
    edges: EDGES.predicted,
    focus: { x: middle.x, y: middle.y },
    linked_edges: EDGES.linked,
  };
}

export function demoConcept(id: string): ConceptResponse | null {
  const c = BY_ID.get(id);
  if (!c) return null;
  const r = rng(`concept-${id}`);
  const g = c.growth ?? 0;
  let count = Math.max(5, c.paper_count / 12);
  const counts = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => {
    count = Math.max(1, count * (1 + g / 3 + (r() - 0.5) * 0.18));
    return { year: YEAR_MIN + i, count: Math.round(count) };
  });
  const last = counts[counts.length - 1].count;
  const forecast = [1, 2, 3].map((k) => {
    const yhat = Math.round(last * (1 + g / 3) ** k);
    return { year: YEAR_MAX + k, yhat, lo: Math.round(yhat * (1 - 0.08 * k)), hi: Math.round(yhat * (1 + 0.1 * k)) };
  });
  return {
    placeholder: false,
    counts_by_year: counts,
    forecast,
    top_papers: Array.from({ length: 5 }, (_, i) => demoPaper(id, c.label, i)),
    open_problems: demoProblems(c, 3),
    neighbours: nearest(c, 6).map((o) => ({ id: o.id, label: o.label, paper_count: o.paper_count })),
    first_year: YEAR_MIN + Math.floor(r() * 4),
    gap_rate: round(0.04 + r() * 0.22, 2),
    area: c.area,
  };
}

function nullable(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}
export function demoGaps(query: GapQuery = {}): GapListResponse {
  const wanted = new Set(query.concepts ?? []);
  const key = (query.sort ?? "gap_score") as keyof GapSummary;
  let items = GAPS.filter((g) => (wanted.size === 0 || wanted.has(g.a) || wanted.has(g.b)) && (query.min_p === undefined || g.p_link >= query.min_p));
  items = [...items].sort((l, rr) => nullable(l[key] as number | null, rr[key] as number | null) || rr.p_link - l.p_link);
  if (query.limit !== undefined) items = items.slice(0, query.limit);
  return { placeholder: false, items };
}

export function demoGap(a: string, b: string): GapDetail | null {
  const summary = GAPS.find((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a));
  if (!summary) return null;
  const ca = BY_ID.get(summary.a)!, cb = BY_ID.get(summary.b)!;
  const nearB = new Set(nearest(cb, 40).map((o) => o.id));
  const shared = nearest(ca, 40).filter((o) => nearB.has(o.id)).slice(0, 4);
  const picked = shared.length ? shared : nearest(ca, 4);
  return {
    summary,
    closest_a: Array.from({ length: 3 }, (_, i) => demoPaper(ca.id, ca.label, 20 + i)),
    closest_b: Array.from({ length: 3 }, (_, i) => demoPaper(cb.id, cb.label, 30 + i)),
    shared_neighbours: picked.map((o) => ({ id: o.id, label: o.label, paper_count: o.paper_count })),
    open_problems: [...demoProblems(ca, 2), ...demoProblems(cb, 1)],
  };
}

// ---------------------------------------------------------------- open problems and search
export function demoOpenProblems(concept = "", type = ""): OpenProblemResponse {
  const aiRate = (y: number) => round(0.04 + (y - YEAR_MIN) * 0.0035, 3);
  const options = [...DEMO_CONCEPTS].sort((x, y) => y.paper_count - x.paper_count).slice(0, 60)
    .map((c) => ({ id: c.id, label: c.label, paper_count: c.paper_count }));
  const source = concept ? [BY_ID.get(concept)].filter((c): c is DemoConcept => !!c) : options.slice(0, 10).map((o) => BY_ID.get(o.id)!);
  const items = source.flatMap((c) => demoProblems(c, 3)).filter((it) => !type || it.type === type);
  const rates: OpenProblemRatePoint[] = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => {
    const y = YEAR_MIN + i;
    const ai = aiRate(y);
    const conceptRate = concept ? round(Math.min(0.5, ai * (1.2 + (hash(concept) % 90) / 100) + (hash(concept + y) % 50) / 3000), 3) : null;
    return { year: y, ai_ml_rate: ai, concept_rate: conceptRate };
  });
  return { placeholder: false, concept_options: options, items, rates_by_year: rates };
}

export function demoSearch(query: string, k = 20): SearchResponse {
  const needle = query.trim().toLowerCase();
  const hits = needle ? DEMO_CONCEPTS.filter((c) => c.label.toLowerCase().includes(needle)).slice(0, k) : [];
  return {
    placeholder: false,
    concepts: hits.map((c) => ({ id: c.id, label: c.label, paper_count: c.paper_count })),
    papers: hits.slice(0, 4).map((c) => demoPaper(c.id, c.label, 1)),
    focus: hits[0] ? { x: hits[0].x, y: hits[0].y } : null,
  };
}
