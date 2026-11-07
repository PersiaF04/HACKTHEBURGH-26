import { Loading, Screen, Source, Stat } from "../components";
import { fmtGbp, fmtNum, useJson, type DfsRequests } from "../data";

export function HelpWanted() {
  const { data, error } = useJson<DfsRequests>("dfs_requests.json");
  if (!data) return <Screen eyebrow="3 · The unanswered call" title="Help wanted" lede=""><Loading error={error} /></Screen>;

  const reqs = data.requests.filter((r) => r.direction === "Upwards" && r.tag === "System");
  const required = reqs.reduce((s, r) => s + r.required_mw, 0);
  const procured = reqs.reduce((s, r) => s + (r.procured_mw ?? 0), 0);
  const fill = required ? procured / required : 0;
  const events = new Set(reqs.map((r) => r.event_id)).size;
  const prices = reqs.map((r) => r.accepted_price_median_gbp_per_mwh).filter((p): p is number => p != null).sort((a, b) => a - b);
  const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const leads = reqs.filter((r) => r.auction_close_utc).map((r) => (Date.parse(r.start_utc) - Date.parse(r.auction_close_utc!)) / 36e5).sort((a, b) => a - b);
  const medianLead = leads.length ? leads[Math.floor(leads.length / 2)] : null;
  const zones = [...new Set(reqs.flatMap((r) => Object.entries(r.zone_caps_mw).filter(([, v]) => v > 0).map(([z]) => z)))].sort();
  const recent = [...reqs].sort((a, b) => b.start_utc.localeCompare(a.start_utc)).slice(0, 8);

  return (
    <Screen eyebrow="3 · The unanswered call" title="NESO is asking. Almost nobody answers."
      lede="NESO now asks for flexible demand to switch on and soak up the wind it would otherwise pay to waste. Here is how much it asked for, and how much arrived.">
      <div className="fill card" aria-label={`Fill rate ${(fill * 100).toFixed(1)} percent`}>
        <div className="fill-track"><div className="fill-bar" style={{ width: `${Math.max(fill * 100, 0.6)}%` }} /></div>
        <div className="fill-label"><strong>{(fill * 100).toFixed(1)}%</strong> of requested turn-up was delivered</div>
      </div>
      <div className="stats">
        <Stat label="turn-up requests" value={fmtNum(events)} hint={`${reqs.length} half-hours`} />
        <Stat label="requested" value={`${fmtNum(required / 2)} MWh`} hint="MW × 0.5 h, summed" />
        <Stat label="median accepted price" value={medianPrice == null ? "—" : `${fmtGbp(medianPrice)}/MWh`} />
        <Stat label="auction close to delivery" value={medianLead == null ? "—" : `${medianLead.toFixed(1)} h`} hint="median" />
      </div>
      <table className="table card">
        <caption className="muted">Latest requests. Zones: {zones.join(", ")} (NESO zone IDs; the region mapping isn't confirmed yet)</caption>
        <thead><tr><th>Start (UTC)</th><th>Required</th><th>Delivered</th><th>Zones</th><th>Price</th></tr></thead>
        <tbody>
          {recent.map((r) => (
            <tr key={r.event_id + r.start_utc}>
              <td>{r.start_utc.slice(0, 16).replace("T", " ")}</td>
              <td>{fmtNum(r.required_mw)} MW</td>
              <td>{r.procured_mw == null ? "—" : `${r.procured_mw} MW`}</td>
              <td>{Object.entries(r.zone_caps_mw).filter(([, v]) => v > 0).map(([z]) => z).join(" ")}</td>
              <td>{r.accepted_price_median_gbp_per_mwh == null ? "—" : `${fmtGbp(r.accepted_price_median_gbp_per_mwh)}/MWh`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Source meta={data.meta} />
    </Screen>
  );
}
