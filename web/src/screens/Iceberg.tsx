import { Loading, Screen, Source } from "../components";
import { fmtGbp, useJson, type Iceberg as IcebergData } from "../data";

export function Iceberg() {
  const { data, error } = useJson<IcebergData>("iceberg.json");
  if (!data) return <Screen eyebrow="2 · The hidden bill" title="The bill you can't see" lede=""><Loading error={error} /></Screen>;
  const max = Math.max(data.neso_thermal_gbp, data.ccgt_offers_gbp, data.wind_bids_gbp);
  const ratio = data.ccgt_offers_gbp / data.wind_bids_gbp;
  const h = (v: number) => `${Math.max(4, (v / max) * 100)}%`;

  return (
    <Screen eyebrow="2 · The hidden bill" title="The bill you can't see"
      lede={`Headlines count what wind farms are paid to stop. The far bigger cost sits below the waterline: paying gas plants in England to turn up instead.`}>
      <div className="iceberg card">
        <div className="above">
          <div className="bar bar-wind" style={{ height: h(data.wind_bids_gbp) }} />
          <div className="berg-figure">{fmtGbp(data.wind_bids_gbp)}<span>paid to wind farms to switch off</span></div>
        </div>
        <div className="waterline" aria-hidden />
        <div className="below">
          <div className="col">
            <div className="bar bar-gas" style={{ height: h(data.ccgt_offers_gbp) }} />
            <div className="berg-figure">{fmtGbp(data.ccgt_offers_gbp)}<span>paid to gas plants to turn up</span></div>
          </div>
          <div className="col">
            <div className="bar bar-neso" style={{ height: h(data.neso_thermal_gbp) }} />
            <div className="berg-figure">{fmtGbp(data.neso_thermal_gbp)}<span>NESO's published constraint cost</span></div>
          </div>
        </div>
      </div>
      <div className="callout">
        <strong>{ratio.toFixed(1)}×</strong> more is paid to gas turn-up than to wind turn-down over {data.days} days ({data.window[0]} to {data.window[1]}).
        Gas turn-up payments track NESO's total closely (daily correlation {data.ccgt_vs_neso_corr_daily.toFixed(2)}).
        <span className="muted"> {data.note}: these figures overlap and don't sum.</span>
      </div>
      <Source meta={data.meta} />
    </Screen>
  );
}
