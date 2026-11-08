import { useEffect, useState } from "react";
import { api } from "../api";
import type { MetaResponse } from "../api";

/** Optional fields a real export adds to meta.json (see export_all.production_trained_on). */
type ProductionForecast = {
  label?: string;
  model?: { model?: string; held_out_tested?: boolean; fit_origins?: number[]; calibration_origins?: number[] };
};
type MetaWithForecast = MetaResponse & { production_forecast?: ProductionForecast };

/** Says which model produced the gap scores. Renders nothing when the export does not carry the fields (placeholder data). */
export function ModelNote() {
  const [forecast, setForecast] = useState<ProductionForecast | null>(null);
  useEffect(() => {
    let live = true;
    api.meta().then((meta) => { if (live) setForecast((meta as MetaWithForecast).production_forecast ?? null); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const model = forecast?.model;
  if (!model || typeof model.held_out_tested !== "boolean") return null;
  const frozen = model.held_out_tested;
  const years = (list?: number[]) => (list?.length ? list.join(", ") : "none");
  return (
    <aside className="ws-notice model-note" aria-label="Which model produced the gap scores" style={{ fontSize: ".85rem", lineHeight: 1.5 }}>
      <strong>{frozen ? "Gap scores come from the frozen backtest model." : "Gap scores come from a model trained through 2020."}</strong>{" "}
      {frozen
        ? "It was fit and calibrated without any test year, so the held-out result on the Evidence page describes it."
        : `It was fit on origins ${years(model.fit_origins)} and calibrated on ${years(model.calibration_origins)}, which includes the 2020 test origin, so the 2020 outcomes were used in training. The held-out headline describes the backtest model, not this one. These production scores have no held-out test of their own, and their probabilities are not shown to be better calibrated.`}
    </aside>
  );
}
