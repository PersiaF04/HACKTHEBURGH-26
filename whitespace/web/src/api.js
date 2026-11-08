import metaFixture from "../mock/meta.json";
import mapFixture from "../mock/map.json";
import searchFixture from "../mock/search.json";
import conceptFixture from "../mock/concept.json";
import gapsFixture from "../mock/gaps.json";
import gapDetailFixture from "../mock/gap-detail.json";
import openProblemsFixture from "../mock/open-problems.json";
import backtestFixture from "../mock/backtest.json";
import coverageFixture from "../mock/coverage.json";
export const API_ROUTES = {
    meta: "/api/meta",
    map: (year) => `/api/map?year=${year}`,
    search: (query, k = 20) => `/api/search?q=${encodeURIComponent(query)}&k=${k}`,
    concept: (id) => `/api/concept/${encodeURIComponent(id)}`,
    gaps: (query = {}) => {
        const params = new URLSearchParams();
        if (query.concepts?.length)
            params.set("concepts", query.concepts.join(","));
        if (query.min_p !== undefined)
            params.set("min_p", String(query.min_p));
        if (query.sort)
            params.set("sort", query.sort);
        if (query.limit !== undefined)
            params.set("limit", String(query.limit));
        const encoded = params.toString();
        return `/api/gaps${encoded ? `?${encoded}` : ""}`;
    },
    gap: (a, b) => `/api/gap/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
    openProblems: (concept = "", type = "") => {
        const params = new URLSearchParams();
        if (concept)
            params.set("concept", concept);
        if (type)
            params.set("type", type);
        return `/api/open-problems?${params.toString()}`;
    },
    backtest: "/api/backtest",
    coverage: (year) => `/api/coverage?year=${year}`,
};
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
export const MOCK_META = metaFixture;
async function requestJson(route) {
    const response = await fetch(route);
    if (!response.ok)
        throw new Error(`Request failed (${response.status})`);
    return (await response.json());
}
const fileCache = new Map();
/**
 * Load `/data/<name>` once. Resolves null when the file is absent: a 404, or a non-JSON body
 * (the Vercel SPA rewrite answers a missing file with index.html and status 200).
 */
function loadFile(name) {
    let cached = fileCache.get(name);
    if (!cached) {
        cached = fetch(`${DATA_BASE}${name}`).then(async (response) => {
            if (response.status === 404)
                return null;
            if (!response.ok)
                throw new Error(`Could not load ${name} (${response.status})`);
            try {
                return JSON.parse(await response.text());
            }
            catch {
                return null;
            }
        });
        cached.catch(() => fileCache.delete(name)); // a failed request can be retried
        fileCache.set(name, cached);
    }
    return cached;
}
let staticModePromise = null;
/** True when the exported files are present (decided once, from /data/meta.json). */
function useStaticData() {
    if (apiMode || forceMock)
        return Promise.resolve(false);
    staticModePromise ?? (staticModePromise = loadFile("meta.json")
        .then((meta) => meta !== null && typeof meta === "object" && "placeholder" in meta)
        .catch(() => false));
    return staticModePromise;
}
/** Choose the data source for one api call. */
async function pick(route, fixture, fromStatic) {
    if (apiMode)
        return requestJson(route);
    if (await useStaticData())
        return fromStatic();
    return fixture;
}
/** Fixture labelled as placeholder, for files the export does not have. */
function placeholderFixture(fixture) {
    return { ...fixture, placeholder: true };
}
async function metaPlaceholder() {
    return (await loadFile("meta.json"))?.placeholder !== false;
}
function entriesOf(file) {
    return file?.entries ?? {};
}
/** Year files that do not exist (for example, after the corpus ends) mean "no data", not zero. */
async function staticByYear(prefix, year, empty) {
    const file = await loadFile(`${prefix}-${year}.json`);
    if (file)
        return file;
    return { ...empty, year, placeholder: await metaPlaceholder(), no_data: true };
}
async function staticMeta() {
    const meta = (await loadFile("meta.json"));
    if (meta.year_range)
        return meta;
    // A synthetic export leaves year_range null; routes.json still lists the map years.
    const years = (await loadFile("routes.json"))?.map_years ?? [];
    return years.length ? { ...meta, year_range: { min: Math.min(...years), max: Math.max(...years) } } : meta;
}
function compareNullable(a, b) {
    if (a == null && b == null)
        return 0;
    if (a == null)
        return 1;
    if (b == null)
        return -1;
    return b - a; // descending
}
async function staticGaps(query) {
    const file = await loadFile("gaps.json");
    if (!file)
        return placeholderFixture(gapsFixture);
    const wanted = new Set(query.concepts ?? []);
    const sortKey = (query.sort ?? "gap_score");
    let items = file.items.filter((gap) => (wanted.size === 0 || wanted.has(gap.a) || wanted.has(gap.b))
        && (query.min_p === undefined || gap.p_link >= query.min_p));
    items = [...items].sort((left, right) => compareNullable(left[sortKey], right[sortKey]) || right.p_link - left.p_link);
    if (query.limit !== undefined)
        items = items.slice(0, query.limit);
    return { ...file, items };
}
async function staticGap(a, b) {
    const entries = entriesOf(await loadFile("gap-details.json"));
    return entries[`${a}|${b}`] ?? entries[`${b}|${a}`] ?? null;
}
async function staticConcept(id) {
    return entriesOf(await loadFile("concepts.json"))[id] ?? null;
}
/** Simple client-side search: concept ids and labels containing the query, prefix matches first. */
async function staticSearch(query, k) {
    const file = await loadFile("concepts.json");
    const entries = Object.entries(entriesOf(file));
    if (entries.length === 0) {
        const fallback = await loadFile("search.json");
        return fallback ?? placeholderFixture(searchFixture);
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
    const papers = new Map();
    for (const match of matches) {
        for (const paper of match.concept.top_papers)
            if (papers.size < k)
                papers.set(paper.id, paper);
    }
    return {
        placeholder: file?.placeholder ?? true,
        concepts: matches.map((match) => ({ id: match.id, label: match.id, paper_count: match.count })),
        papers: [...papers.values()],
        focus: null,
    };
}
async function staticOpenProblems(type) {
    const file = await loadFile("open-problems.json")
        ?? placeholderFixture(openProblemsFixture);
    // Items carry no concept id, so only the type filter can be applied client-side.
    return type ? { ...file, items: file.items.filter((item) => item.type === type) } : file;
}
async function staticOrFixture(name, fixture) {
    return (await loadFile(name)) ?? placeholderFixture(fixture);
}
/** Local data only by default, so the demo has no judging-time network dependency. */
export const api = {
    meta: () => pick(API_ROUTES.meta, metaFixture, staticMeta),
    map: (year) => {
        const fixture = { ...mapFixture, year };
        return pick(API_ROUTES.map(year), fixture, () => staticByYear("map", year, { ...fixture, concepts: [], edges: [], focus: null }));
    },
    search: (query, k = 20) => pick(API_ROUTES.search(query, k), searchFixture, () => staticSearch(query, k)),
    concept: (id) => pick(API_ROUTES.concept(id), conceptFixture, () => staticConcept(id)),
    gaps: (query = {}) => pick(API_ROUTES.gaps(query), gapsFixture, () => staticGaps(query)),
    gap: (a, b) => pick(API_ROUTES.gap(a, b), gapDetailFixture.summary ? gapDetailFixture : null, () => staticGap(a, b)),
    openProblems: (concept = "", type = "") => pick(API_ROUTES.openProblems(concept, type), openProblemsFixture, () => staticOpenProblems(type)),
    backtest: () => pick(API_ROUTES.backtest, backtestFixture, () => staticOrFixture("backtest.json", backtestFixture)),
    coverage: (year) => {
        const fixture = { ...coverageFixture, year };
        return pick(API_ROUTES.coverage(year), fixture, () => staticByYear("coverage", year, { ...fixture, concepts: [], years: [] }));
    },
};
export function isPlaceholder(data) {
    return data.placeholder === true;
}
