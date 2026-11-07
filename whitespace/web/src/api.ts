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
};
export type SearchResponse = {
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

const mockMode = import.meta.env.VITE_USE_MOCK !== "false";
export const MOCK_NOTICE = "Placeholder fixtures only. No corpus, predictions, metrics, paper links, or coverage values are included.";
export const MOCK_META = metaFixture as MetaResponse;

async function requestJson<T>(route: string, fixture: T): Promise<T> {
  if (mockMode) return fixture;
  const response = await fetch(route);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

/** Local placeholders are the default, so the demo has no judging-time network dependency. */
export const api = {
  meta: () => requestJson<MetaResponse>(API_ROUTES.meta, metaFixture),
  map: (year: number) => requestJson<MapResponse>(API_ROUTES.map(year), { ...mapFixture, year } as MapResponse),
  search: (query: string, k = 20) => requestJson<SearchResponse>(API_ROUTES.search(query, k), searchFixture),
  concept: (id: string) => requestJson<ConceptResponse>(API_ROUTES.concept(id), conceptFixture as ConceptResponse),
  gaps: (query: GapQuery = {}) => requestJson<GapListResponse>(API_ROUTES.gaps(query), gapsFixture),
  gap: (a: string, b: string) =>
    requestJson<GapDetailResponse>(API_ROUTES.gap(a, b), gapDetailFixture.summary ? gapDetailFixture as unknown as GapDetail : null),
  openProblems: (concept = "", type = "") =>
    requestJson<OpenProblemResponse>(API_ROUTES.openProblems(concept, type), openProblemsFixture),
  backtest: () => requestJson<BacktestResponse>(API_ROUTES.backtest, backtestFixture),
  coverage: (year: number) =>
    requestJson<CoverageResponse>(API_ROUTES.coverage(year), { ...coverageFixture, year } as CoverageResponse),
};

export function isPlaceholder(data: { placeholder?: boolean }): boolean {
  return data.placeholder === true;
}
