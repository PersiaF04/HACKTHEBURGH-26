import { useEffect, useState } from "react";

// Types mirror contracts/README.md (data contract v1).
export interface Meta { source: string[]; generated_utc: string; retrospective: boolean; fixture?: boolean; target_note?: string }
export interface Farm { id: string; name: string; region: string; lat: number | null; lon: number | null; capacity_mw: number | null }
export type FarmState = "generating" | "instructed" | "unavailable" | "unknown";
export interface FarmPeriod { pn_mw: number | null; level_mw: number | null; curtailed_mwh: number | null; paid_gbp: number | null; state: FarmState }
// scotex_*: optional (#80). NESO day-ahead SCOTEX limit and forecast flow, not outturn; null when NESO has no value.
export interface ReplayPeriod { sp: number; start_utc: string; farms: Record<string, FarmPeriod>; scotex_limit_mw?: number | null; scotex_flow_mw?: number | null }
export interface Replay { meta: Meta; date: string; periods: ReplayPeriod[] }
export interface CurtailmentDay { date: string; curtailed_mwh: number | null; wind_paid_gbp: number | null; neso_thermal_mwh: number | null; neso_thermal_gbp: number | null }
export interface CurtailmentDaily { meta: Meta; days: CurtailmentDay[]; validation: { window: [string, string]; volume_ratio: number; volume_corr_daily: number } }
export interface Iceberg { meta: Meta; window: [string, string]; days: number; wind_bids_gbp: number; ccgt_offers_gbp: number; neso_thermal_gbp: number; ccgt_vs_neso_corr_daily: number; note: string }
export interface DfsRequest {
  event_id: string; start_utc: string; end_utc: string; direction: string; tag: string; required_mw: number;
  zone_caps_mw: Record<string, number>; procured_mw: number | null; accepted_price_median_gbp_per_mwh: number | null; auction_close_utc: string | null;
}
export interface DfsRequests { meta: Meta; requests: DfsRequest[] }
export interface Farms { meta: Meta; farms: Farm[] }
// Optional fields from the model lane (#48). When they are present, `gbp` is net: settlement + site value - electricity.
export interface PolicyResult {
  gbp: number; mwh: number;
  gross_settlement_gbp?: number; energy_cost_gbp?: number; value_gbp?: number; accepted_periods?: number; bid_periods?: number;
}
export type PolicyNet = { naive: number; ours: number; oracle?: number };
export interface CopilotSensitivityPoint { value_gbp_per_mwh: number; net_gbp: PolicyNet; pct_of_oracle?: number }
export interface CopilotSlot { start_utc: string; action: string; bid_gbp_per_mwh: number | null }
export interface CopilotDay { date: string; policies: { naive: PolicyResult; ours: PolicyResult; oracle: PolicyResult }; schedule: CopilotSlot[] }
export interface Copilot {
  meta: Meta & { scored_days?: number; warmup_days?: number };
  load: { type: string; capacity_mw: number; zone: string; value_gbp_per_mwh?: number; max_periods_per_day?: number };
  days: CopilotDay[];
  summary: {
    pct_of_oracle: number; gross_settlement_gbp: number; caveat: string;
    energy_cost_gbp?: number; net_gbp?: PolicyNet; break_even_value_gbp_per_mwh?: Partial<PolicyNet>;
    ours_beats_naive_at_values_gbp_per_mwh?: number[];
  };
  sensitivity?: CopilotSensitivityPoint[];
}

type State<T> = { data: T | null; error: string | null };

export function useJson<T>(path: string): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    fetch(`./data/${path}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path}: HTTP ${r.status}`))))
      .then((data: T) => live && setState({ data, error: null }))
      .catch((e: Error) => live && setState({ data: null, error: e.message }));
    return () => { live = false; };
  }, [path]);
  return state;
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
export const fmtGbp = (v: number | null | undefined) => (v == null ? "—" : gbp.format(v));
export const fmtNum = (v: number | null | undefined) => (v == null ? "—" : num.format(v));
export const fmtEnergy = (mwh: number | null | undefined) => {
  if (mwh == null) return "—";
  if (mwh >= 1e6) return `${(mwh / 1e6).toFixed(2)} TWh`;
  if (mwh >= 1e3) return `${(mwh / 1e3).toFixed(1)} GWh`;
  return `${num.format(mwh)} MWh`;
};
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
export interface ForecastPeriod {
  start_utc: string; curtailed_mwh_p10: number | null; curtailed_mwh_p50: number | null; curtailed_mwh_p90: number | null;
  p_heavy: number | null; p_turnup_request?: number | null;
}
export interface ReliabilityBin { bin: number; predicted: number; observed: number; n: number }
export interface Forecast {
  meta: Meta; issued_utc: string; mode?: "next_day" | "same_day_replay"; periods: ForecastPeriod[];
  backtest: {
    test_window: [string, string]; n_periods: number;
    mae_mwh: { model: number; persistence: number; training_mean: number; headroom_rule?: number };
    brier_heavy: { model: number; persistence: number; prior: number; headroom_rule?: number };
    auc_heavy: { model: number; persistence: number; headroom_rule?: number };
    reliability: ReliabilityBin[];
  };
}
// Optional grid.json (lane A). Line geometry only: flow per line is not published. `path` is [lat, lon] pairs.
export interface GridLine { id: string; kv?: number; path: [number, number][] }
export interface GridFile { meta: Meta; lines: GridLine[] }
// Optional dashboard.json (lane B, #74/#81). Summaries for the map dashboard; the app must work without it.
export interface DashboardCopilotCall {
  status: "scored" | "not_scored"; reason?: string; note?: string;
  ready_windows_utc?: [string, string][]; ready_half_hours?: number;
  bid_gbp_per_mwh?: number | null; bid_range_gbp_per_mwh?: [number, number] | null;
  net_gbp?: { naive: number; ours: number; oracle: number }; pct_of_oracle?: number | null; caveat?: string;
}
export interface DashboardSummary {
  meta: Meta;
  tomorrow?: {
    target_date: string; mode: "next_day" | "same_day_replay"; headline: string;
    facts: { peak_p_request: number | null; total_p50_mwh: number | null; request_window_utc?: [string, string] | null };
    request_probability: { start_utc: string; p_turnup_request: number | null }[]; caveat?: string;
  };
  replay_days?: { date: string; request_probability?: { start_utc: string; p_turnup_request: number | null; actual_request?: boolean }[]; copilot?: DashboardCopilotCall }[];
}
