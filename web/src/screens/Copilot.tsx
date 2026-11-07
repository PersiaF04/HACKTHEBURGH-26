import { useEffect, useState } from "react";
import { Loading, Screen, Source } from "../components";
import { fmtEnergy, fmtGbp, fmtTime, useJson, type Copilot as CopilotData, type CopilotSlot } from "../data";

const LOAD_TYPES = [
  { id: "electrolyser", label: "Electrolyser" },
  { id: "data_centre", label: "Data centre" },
  { id: "heat_network", label: "Heat network" },
] as const;
const ZONES = ["Z1", "Z2", "Z3"] as const;
const POLICIES = [
  { id: "naive", label: "Naive", hint: "Simple baseline policy" },
  { id: "ours", label: "Ours", hint: "The copilot's forecast-driven schedule" },
  { id: "oracle", label: "Oracle", hint: "Perfect hindsight, the upper bound" },
] as const;
const SLOTS = 48;
const slotTime = (date: string, i: number) => new Date(Date.parse(`${date}T00:00:00Z`) + i * 18e5).toISOString();

function Ring({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, value));
  return (
    <svg className="cp-ring" viewBox="0 0 128 128" role="img" aria-label={`${Math.round(pct * 100)} percent of oracle captured`}>
      <circle cx="64" cy="64" r={r} className="cp-ring-track" />
      <circle cx="64" cy="64" r={r} className="cp-ring-fill" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="70" textAnchor="middle" className="cp-ring-text">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

export function Copilot() {
  const { data, error } = useJson<CopilotData>("copilot.json");
  const [type, setType] = useState<string>("electrolyser");
  const [mw, setMw] = useState(50);
  const [zone, setZone] = useState<string>("Z1");
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!data) return;
    setType(data.load.type);
    setMw(Math.round(Math.min(100, Math.max(1, data.load.capacity_mw))));
    setZone(data.load.zone);
  }, [data]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setSlot((v) => (v + 1 < SLOTS ? v + 1 : (setPlaying(false), v))), 300);
    return () => clearInterval(t);
  }, [playing]);

  const head = { eyebrow: "5 · Flex Copilot", title: "Switch on when the wind would be wasted." };
  if (!data || !data.days.length) return <Screen {...head} lede=""><Loading error={error ?? (data ? "no replay days" : null)} /></Screen>;

  const day = data.days[Math.min(dayIndex, data.days.length - 1)];
  const scale = data.load.capacity_mw > 0 ? mw / data.load.capacity_mw : 1;
  const scaled = mw !== data.load.capacity_mw;
  const bySlot = new Map<number, CopilotSlot>();
  for (const s of day.schedule) {
    const i = Math.round((Date.parse(s.start_utc) - Date.parse(`${day.date}T00:00:00Z`)) / 18e5);
    if (s.action === "ready" && i >= 0 && i < SLOTS) bySlot.set(i, s);
  }
  const current = bySlot.get(slot);
  const readyCount = bySlot.size;
  const typeLabel = LOAD_TYPES.find((t) => t.id === type)?.label ?? type;

  return (
    <Screen {...head}
      lede="Pick a flexible load. The copilot reads tomorrow's forecast and says when to be ready to switch on and what to bid, then we replay real days to see how it would have done.">
      <form className="cp-picker card" onSubmit={(e) => e.preventDefault()} aria-label="Load picker">
        <fieldset className="cp-field">
          <legend>Load type</legend>
          <div className="cp-seg">
            {LOAD_TYPES.map((t) => (
              <label key={t.id} className={type === t.id ? "on" : ""}>
                <input type="radio" name="cp-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="cp-field cp-mw">
          <label htmlFor="cp-mw">Size <strong>{mw} MW</strong></label>
          <input id="cp-mw" type="range" min={1} max={100} step={1} value={mw} onChange={(e) => setMw(Number(e.target.value))}
            aria-valuetext={`${mw} megawatts`} />
        </div>
        <fieldset className="cp-field">
          <legend>Zone</legend>
          <div className="cp-seg">
            {ZONES.map((z) => (
              <label key={z} className={zone === z ? "on" : ""}>
                <input type="radio" name="cp-zone" value={z} checked={zone === z} onChange={() => setZone(z)} />
                {z}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="cp-note small muted">
          Scaled estimate. Full re-run per load comes from the model lane. Figures scale linearly from the modelled{" "}
          {data.load.capacity_mw} MW {data.load.type.replace("_", " ")} in zone {data.load.zone}
          {scaled ? ` (×${scale.toFixed(2)})` : ""}. Zones are NESO zone IDs; the region mapping isn't confirmed yet.
        </p>
      </form>

      <div className="cp-timeline card">
        <div className="cp-timeline-head">
          <div>
            <h2 className="cp-h2">Schedule for {day.date}</h2>
            <p className="small muted">{readyCount} half-hours marked ready · {typeLabel}, {mw} MW, zone {zone}</p>
          </div>
          {data.days.length > 1 && (
            <label className="small">Day{" "}
              <select value={dayIndex} onChange={(e) => { setDayIndex(Number(e.target.value)); setSlot(0); }}
                onKeyDown={(e) => e.stopPropagation()}>
                {data.days.map((d, i) => <option key={d.date} value={i}>{d.date}</option>)}
              </select>
            </label>
          )}
        </div>
        <ol className="cp-slots" aria-label="Half-hour schedule, UTC">
          {Array.from({ length: SLOTS }, (_, i) => {
            const s = bySlot.get(i);
            const t = fmtTime(slotTime(day.date, i));
            return (
              <li key={i} className={`cp-slot${s ? " ready" : ""}${i === slot ? " now" : ""}`}
                title={s ? `${t}: ready, bid £${s.bid_gbp_per_mwh ?? "—"}/MWh` : `${t}: idle`}>
                <span className="sr-only">{t}: {s ? `ready, bid £${s.bid_gbp_per_mwh ?? "—"} per MWh` : "idle"}</span>
                {s && <span className="cp-bid" aria-hidden="true">{s.bid_gbp_per_mwh ?? "—"}</span>}
              </li>
            );
          })}
        </ol>
        <div className="cp-axis small muted" aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00 UTC</span></div>
        <p className="cp-legend small muted">
          <span><i className="cp-key ready" />Ready (striped), number is bid in £/MWh</span>
          <span><i className="cp-key" />Idle</span>
        </p>

        <div className="cp-replay">
          <button className="btn" type="button" aria-pressed={playing}
            onClick={() => { if (slot >= SLOTS - 1) setSlot(0); setPlaying((p) => !p); }}>
            {playing ? "Pause" : "Replay"}
          </button>
          <input type="range" min={0} max={SLOTS - 1} value={slot} aria-label="Replay half-hour"
            aria-valuetext={fmtTime(slotTime(day.date, slot))}
            onChange={(e) => { setPlaying(false); setSlot(Number(e.target.value)); }} />
          <div className={`cp-load${current ? " on" : ""}`} role="status" aria-live="polite">
            <span className="cp-load-dot" aria-hidden="true" />
            <span>
              <strong>{fmtTime(slotTime(day.date, slot))}</strong>{" "}
              {current ? `Ready: load switches on, bid £${current.bid_gbp_per_mwh ?? "—"}/MWh` : "Idle: load off"}
            </span>
          </div>
        </div>
      </div>

      <div className="cp-results">
        <div className="cp-policies">
          {POLICIES.map((p) => {
            const r = day.policies[p.id];
            return (
              <div key={p.id} className={`stat cp-policy${p.id === "ours" ? " ours" : ""}`}>
                <div className="stat-label cp-policy-name">{p.label}</div>
                <div className="stat-value">{fmtGbp(r.gbp * scale)}</div>
                <div className="stat-label">{fmtEnergy(r.mwh * scale)} absorbed</div>
                <div className="stat-hint">{p.hint}</div>
              </div>
            );
          })}
        </div>
        <div className="cp-gauge card">
          <Ring value={data.summary.pct_of_oracle} />
          <div>
            <div className="cp-gauge-title">of oracle captured</div>
            <p className="small muted">Our forecast-driven bids against perfect hindsight, across all replay days. Same days and costs for all three policies.</p>
          </div>
        </div>
      </div>

      <div className="cp-money card">
        <div>
          <div className="stat-label">Gross settlement, all replay days</div>
          <div className="cp-money-value">{fmtGbp(data.summary.gross_settlement_gbp * scale)}</div>
        </div>
        <div className="cp-caveat">
          <strong>{data.summary.caveat}.</strong> This is gross settlement before the cost of the
          energy used and levies. It is a retrospective estimate, not guaranteed revenue. Zone {zone} is a NESO zone ID.
        </div>
      </div>
      <Source meta={data.meta} />
    </Screen>
  );
}
