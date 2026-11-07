// Ask the Grid tools: pure reads over the committed JSON in data/public (issue #91 manifest).
// Port of models/ask_golden.py. The chat model routes questions to these and words the result;
// every figure in an answer must come from a tool result. Keep outputs identical to the Python
// reference: api/ask.test.ts checks them against contracts/fixtures/ask-golden.json.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type ToolResult = Record<string, Json>;
export type Reader = (file: string) => Json | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reader over a data directory (a data/public checkout or the synced web/public/data). Returns null if missing. */
export function fileReader(dir: string): Reader {
  return (file) => {
    if (file.includes("..")) return null;
    const path = join(dir, file);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
  };
}

/** Find the data directory at runtime: the function bundle (Vercel) or the repo checkout (local). */
export function defaultDataDir(): string {
  const candidates = [
    join(process.cwd(), "public", "data"),
    join(process.cwd(), "web", "public", "data"),
    join(process.cwd(), "data", "public"),
    join(process.cwd(), "..", "data", "public"),
  ];
  return candidates.find((d) => existsSync(join(d, "curtailment_daily.json"))) ?? candidates[0];
}

const src = (file: string, ...fields: string[]) => [{ file, fields }];
const round = (x: number, dp: number) => Number(x.toFixed(dp));
const must = (read: Reader, file: string) => {
  const d = read(file);
  if (d === null) throw new Error(`missing data file ${file}`);
  return d;
};
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

export function curtailment_for_day(read: Reader, a: { date: string }): ToolResult {
  const day = must(read, "curtailment_daily.json").days.find((d: Json) => d.date === a.date);
  if (!day) return { error: "no_data", date: a.date };
  const keys = ["curtailed_mwh", "wind_paid_gbp", "neso_thermal_mwh", "neso_thermal_gbp"];
  return { date: a.date, ...Object.fromEntries(keys.map((k) => [k, day[k]])), source: src("curtailment_daily.json", ...keys) };
}

export function top_curtailment_days(read: Reader, a: { n: number; month?: string | null }): ToolResult {
  const month = a.month ?? null;
  const days = must(read, "curtailment_daily.json").days.filter(
    (d: Json) => d.curtailed_mwh !== null && (month === null || d.date.startsWith(month)),
  );
  days.sort((x: Json, y: Json) => y.curtailed_mwh - x.curtailed_mwh || cmp(x.date, y.date));
  return {
    month,
    days: days.slice(0, a.n).map((d: Json) => ({ date: d.date, curtailed_mwh: d.curtailed_mwh })),
    source: src("curtailment_daily.json", "curtailed_mwh"),
  };
}

const replay = (read: Reader, date: unknown) => (typeof date === "string" && DATE.test(date) ? read(`replay/${date}.json`) : null);

export function top_farms_for_day(read: Reader, a: { date: string; n: number }): ToolResult {
  const rep = replay(read, a.date);
  if (rep === null) return { error: "no_replay_for_date", date: a.date };
  const names = new Map<string, string>(must(read, "farms.json").farms.map((f: Json) => [f.id, f.name]));
  const tot = new Map<string, number>();
  for (const p of rep.periods) for (const [id, f] of Object.entries<Json>(p.farms)) tot.set(id, (tot.get(id) ?? 0) + (f.curtailed_mwh ?? 0));
  const ranked = [...tot.entries()].sort((x, y) => y[1] - x[1] || cmp(x[0], y[0])).slice(0, a.n);
  return {
    date: a.date,
    farms: ranked.map(([id, t]) => ({ id, name: names.get(id) ?? null, curtailed_mwh: round(t, 1) })),
    source: [...src(`replay/${a.date}.json`, "periods[].farms.*.curtailed_mwh"), ...src("farms.json", "name")],
  };
}

export function scotex_gap(read: Reader, a: { date: string }): ToolResult {
  const rep = replay(read, a.date);
  if (rep === null) return { error: "no_replay_for_date", date: a.date };
  let over = 0;
  let worst: [number, number] | null = null;
  for (const p of rep.periods) {
    if (p.scotex_limit_mw === null || p.scotex_flow_mw === null) continue;
    const gap = p.scotex_flow_mw - p.scotex_limit_mw;
    if (gap > 0) over += 1;
    if (worst === null || gap > worst[0]) worst = [gap, p.sp];
  }
  return {
    date: a.date,
    periods_over_limit: over,
    max_overshoot_mw: worst ? round(worst[0], 3) : null,
    max_overshoot_sp: worst ? worst[1] : null,
    source: src(`replay/${a.date}.json`, "periods[].scotex_flow_mw", "periods[].scotex_limit_mw"),
  };
}

export function dfs_requests_for_day(read: Reader, a: { date?: string | null }): ToolResult {
  const date = a.date ?? null;
  const reqs = must(read, "dfs_requests.json").requests.filter((r: Json) => date === null || r.start_utc.slice(0, 10) === date);
  // MW x the row's duration in hours (rows are 30 minutes); summing MW alone would double count.
  const hours = (r: Json) => (Date.parse(r.end_utc) - Date.parse(r.start_utc)) / 3_600_000;
  const req = round(reqs.reduce((s: number, r: Json) => s + r.required_mw * hours(r), 0), 3);
  const got = round(reqs.reduce((s: number, r: Json) => s + r.procured_mw * hours(r), 0), 3);
  return {
    date,
    requests: reqs.length,
    required_mwh_total: req,
    procured_mwh_total: got,
    procured_pct: req ? round((100 * got) / req, 2) : null,
    source: src("dfs_requests.json", "start_utc", "required_mw", "procured_mw"),
  };
}

export function forecast_tomorrow(read: Reader): ToolResult {
  const t = must(read, "dashboard.json").tomorrow;
  const f = t.facts;
  return {
    target_date: t.target_date,
    headline: t.headline,
    total_p50_mwh: f.total_p50_mwh,
    peak_p90_mwh: f.peak_p90_mwh,
    peak_p_request: f.peak_p_request,
    request_window_utc: f.request_window_utc,
    source: src("dashboard.json", "tomorrow.headline", "tomorrow.facts"),
  };
}

export function copilot_call(read: Reader, a: { date: string }): ToolResult {
  const day = must(read, "dashboard.json").replay_days.find((d: Json) => d.date === a.date);
  if (!day) return { error: "no_copilot_for_date", date: a.date };
  const c = day.copilot;
  const out: ToolResult = { date: a.date, status: c.status };
  if (c.status === "scored") for (const k of ["ready_windows_utc", "bid_gbp_per_mwh", "net_gbp", "pct_of_oracle"]) out[k] = c[k];
  else out.reason = c.reason;
  out.source = src("dashboard.json", `replay_days[${a.date}].copilot`);
  return out;
}

export function farm_lookup(read: Reader, a: { name: string }): ToolResult {
  const q = String(a.name).toLowerCase();
  const hits = must(read, "farms.json").farms.filter((f: Json) => f.name.toLowerCase().includes(q));
  return {
    query: a.name,
    matches: hits.slice(0, 5).map((f: Json) => ({ id: f.id, name: f.name, region: f.region, capacity_mw: f.capacity_mw })),
    source: src("farms.json", "id", "name", "region", "capacity_mw"),
  };
}

type Fn = (read: Reader, args: Json) => ToolResult;
export const TOOLS: Record<string, Fn> = {
  curtailment_for_day, top_curtailment_days, top_farms_for_day, scotex_gap,
  dfs_requests_for_day, forecast_tomorrow, copilot_call, farm_lookup,
};

/** Run a tool by name with model-supplied arguments. Never throws: bad input becomes an error result. */
export function runTool(read: Reader, name: string, args: Json): ToolResult {
  const fn = TOOLS[name];
  if (!fn) return { error: "unknown_tool", tool: name };
  const a = args && typeof args === "object" ? args : {};
  const isDate = (v: unknown) => typeof v === "string" && DATE.test(v);
  const isN = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
  if (["curtailment_for_day", "top_farms_for_day", "scotex_gap", "copilot_call"].includes(name) && !isDate(a.date)) return { error: "bad_arguments", detail: "date must be YYYY-MM-DD" };
  if (name === "top_curtailment_days" && (!isN(a.n, 20) || (a.month != null && !/^\d{4}-\d{2}$/.test(a.month)))) return { error: "bad_arguments", detail: "n 1-20, optional month YYYY-MM" };
  if (name === "top_farms_for_day" && !isN(a.n, 10)) return { error: "bad_arguments", detail: "n 1-10" };
  if (name === "dfs_requests_for_day" && a.date != null && !isDate(a.date)) return { error: "bad_arguments", detail: "date must be YYYY-MM-DD" };
  if (name === "farm_lookup" && (typeof a.name !== "string" || a.name.length < 2)) return { error: "bad_arguments", detail: "name needs 2+ characters" };
  try {
    return fn(read, a);
  } catch (e) {
    return { error: "tool_failed", detail: e instanceof Error ? e.message : "unknown" };
  }
}
