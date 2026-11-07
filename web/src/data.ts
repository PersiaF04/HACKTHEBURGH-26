import { useEffect, useState } from "react";

// Types mirror contracts/README.md (data contract v1).
export interface Meta { source: string[]; generated_utc: string; retrospective: boolean; fixture?: boolean }
export interface Farm { id: string; name: string; region: string; lat: number | null; lon: number | null; capacity_mw: number | null }
export type FarmState = "generating" | "instructed" | "unavailable" | "unknown";
export interface FarmPeriod { pn_mw: number | null; level_mw: number | null; curtailed_mwh: number | null; paid_gbp: number | null; state: FarmState }
export interface ReplayPeriod { sp: number; start_utc: string; farms: Record<string, FarmPeriod> }
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
  meta: Meta; issued_utc: string; periods: ForecastPeriod[];
  backtest: {
    test_window: [string, string]; n_periods: number;
    mae_mwh: { model: number; persistence: number; training_mean: number };
    brier_heavy: { model: number; persistence: number; prior: number };
    auc_heavy: { model: number; persistence: number };
    reliability: ReliabilityBin[];
  };
}
