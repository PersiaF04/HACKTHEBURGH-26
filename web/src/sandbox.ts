// "Place your load" (#75). Pure functions only, so the UI never owns the scoring.
// When lane B's optional sandbox.json (#76/#78) is present, scoreSchedule is a line-for-line port of its reference scorer
// (models/turnup/sandbox.py score_schedule). Without it, estimateLoad gives a clearly labelled rough estimate.
import type { Copilot, DfsRequest, Meta, Replay } from "./data";

export type Zone = "Z1" | "Z2" | "Z3";
export const ZONES: Zone[] = ["Z1", "Z2", "Z3"];
export type LoadType = "electrolyser" | "data_centre" | "heat_network";
export const LOAD_TYPES: { id: LoadType; label: string }[] = [
  { id: "electrolyser", label: "Electrolyser" },
  { id: "data_centre", label: "Data centre" },
  { id: "heat_network", label: "Heat network" },
];

// ---- sandbox.json (contract: contracts/README.md, `sandbox.json`) ----
export interface SandboxHalfHour {
  sp: number; start_utc: string; curtailed_mwh: number; mid_gbp_per_mwh: number | null; request: boolean;
  caps_mw: Record<string, number>; ceiling_gbp_per_mwh: Record<string, number | null>;
}
export type Schedule = [number, number][]; // [sp, bid £/MWh]
export interface SandboxPolicies { naive: Schedule | null; ours: Schedule | null; oracle: Schedule | null }
export interface SandboxDay { half_hours: SandboxHalfHour[]; ours_available: boolean; policies: Record<string, Record<string, SandboxPolicies>> }
export interface SandboxLoad { capacity_mw: number; zone: string; value_gbp_per_mwh: number; max_periods: number }
export interface Sandbox {
  meta: Meta; load_defaults: SandboxLoad & { type: string }; grids: { zones: string[]; value_gbp_per_mwh: number[] };
  scoring_rule: string[]; days: Record<string, SandboxDay>;
  test_vectors?: { id: string; day: string; load: SandboxLoad; schedule: Schedule; expected: ScheduleScore }[];
}
export interface ScheduleScore { mwh: number; wind_matched_mwh: number; gross_gbp: number; energy_cost_gbp: number; value_gbp: number; net_gbp: number; accepted_half_hours: number }

/** Port of score_schedule. Same order of operations as the Python reference, so results match to the cent. */
export function scoreSchedule(day: SandboxDay, load: SandboxLoad, schedule: Schedule): ScheduleScore & { accepted_sps: number[] } {
  const { zone, capacity_mw: mw, max_periods: budget, value_gbp_per_mwh: value } = load;
  const mwhPeriod = mw * 0.5;
  let gross = 0, energy = 0, windMatched = 0, accepted = 0;
  const acceptedSps: number[] = [];
  for (const [sp, bid] of [...schedule].sort((a, b) => a[0] - b[0])) {
    if (accepted >= budget) break;
    const hh = day.half_hours[sp - 1];
    if (!hh) continue;
    const ceiling = hh.ceiling_gbp_per_mwh[zone] ?? null, mid = hh.mid_gbp_per_mwh;
    if (!hh.request || (hh.caps_mw[zone] ?? 0) < mw || ceiling == null || mid == null || bid > ceiling) continue;
    gross += bid * mwhPeriod;
    energy += mid * mwhPeriod;
    windMatched += Math.min(mwhPeriod, hh.curtailed_mwh);
    accepted += 1;
    acceptedSps.push(sp);
  }
  const mwh = accepted * mwhPeriod;
  const valueGbp = value * mwh;
  return { mwh, wind_matched_mwh: windMatched, gross_gbp: gross, energy_cost_gbp: energy, value_gbp: valueGbp, net_gbp: gross + valueGbp - energy, accepted_half_hours: accepted, accepted_sps: acceptedSps };
}

/** Half-hours in a zone where a bid could have been accepted (request, a ceiling and a price), over the Copilot's scored days. */
export function tradablePot(sb: Sandbox, zone: string) {
  const scored = Object.values(sb.days).filter((d) => d.ours_available);
  const n = scored.reduce((s, d) => s + d.half_hours.filter((h) => h.request && h.ceiling_gbp_per_mwh[zone] != null && h.mid_gbp_per_mwh != null).length, 0);
  return { halfHours: n, days: scored.length };
}

// ---- "+X GW cables south" what-if (#80 data) ----
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** NESO's day-ahead SCOTEX flow and limit for a half-hour, or null when either is missing. */
export function boundaryOf(p: { scotex_flow_mw?: number | null; scotex_limit_mw?: number | null }) {
  return finite(p.scotex_flow_mw) && finite(p.scotex_limit_mw) && p.scotex_limit_mw > 0 ? { flow: p.scotex_flow_mw, limit: p.scotex_limit_mw } : null;
}

/**
 * Simple counterfactual, not a power-flow model: with the limit raised by `extraMw`, the excess flow above the limit shrinks,
 * and that reduction (MW × 0.5 h) is curtailment avoided, capped at what was actually curtailed that half-hour.
 */
export function avoidedMwh(curtailedMwh: number, flowMw: number, limitMw: number, extraMw: number): number {
  const relief = Math.max(0, flowMw - limitMw) - Math.max(0, flowMw - (limitMw + extraMw));
  return Math.max(0, Math.min(curtailedMwh, relief * 0.5));
}

// ---- What the dashboard shows ----
export interface LoadResult {
  source: "sandbox" | "estimate";
  /** start_utc of each half-hour the user's load is switched on. */
  on: Set<string>;
  /** The load's own consumption (full delivery assumed); wind_matched_mwh is an approximate upper bound on how much was otherwise-curtailed wind. */
  mwh: number; wind_matched_mwh: number;
  net_gbp: number | null;
  /** Policies scored for the same load; null when not available for this day (ours: no Copilot call on warm-up days). */
  naive_gbp: number | null; ours_gbp: number | null; oracle_gbp: number | null;
  note: string;
}

export interface UserLoad { mw: number; bid: number; zone: Zone; value: number }

/** The user bids one price in every half-hour NESO asked for turn-up, scored with lane B's rule. */
export function scoreUserLoad(sb: Sandbox, date: string, u: UserLoad): LoadResult | null {
  const day = sb.days[date];
  if (!day) return null;
  const load: SandboxLoad = { capacity_mw: u.mw, zone: u.zone, value_gbp_per_mwh: u.value, max_periods: sb.load_defaults.max_periods };
  const mine = scoreSchedule(day, load, day.half_hours.filter((h) => h.request).map((h) => [h.sp, u.bid] as [number, number]));
  // Policy schedules only rank half-hours, so they are re-scored at the user's MW. Fall back to the nearest site value on the grid.
  const grid = sb.grids.value_gbp_per_mwh;
  const v = grid.reduce((b, x) => (Math.abs(x - u.value) < Math.abs(b - u.value) ? x : b), grid[0]);
  const pol = day.policies[u.zone]?.[String(v)];
  const score = (s: Schedule | null | undefined) => (s ? scoreSchedule(day, load, s).net_gbp : null);
  return {
    source: "sandbox",
    on: new Set(mine.accepted_sps.map((sp) => day.half_hours[sp - 1].start_utc)),
    mwh: mine.mwh, wind_matched_mwh: mine.wind_matched_mwh, net_gbp: mine.net_gbp,
    naive_gbp: score(pol?.naive), ours_gbp: day.ours_available ? score(pol?.ours) : null, oracle_gbp: score(pol?.oracle),
    note: `Bids £${u.bid}/MWh in every turn-up half-hour; on when the bid is at or below NESO's accepted price in ${u.zone}, at most ${load.max_periods} a day. ` +
      "Pay-as-bid and full delivery assumed; electricity at the market index price, not a site tariff.",
  };
}

/**
 * Fallback when sandbox.json is absent: on in turn-up half-hours where the bid is at or below NESO's accepted median
 * (else the Copilot's bid), absorbing min(MW × 0.5 h, curtailed MWh). Electricity at the Copilot's day-average price.
 */
export function estimateLoad(u: UserLoad, replay: Replay, requests: DfsRequest[], copilot: Copilot | null): LoadResult {
  const asked = new Map<string, DfsRequest>();
  for (const r of requests) if (r.direction === "Upwards" && r.tag === "System") asked.set(r.start_utc, r);
  const day = copilot?.days.find((d) => d.date === replay.date) ?? null;
  const plan = new Map((day?.schedule ?? []).map((s) => [s.start_utc, s.bid_gbp_per_mwh]));
  const on = new Set<string>();
  let mwh = 0, matched = 0;
  for (const p of replay.periods) {
    const req = asked.get(p.start_utc);
    const ceiling = req?.accepted_price_median_gbp_per_mwh ?? (req ? plan.get(p.start_utc) ?? null : null);
    if (ceiling == null || u.bid > ceiling) continue;
    const curtailed = Object.values(p.farms).reduce((s, f) => s + (f.curtailed_mwh ?? 0), 0);
    on.add(p.start_utc);
    mwh += u.mw * 0.5;
    matched += Math.min(u.mw * 0.5, curtailed);
  }
  const ours = copilot?.days.reduce((s, d) => s + d.policies.ours.mwh, 0) ?? 0;
  const price = copilot && ours > 0 && copilot.summary.energy_cost_gbp ? copilot.summary.energy_cost_gbp / ours : null;
  const scale = copilot ? u.mw / copilot.load.capacity_mw : 1;
  return {
    source: "estimate", on, mwh, wind_matched_mwh: matched,
    net_gbp: price == null ? null : mwh * (u.bid + u.value - price),
    naive_gbp: null,
    ours_gbp: day && day.schedule.length ? day.policies.ours.gbp * scale : null,
    oracle_gbp: day ? day.policies.oracle.gbp * scale : null,
    note: "Rough estimate until lane B's scoring data loads: accepted-price ceilings, a day-average electricity price, Copilot figures scaled by MW, so it can read higher than the oracle.",
  };
}
