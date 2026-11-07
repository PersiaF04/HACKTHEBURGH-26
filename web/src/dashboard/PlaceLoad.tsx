import { fmtEnergy, fmtGbp } from "../data";
import { ZONES, type LoadResult, type Zone } from "../sandbox";

export interface LoadSettings { mw: number; bid: number; zone: Zone; value: number }
export const VALUE_STEPS = [0, 50, 100, 150, 200];

const signed = (v: number | null) => (v == null ? "—" : v < -0.5 ? `−${fmtGbp(-v)}` : fmtGbp(v));

function Seg<T extends string | number>({ label, items, value, onPick }: { label: string; items: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="pl-seg" role="radiogroup" aria-label={label}>
      {items.map((t) => (
        <button key={String(t.id)} type="button" role="radio" aria-checked={value === t.id} className={value === t.id ? "on" : ""} onClick={() => onPick(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// The one thing to do on the page. The bid is the only control; everything else lives under "What if".
export function TryCard({ settings, onBid, result, title, onExplain, ceiling, message }: {
  settings: LoadSettings; onBid: (bid: number) => void; result: LoadResult | null; title: string; onExplain: () => void;
  ceiling: number | null; message?: string;
}) {
  const nothingTradable = result != null && !result.oracle_gbp;
  const tooHigh = result != null && result.mwh === 0 && !nothingTradable;
  return (
    <>
      <p className="try-eyebrow">Can you do better?</p>
      <h2 className="try-title">{title}</h2>
      <label className="try-bid">
        <span className="try-bid-row"><span>Your bid</span><b>£{settings.bid}/MWh</b></span>
        <input type="range" min={0} max={150} step={1} value={settings.bid} onChange={(e) => onBid(Number(e.target.value))} />
        <span className="try-hint">The price you ask NESO.{ceiling != null && ` Highest it accepted this day: £${Math.round(ceiling)}.`}</span>
      </label>
      {message || result == null || nothingTradable || tooHigh ? (
        <p className="try-result" aria-live="polite">{message ?? (tooHigh ? `At £${settings.bid}, NESO accepts nothing. Try lower.` : "No bid would have been accepted on this day.")}</p>
      ) : (
        <dl className="try-scores" aria-live="polite">
          <div className="you"><dt>You</dt><dd>{signed(result.net_gbp)}</dd></div>
          {result.ours_gbp != null
            ? <div title="Our model's plan for this day, scored the same way"><dt>Copilot</dt><dd>{signed(result.ours_gbp)}</dd></div>
            : <div title="A baseline to compare against: one fixed price"><dt>Simple rule</dt><dd>{signed(result.naive_gbp)}</dd></div>}
          <div title="With perfect hindsight, the most this load could have netted"><dt>Best possible</dt><dd>{signed(result.oracle_gbp)}</dd></div>
        </dl>
      )}
      <p className="try-note">
        Retrospective estimate, net, with energy valued at £{settings.value}/MWh. Not a revenue promise.{" "}
        <button type="button" className="try-link" onClick={onExplain}>How it's scored</button>
      </p>
    </>
  );
}

// Everything the card leaves out, for anyone who asks.
export function LoadOptions({ settings, onChange, result, pot, onNow }: {
  settings: LoadSettings; onChange: (s: LoadSettings) => void; result: LoadResult | null; pot: { halfHours: number; days: number } | null; onNow: boolean;
}) {
  const set = (p: Partial<LoadSettings>) => onChange({ ...settings, ...p });
  const rows = result ? [
    { k: "you", label: "Your bid", v: result.net_gbp },
    { k: "naive", label: "Simple rule (a baseline)", v: result.naive_gbp },
    { k: "ours", label: "Copilot (our model's plan)", v: result.ours_gbp },
    { k: "oracle", label: "Best possible (perfect hindsight)", v: result.oracle_gbp },
  ].filter((r) => r.k === "you" || r.v != null) : [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v ?? 0)));
  return (
    <section className="pl" aria-label="Change the load">
      <h3 className="pl-title"><i className={`pl-status${onNow ? " on" : ""}`} aria-hidden="true" />{onNow ? "Your load: on this half-hour" : "Your load: off this half-hour"}</h3>
      <label className="pl-field">
        <span>Size <b>{settings.mw} MW</b></span>
        <input type="range" min={1} max={100} step={1} value={settings.mw} onChange={(e) => set({ mw: Number(e.target.value) })} />
      </label>
      <div>
        <p className="pl-label">NESO zone</p>
        <Seg label="NESO zone" items={ZONES.map((z) => ({ id: z, label: z }))} value={settings.zone} onPick={(zone) => set({ zone })} />
        <p className="pl-note">NESO's request areas. Which regions they cover is unconfirmed, so we don't call them Scotland.</p>
      </div>
      <div>
        <p className="pl-label">Energy worth to you, £/MWh</p>
        <Seg label="What the energy is worth to your site, pounds per MWh" items={VALUE_STEPS.map((v) => ({ id: v, label: `${v}` }))} value={settings.value} onPick={(value) => set({ value })} />
        <p className="pl-note">An assumption you choose, not a measurement.</p>
      </div>
      {result && (
        <>
          <dl className="pl-stats">
            <div><dt>Load uses</dt><dd>{fmtEnergy(result.mwh)}</dd></div>
            <div><dt>Approx. wind matched (upper bound)</dt><dd>{fmtEnergy(result.wind_matched_mwh)}</dd></div>
          </dl>
          <ul className="pl-compare" aria-label="Net pounds on this day, same load">
            {rows.map((r) => (
              <li key={r.k} className={`pl-row pl-${r.k}`}>
                <span>{r.label}</span>
                <b>{signed(r.v)}</b>
                <i aria-hidden="true"><span style={{ width: `${r.v == null ? 0 : Math.max(1.5, (Math.abs(r.v) / max) * 100)}%` }} /></i>
              </li>
            ))}
          </ul>
          {result.source === "sandbox" && result.ours_gbp == null && <p className="pl-note">No Copilot call on this day, so only the simple rule and best possible compare.</p>}
          {pot && <p className="pl-note">The pot is small: {pot.halfHours} tradable half-hours in {settings.zone} across {pot.days} scored days, so most days score £0.</p>}
          <p className="pl-note">{result.note} Drag the pin, click the map or use the arrow keys to move it: it is an illustrative location and does not affect the score.</p>
        </>
      )}
    </section>
  );
}
