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

export function PlaceLoad({ settings, onChange, result, onNow, pot, dayLabel, onRemove }: {
  settings: LoadSettings; onChange: (s: LoadSettings) => void; result: LoadResult | null; onNow: boolean;
  pot: { halfHours: number; days: number } | null; dayLabel: string; onRemove: () => void;
}) {
  const set = (p: Partial<LoadSettings>) => onChange({ ...settings, ...p });
  const rows = result ? [
    { k: "you", label: "Your bid", v: result.net_gbp },
    { k: "naive", label: "Naive rule", v: result.naive_gbp },
    { k: "ours", label: "Copilot", v: result.ours_gbp },
    { k: "oracle", label: "Oracle (hindsight)", v: result.oracle_gbp },
  ].filter((r) => r.k === "you" || r.v != null) : [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v ?? 0)));
  const pct = result && result.net_gbp != null && result.oracle_gbp ? result.net_gbp / result.oracle_gbp : null;
  const noCopilot = result?.source === "sandbox" && result.ours_gbp == null;

  return (
    <section className="pl" aria-label="Place your load">
      <header className="pl-head">
        <div>
          <p className="pl-eyebrow">Place your load · {dayLabel}</p>
          <h2 className="pl-title" aria-live="polite">
            <i className={`pl-status${onNow ? " on" : ""}`} aria-hidden="true" />
            {onNow ? "Switched on now" : "Off this half-hour"}
          </h2>
        </div>
        <button type="button" className="pl-close" onClick={onRemove} aria-label="Remove your load">×</button>
      </header>

      <Seg label="Load type" items={LOAD_TYPES} value={settings.type} onPick={(type) => set({ type })} />
      <div className="pl-pair">
        <div>
          <p className="pl-label">DFS zone</p>
          <Seg label="DFS zone" items={ZONES.map((z) => ({ id: z, label: z }))} value={settings.zone} onPick={(zone) => set({ zone })} />
        </div>
        <div>
          <p className="pl-label">Site value, £/MWh</p>
          <Seg label="Site value of the energy, pounds per MWh" items={VALUE_STEPS.map((v) => ({ id: v, label: `${v}` }))} value={settings.value} onPick={(value) => set({ value })} />
        </div>
      </div>
      <label className="pl-field">
        <span>Size <b>{settings.mw} MW</b></span>
        <input type="range" min={1} max={100} step={1} value={settings.mw} onChange={(e) => set({ mw: Number(e.target.value) })} />
      </label>
      <label className="pl-field">
        <span>Bid in every turn-up half-hour <b>£{settings.bid}/MWh</b></span>
        <input type="range" min={0} max={150} step={1} value={settings.bid} onChange={(e) => set({ bid: Number(e.target.value) })} />
      </label>

      {result ? (
        <>
          <dl className="pl-stats">
            <div><dt>Load uses</dt><dd>{fmtEnergy(result.mwh)}</dd></div>
            <div><dt>Approx. wind matched (upper bound)</dt><dd>{fmtEnergy(result.wind_matched_mwh)}</dd></div>
            <div><dt>Net, this day</dt><dd>{result.net_gbp == null ? "—" : signed(result.net_gbp)}</dd></div>
            <div><dt>Of oracle</dt><dd>{pct == null ? "—" : `${Math.round(pct * 100)}%`}</dd></div>
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
          {noCopilot && <p className="pl-note">No Copilot call on this day (it was still learning), so only naive and oracle are compared.</p>}
          <p className="pl-note">
            {pot && <>The pot is small: {pot.halfHours} tradable half-hours in {settings.zone} across {pot.days} scored days, so most days score £0. </>}
            {result.note} The pin is an illustrative location and does not affect the score: zone IDs are NESO's and not confirmed as Scotland. Retrospective; not a revenue promise.
          </p>
        </>
      ) : (
        <p className="pl-note">NESO made no turn-up request on this day, so a flexible load had nothing to answer. Pick another day.</p>
      )}
    </section>
  );
}
