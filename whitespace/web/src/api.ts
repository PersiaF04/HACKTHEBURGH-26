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
export type MetaResponse = {
  placeholder: boolean;
  year_range: YearRange;
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
};
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
};
export type CoverageResponse = {
  placeholder: boolean;
  year: number;
  years: number[];
  concepts: CoverageConcept[];
  caveat: string;
};
export type GapListResponse = { placeholder: boolean; items: GapSummary[] };

export const API_ROUTES = {
  meta: "/api/meta",
  map: (year: number) => `/api/map?year=${year}`,
  search: (query: string, k = 20) => `/api/search?q=${encodeURIComponent(query)}&k=${k}`,
  concept: (id: string) => `/api/concept/${encodeURIComponent(id)}`,
  gaps: (query = "") => `/api/gaps${query ? `?${query}` : ""}`,
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

/** Data interface intentionally stays on local placeholder fixtures for the offline demo. */
export async function readMock<T>(fixture: T): Promise<T> {
  return fixture;
}
