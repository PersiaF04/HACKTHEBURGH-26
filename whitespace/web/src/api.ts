import metaFixture from "../mock/meta.json";
import mapFixture from "../mock/map.json";
import searchFixture from "../mock/search.json";
import conceptFixture from "../mock/concept.json";
import gapsFixture from "../mock/gaps.json";
import gapDetailFixture from "../mock/gap-detail.json";
import openProblemsFixture from "../mock/open-problems.json";
import backtestFixture from "../mock/backtest.json";
import coverageFixture from "../mock/coverage.json";

/** Frontend-facing shapes for the proposed Whitespace API in PRD.md §14. */
export type YearRange = { min: number; max: number };
export type PaperSummary = {
  id: string;
  title: string;
  year: number;
  url: string;
  abstract_excerpt?: string;
};
export type ConceptSummary = { id: string; label: string; paper_count?: number };
export type GapPaper = PaperSummary;
export type GapConcept = ConceptSummary;
export type ConceptPoint = ConceptSummary & {
  x: number;
  y: number;
  growth: number | null;
};
export type PredictedEdge = { source: string; target: string; p_link: number };
export type FocusPoint = { x: number; y: number } | null;
export type MapResponse = {
  placeholder: boolean;
  year: number;
  concepts: ConceptPoint[];
  edges: PredictedEdge[];
  focus: FocusPoint;
  /** Static data only: no file exists for this year (for example, after the corpus ends). */
  no_data?: boolean;
};
export type SearchResponse = {
  placeholder?: boolean;
  papers: PaperSummary[];
  concepts: ConceptSummary[];
  focus: FocusPoint;
};
export type MetaResponse = {
  placeholder: boolean;
  year_range: YearRange | null;
  counts: Record<string, number | null>;
  headline_metrics: Record<string, number | string | null>;
};
export type GapSummary = {
  a: string;
  b: string;
  a_label: string;
  b_label: string;
  p_link: number;
  p_lo: number | null;
  p_hi: number | null;
  momentum: number | null;
  novelty: number | null;
  gap_rate: number | null;
  gap_score: number | null;
  starting_weight?: 0 | 1 | 2 | null;
  growth_a?: number | null;
  growth_b?: number | null;
  cosine?: number | null;
  neighbour_overlap?: number | null;
  gap_rate_a?: number | null;
  gap_rate_b?: number | null;
  interval_validation?: { validated: boolean; interpretation: string | null; coverage: number | null } | null;
};
export type OpenProblem = {
  sentence: string;
  type: "future_work" | "limitation" | "open_problem";
  confidence?: number;
  paper: PaperSummary;
};
export type GapOpenProblem = OpenProblem;
export type GapDetail = {
  summary: GapSummary;
  closest_a: PaperSummary[];
  closest_b: PaperSummary[];
  shared_neighbours: ConceptSummary[];
  open_problems: OpenProblem[];
};
export type OpenProblemResponse = {
  placeholder: boolean;
  concept_options: ConceptSummary[];
  items: OpenProblem[];
  rates_by_year?: OpenProblemRatePoint[];
};
export type OpenProblemRatePoint = { year: number; concept_rate: number | null; ai_ml_rate: number | null };
export type CoverageConcept = {
  id: string;
  label: string;
  cells: CoverageCell[];
};
export type CoverageCell = {
  year: number;
  code_rate: number | null;
  paper_count?: number;
  linked_paper_count?: number;
  papers_without_linked_code?: PaperSummary[];
  state?: "available" | "thin" | "outside_archive_vintage" | "unavailable";
};
export type CoverageArchive = {
  source_url: string;
  snapshot_date: string | null;
  revision_sha: string | null;
  file_vintage_verified: boolean;
  license_id: string;
  license_url: string;
};
export type CoverageResponse = {
  placeholder: boolean;
  year: number;
  years: number[];
  concepts: CoverageConcept[];
  caveat: string;
  archive: CoverageArchive;
  /** Static data only: no file exists for this year (for example, after the corpus ends). */
  no_data?: boolean;
};
export type GapListResponse = { placeholder: boolean; items: GapSummary[] };
export type ConceptResponse = {
  placeholder: boolean;
  counts_by_year: { year: number; count: number }[];
  forecast: unknown | null;
  top_papers: PaperSummary[];
  open_problems: OpenProblem[];
  neighbours: ConceptSummary[];
};
export type GapQuery = { concepts?: string[]; min_p?: number; sort?: string; limit?: number };
export type GapDetailResponse = GapDetail | null;
export type BacktestMetric = number | string | null;
export type BacktestHit = { a: string; b: string; score: number | null; year: number | null; starting_weight?: 0 | 1 | 2; paper?: PaperSummary };
export type BaselineName = "current_weight" | "degree_product" | "preferential_attachment" | "adamic_adar" | "cosine";
export type BaselineMetrics = Partial<Record<"roc_auc" | "pr_auc" | "average_precision" | "precision_at_100", BacktestMetric>>;
export type RankingMetrics = {
  base_rate: BacktestMetric;
  roc_auc: BacktestMetric;
  pr_auc: BacktestMetric;
  average_precision: BacktestMetric;
  precision_at_100: BacktestMetric;
  baselines: Partial<Record<BaselineName, BaselineMetrics>>;
};
export type StartingWeightMetrics = Partial<Record<"all" | "0" | "1" | "2", RankingMetrics>>;
export type CalibrationBin = { predicted: number; observed: number; count: number };
export type CodeLinkEvaluation = {
  precision: number | null;
  lower: number | null;
  upper: number | null;
  interval_method: "binomial" | null;
  sample_size: number | null;
  correct_matches: number | null;
  sample_composition: Record<string, number> | null;
  protocol: string | null;
};
export type BacktestResponse = {
  placeholder: boolean;
  base_rate: BacktestMetric;
  roc_auc: BacktestMetric;
  pr_auc: BacktestMetric;
  average_precision: BacktestMetric;
  precision_at_100: BacktestMetric;
  baselines: Partial<Record<BaselineName, BaselineMetrics>>;
  by_starting_weight?: StartingWeightMetrics;
  calibration: { bins: CalibrationBin[]; note?: string | null };
  hits: BacktestHit[];
  misses: BacktestHit[];
  code_link_evaluation: CodeLinkEvaluation;
};

export const API_ROUTES = {
  meta: "/api/meta",
  map: (year: number) => `/api/map?year=${year}`,
  search: (query: string, k = 20) => `/api/search?q=${encodeURIComponent(query)}&k=${k}`,
  concept: (id: string) => `/api/concept/${encodeURIComponent(id)}`,
  gaps: (query: GapQuery = {}) => {
    const params = new URLSearchParams();
    if (query.concepts?.length) params.set("concepts", query.concepts.join(","));
    if (query.min_p !== undefined) params.set("min_p", String(query.min_p));
    if (query.sort) params.set("sort", query.sort);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const encoded = params.toString();
    return `/api/gaps${encoded ? `?${encoded}` : ""}`;
  },
  gap: (a: string, b: string) => `/api/gap/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
  openProblems: (concept = "", type = "") => {
    const params = new URLSearchParams();
    if (concept) params.set("concept", concept);
    if (type) params.set("type", type);
    return `/api/open-problems?${params.toString()}`;
  },
  backtest: "/api/backtest",
  coverage: (year: number) => `/api/coverage?year=${year}`,
} as const;

/**
 * Data modes:
 * - VITE_USE_MOCK=true: always the bundled fixtures in ../mock.
 * - VITE_USE_MOCK=false: fetch the /api/... routes from a server.
 * - unset (default): read the exported files in public/data (served at /data/...) when
 *   /data/meta.json loads, otherwise the bundled fixtures. No external service is called.
 */
const mockSetting = import.meta.env.VITE_USE_MOCK;
const apiMode = mockSetting === "false";
const forceMock = mockSetting === "true";
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
export const MOCK_NOTICE = "Placeholder fixtures only. No corpus, predictions, metrics, paper links, or coverage values are included.";
export const MOCK_META = metaFixture as MetaResponse;

async function requestJson<T>(route: string): Promise<T> {
  const response = await fetch(route);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

// ------------------------------------------------------------------ static export files

/** routes.json from the export runner (#175); only the fields used here. */
type RoutesFile = { corpus_last_year?: number; map_years?: number[] };
/** gap-details.json and concepts.json wrap their keyed payloads in `entries`. */
type KeyedFile<T> = { placeholder?: boolean; entries?: Record<string, T> };

const fileCache = new Map<string, Promise<unknown | null>>();

/**
 * Load `/data/<name>` once. Resolves null when the file is absent: a 404, or a non-JSON body
 * (the Vercel SPA rewrite answers a missing file with index.html and status 200).
 */
function loadFile<T>(name: string): Promise<T | null> {
  let cached = fileCache.get(name);
  if (!cached) {
    cached = fetch(`${DATA_BASE}${name}`).then(async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
      try {
        return JSON.parse(await response.text()) as unknown;
      } catch {
        return null;
      }
    });
    cached.catch(() => fileCache.delete(name)); // a failed request can be retried
    fileCache.set(name, cached);
  }
  return cached as Promise<T | null>;
}

let staticModePromise: Promise<boolean> | null = null;
/** True when the exported files are present (decided once, from /data/meta.json). */
function useStaticData(): Promise<boolean> {
  if (apiMode || forceMock) return Promise.resolve(false);
  staticModePromise ??= loadFile<MetaResponse>("meta.json")
    .then((meta) => meta !== null && typeof meta === "object" && "placeholder" in meta)
    .catch(() => false);
  return staticModePromise;
}

/** Choose the data source for one api call. */
async function pick<T>(route: string, fixture: T, fromStatic: () => Promise<T>): Promise<T> {
  if (apiMode) return requestJson<T>(route);
  if (await useStaticData()) return fromStatic();
  return fixture;
}

/** Fixture labelled as placeholder, for files the export does not have. */
function placeholderFixture<T extends object>(fixture: T): T {
  return { ...fixture, placeholder: true };
}

async function metaPlaceholder(): Promise<boolean> {
  return (await loadFile<MetaResponse>("meta.json"))?.placeholder !== false;
}

function entriesOf<T>(file: KeyedFile<T> | null): Record<string, T> {
  return file?.entries ?? {};
}

/** Year files that do not exist (for example, after the corpus ends) mean "no data", not zero. */
async function staticByYear<T extends { placeholder: boolean }>(prefix: "map" | "coverage", year: number, empty: T): Promise<T> {
  const file = await loadFile<T>(`${prefix}-${year}.json`);
  if (file) return file;
  return { ...empty, year, placeholder: await metaPlaceholder(), no_data: true };
}

async function staticMeta(): Promise<MetaResponse> {
  const meta = (await loadFile<MetaResponse>("meta.json"))!;
  if (meta.year_range) return meta;
  // A synthetic export leaves year_range null; routes.json still lists the map years.
  const years = (await loadFile<RoutesFile>("routes.json"))?.map_years ?? [];
  return years.length ? { ...meta, year_range: { min: Math.min(...years), max: Math.max(...years) } } : meta;
}

function compareNullable(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a; // descending
}

async function staticGaps(query: GapQuery): Promise<GapListResponse> {
  const file = await loadFile<GapListResponse>("gaps.json");
  if (!file) return placeholderFixture(gapsFixture as GapListResponse);
  const wanted = new Set(query.concepts ?? []);
  const sortKey = (query.sort ?? "gap_score") as keyof GapSummary;
  let items = file.items.filter((gap) =>
    (wanted.size === 0 || wanted.has(gap.a) || wanted.has(gap.b))
    && (query.min_p === undefined || gap.p_link >= query.min_p));
  items = [...items].sort((left, right) =>
    compareNullable(left[sortKey] as number | null, right[sortKey] as number | null) || right.p_link - left.p_link);
  if (query.limit !== undefined) items = items.slice(0, query.limit);
  return { ...file, items };
}

async function staticGap(a: string, b: string): Promise<GapDetailResponse> {
  const entries = entriesOf(await loadFile<KeyedFile<GapDetail>>("gap-details.json"));
  return entries[`${a}|${b}`] ?? entries[`${b}|${a}`] ?? null;
}

async function staticConcept(id: string): Promise<ConceptResponse | null> {
  return entriesOf(await loadFile<KeyedFile<ConceptResponse>>("concepts.json"))[id] ?? null;
}

/** Simple client-side search: concept ids and labels containing the query, prefix matches first. */
async function staticSearch(query: string, k: number): Promise<SearchResponse> {
  const file = await loadFile<KeyedFile<ConceptResponse>>("concepts.json");
  const entries = Object.entries(entriesOf(file));
  if (entries.length === 0) {
    const fallback = await loadFile<SearchResponse>("search.json");
    return fallback ?? placeholderFixture(searchFixture as SearchResponse);
  }
  const needle = query.trim().toLocaleLowerCase();
  const matches = entries
    .filter(([id]) => needle && id.toLocaleLowerCase().includes(needle))
    .map(([id, concept]) => ({
      id,
      concept,
      prefix: id.toLocaleLowerCase().startsWith(needle) ? 0 : 1,
      count: concept.counts_by_year.reduce((sum, row) => sum + row.count, 0),
    }))
    .sort((x, y) => x.prefix - y.prefix || y.count - x.count || x.id.localeCompare(y.id))
    .slice(0, k);
  const papers = new Map<string, PaperSummary>();
  for (const match of matches) {
    for (const paper of match.concept.top_papers) if (papers.size < k) papers.set(paper.id, paper);
  }
  return {
    placeholder: file?.placeholder ?? true,
    concepts: matches.map((match) => ({ id: match.id, label: match.id, paper_count: match.count })),
    papers: [...papers.values()],
    focus: null,
  };
}

async function staticOpenProblems(type: string): Promise<OpenProblemResponse> {
  const file = await loadFile<OpenProblemResponse>("open-problems.json")
    ?? placeholderFixture(openProblemsFixture as OpenProblemResponse);
  // Items carry no concept id, so only the type filter can be applied client-side.
  return type ? { ...file, items: file.items.filter((item) => item.type === type) } : file;
}

async function staticOrFixture<T extends object>(name: string, fixture: T): Promise<T> {
  return (await loadFile<T>(name)) ?? placeholderFixture(fixture);
}

/** Local data only by default, so the demo has no judging-time network dependency. */
export const api = {
  meta: () => pick<MetaResponse>(API_ROUTES.meta, metaFixture as MetaResponse, staticMeta),
  map: (year: number) => {
    const fixture = { ...mapFixture, year } as MapResponse;
    return pick<MapResponse>(API_ROUTES.map(year), fixture, () =>
      staticByYear("map", year, { ...fixture, concepts: [], edges: [], focus: null }));
  },
  search: (query: string, k = 20) =>
    pick<SearchResponse>(API_ROUTES.search(query, k), searchFixture as SearchResponse, () => staticSearch(query, k)),
  concept: (id: string) =>
    pick<ConceptResponse | null>(API_ROUTES.concept(id), conceptFixture as ConceptResponse, () => staticConcept(id)),
  gaps: (query: GapQuery = {}) =>
    pick<GapListResponse>(API_ROUTES.gaps(query), gapsFixture as GapListResponse, () => staticGaps(query)),
  gap: (a: string, b: string) =>
    pick<GapDetailResponse>(API_ROUTES.gap(a, b), gapDetailFixture.summary ? gapDetailFixture as unknown as GapDetail : null,
      () => staticGap(a, b)),
  openProblems: (concept = "", type = "") =>
    pick<OpenProblemResponse>(API_ROUTES.openProblems(concept, type), openProblemsFixture as OpenProblemResponse,
      () => staticOpenProblems(type)),
  backtest: () =>
    pick<BacktestResponse>(API_ROUTES.backtest, backtestFixture as BacktestResponse,
      () => staticOrFixture("backtest.json", backtestFixture as BacktestResponse)),
  coverage: (year: number) => {
    const fixture = { ...coverageFixture, year } as CoverageResponse;
    return pick<CoverageResponse>(API_ROUTES.coverage(year), fixture, () =>
      staticByYear("coverage", year, { ...fixture, concepts: [], years: [] }));
  },
};

export function isPlaceholder(data: { placeholder?: boolean }): boolean {
  return data.placeholder === true;
}
