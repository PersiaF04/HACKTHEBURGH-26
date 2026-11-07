import { fmtEnergy, fmtGbp } from "../data";
import { LOAD_TYPES, ZONES, type LoadResult, type LoadType, type Zone } from "../sandbox";

export interface LoadSettings { type: LoadType; mw: number; bid: number; zone: Zone; value: number }
export const VALUE_STEPS = [0, 50, 100, 150, 200];

const signed = (v: number) => (v < -0.5 ? `−${fmtGbp(-v)}` : fmtGbp(v));

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

export function PlaceLoad({ settings, onChange, result, onNow, pot, dayLabel }: {
  settings: LoadSettings; onChange: (s: LoadSettings) => void; result: LoadResult | null; onNow: boolean;
  pot: { halfHours: number; days: number } | null; dayLabel: string;
}) {
  const set = (p: Partial<LoadSettings>) => onChange({ ...settings, ...p });
  const rows = result ? [
    { k: "you", label: "Your bid", v: result.net_gbp },
    { k: "naive", label: "Simple rule", v: result.naive_gbp },
    { k: "ours", label: "Copilot", v: result.ours_gbp },
    { k: "oracle", label: "Perfect hindsight", v: result.oracle_gbp },
  ].filter((r) => r.k === "you" || r.v != null) : [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v ?? 0)));
  const noCopilot = result?.source === "sandbox" && result.ours_gbp == null;

  return (
    <section className="pl" aria-label="Place your load">
      <header>
        <p className="pl-eyebrow">Place your load · {dayLabel}</p>
        <h2 className="pl-title" aria-live="polite">
          <i className={`pl-status${onNow ? " on" : ""}`} aria-hidden="true" />
          {onNow ? "Switched on now" : "Off this half-hour"}
        </h2>
      </header>

      <Seg label="Load type" items={LOAD_TYPES} value={settings.type} onPick={(type) => set({ type })} />
      <div className="pl-pair">
        <div title="NESO's request zones. The zone-to-region mapping is unconfirmed, so these are not called Scotland.">
          <p className="pl-label">NESO zone</p>
          <Seg label="NESO zone" items={ZONES.map((z) => ({ id: z, label: z }))} value={settings.zone} onPick={(zone) => set({ zone })} />
        </div>
        <div title="What the extra energy is worth to your site. An assumption you choose, not a measurement.">
          <p className="pl-label">Energy worth to you, £/MWh</p>
          <Seg label="What the energy is worth to your site, pounds per MWh" items={VALUE_STEPS.map((v) => ({ id: v, label: `${v}` }))} value={settings.value} onPick={(value) => set({ value })} />
        </div>
      </div>
      <label className="pl-field">
        <span>Size <b>{settings.mw} MW</b></span>
        <input type="range" min={1} max={100} step={1} value={settings.mw} onChange={(e) => set({ mw: Number(e.target.value) })} />
      </label>
      <label className="pl-field">
        <span>Your bid when NESO asks <b>£{settings.bid}/MWh</b></span>
        <input type="range" min={0} max={150} step={1} value={settings.bid} onChange={(e) => set({ bid: Number(e.target.value) })} />
      </label>

      {result ? (
        <>
          <dl className="pl-stats">
            <div><dt>Load uses</dt><dd>{fmtEnergy(result.mwh)}</dd></div>
            <div><dt>Approx. wind matched (upper bound)</dt><dd>{fmtEnergy(result.wind_matched_mwh)}</dd></div>
          </dl>
          <ul className="pl-compare" aria-label="Net pounds on this day, same load">
            {rows.map((r) => (
              <li key={r.k} className={`pl-row pl-${r.k}`}>
                <span>{r.label}</span>
                <b>{r.v == null ? "—" : signed(r.v)}</b>
                <i aria-hidden="true"><span style={{ width: `${r.v == null ? 0 : Math.max(1.5, (Math.abs(r.v) / max) * 100)}%` }} /></i>
              </li>
            ))}
          </ul>
          <p className="pl-note">
            Net £ this day. {noCopilot && "No Copilot call on this day, so only the simple rule and perfect hindsight compare. "}
            {pot && <>The pot is small: {pot.halfHours} tradable half-hours in {settings.zone} across {pot.days} scored days, so most days score £0. </>}
            Retrospective; not a revenue promise.
          </p>
          <details className="pl-more">
            <summary>How this is scored</summary>
            <p className="pl-note">{result.note} Click the map to move the pin: it is an illustrative location and does not affect the score, because zone IDs are NESO's and not confirmed as Scotland.</p>
          </details>
        </>
      ) : (
        <p className="pl-note">NESO made no call for extra demand on this day, so a flexible load had nothing to answer. Pick another day.</p>
      )}
    </section>
  );
}
