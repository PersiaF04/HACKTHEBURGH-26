import { useEffect, useState } from "react";
import { Loading, Screen, Source } from "../components";
import { fmtEnergy, fmtGbp, fmtTime, useJson, type Copilot as CopilotData, type CopilotSensitivityPoint, type CopilotSlot } from "../data";

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

// First site value where ours stops beating naive, linearly interpolated between sampled values.
function crossover(points: CopilotSensitivityPoint[]): { at: number; lastWin: number; firstLoss: number } | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const da = a.net_gbp.ours - a.net_gbp.naive, db = b.net_gbp.ours - b.net_gbp.naive;
    if (da > 0 && db <= 0) {
      const at = a.value_gbp_per_mwh + (da / (da - db)) * (b.value_gbp_per_mwh - a.value_gbp_per_mwh);
      return { at, lastWin: a.value_gbp_per_mwh, firstLoss: b.value_gbp_per_mwh };
    }
  }
  return null;
}

const SERIES = [
  { id: "oracle", label: "Oracle", cls: "cp-s-oracle" },
  { id: "naive", label: "Naive", cls: "cp-s-naive" },
  { id: "ours", label: "Ours", cls: "cp-s-ours" },
] as const;

function SensitivityChart({ points, scale, current }: { points: CopilotSensitivityPoint[]; scale: number; current?: number }) {
  const pts = [...points].sort((a, b) => a.value_gbp_per_mwh - b.value_gbp_per_mwh);
  const series = SERIES.filter((s) => pts.every((p) => typeof p.net_gbp[s.id] === "number"));
  const W = 640, H = 260, L = 64, R = 64, T = 16, B = 40;
  const xs = pts.map((p) => p.value_gbp_per_mwh);
  const ys = pts.flatMap((p) => series.map((s) => (p.net_gbp[s.id] as number) * scale)).concat(0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const x = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const cross = crossover(pts);
  const yTicks = [y0, (y0 + y1) / 2, y1, 0].filter((v, i, a) => a.indexOf(v) === i);
  const beats = pts.filter((p) => p.net_gbp.ours > p.net_gbp.naive).map((p) => `£${p.value_gbp_per_mwh}`);
  const loses = pts.filter((p) => p.net_gbp.ours <= p.net_gbp.naive).map((p) => `£${p.value_gbp_per_mwh}`);
  const summary = cross
    ? `Ours beats naive when the site values the energy at up to £${cross.lastWin}/MWh and loses from £${cross.firstLoss}/MWh; the lines cross near £${Math.round(cross.at)}/MWh.`
    : loses.length === 0
      ? `Ours beats naive at every site value tested (${beats.join(", ")} per MWh).`
      : beats.length === 0
        ? `Ours does not beat naive at any site value tested (${loses.join(", ")} per MWh).`
        : `Ours beats naive at ${beats.join(", ")} per MWh and does not at ${loses.join(", ")} per MWh.`;

  return (
    <div className="cp-sens card">
      <h2 className="cp-h2">Does it still pay?</h2>
      <p className="small muted cp-sens-lede">
        Net £ across all replay days for different values of the extra energy to the site. Net means DFS settlement plus that
        value, minus the electricity bought.
      </p>
      <svg className="cp-sens-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Line chart of net pounds against site energy value, ${series.map((s) => s.label).join(", ")}. ${summary}`}>
        {cross && (
          <g className="cp-sens-cross">
            <rect x={x(cross.at)} y={T} width={Math.max(0, x(x1) - x(cross.at))} height={H - T - B} />
            <line x1={x(cross.at)} x2={x(cross.at)} y1={T} y2={H - B} />
            <text x={x(cross.at) + 6} y={T + 14}>Naive wins from here</text>
          </g>
        )}
        {yTicks.map((v) => (
          <g key={v} className={`cp-sens-grid${v === 0 ? " zero" : ""}`}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{fmtGbp(v)}</text>
          </g>
        ))}
        {pts.map((p) => (
          <text key={p.value_gbp_per_mwh} className="cp-sens-tick" x={x(p.value_gbp_per_mwh)} y={H - B + 18} textAnchor="middle">
            £{p.value_gbp_per_mwh}
          </text>
        ))}
        <text className="cp-sens-tick" x={(L + W - R) / 2} y={H - 4} textAnchor="middle">Site value of extra energy, £/MWh</text>
        {current != null && current >= x0 && current <= x1 && (
          <line className="cp-sens-current" x1={x(current)} x2={x(current)} y1={T} y2={H - B} />
        )}
        {series.map((s) => {
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.value_gbp_per_mwh).toFixed(1)},${y((p.net_gbp[s.id] as number) * scale).toFixed(1)}`).join("");
          const last = pts[pts.length - 1];
          return (
            <g key={s.id} className={`cp-sens-line ${s.cls}`}>
              <path d={d} />
              {pts.map((p) => <circle key={p.value_gbp_per_mwh} cx={x(p.value_gbp_per_mwh)} cy={y((p.net_gbp[s.id] as number) * scale)} r={3.5} />)}
              <text x={x(last.value_gbp_per_mwh) + 8} y={y((last.net_gbp[s.id] as number) * scale) + 4}>{s.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="cp-sens-summary"><strong>{summary}</strong>{" "}
        {current != null && <>The cards above use £{current}/MWh, an illustrative assumption, not a measurement. </>}
      </p>
    </div>
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
  // #48 defines policies.*.gbp as net once energy cost is reported; older files carry gross-only figures.
  const isNet = data.summary.net_gbp != null || data.days.some((d) => d.policies.ours.energy_cost_gbp != null);
  const sensitivity = (data.sensitivity ?? []).filter((p) => p && typeof p.value_gbp_per_mwh === "number" && p.net_gbp
    && typeof p.net_gbp.ours === "number" && typeof p.net_gbp.naive === "number");
  const siteValue = data.load.value_gbp_per_mwh;
  const gross = data.summary.gross_settlement_gbp;
  const energyCost = data.summary.energy_cost_gbp;
  const settlementShort = energyCost != null && energyCost > gross;
  const rawCaveat = data.summary.caveat.trim();
  const caveat = /[.!?]$/.test(rawCaveat) ? rawCaveat : `${rawCaveat}.`;

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
                {isNet && <div className="stat-label cp-net-label">net of electricity</div>}
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
            <p className="small muted">
              Our forecast-driven bids against perfect hindsight, across all replay days{isNet ? ", net of electricity" : ""}.
              Same days and costs for all three policies.
              {siteValue != null && sensitivity.length > 1 && ` Holds at £${siteValue}/MWh site value only; see below.`}
            </p>
          </div>
        </div>
      </div>

      {sensitivity.length > 1 && <SensitivityChart points={sensitivity} scale={scale} current={siteValue} />}

      <div className="cp-caveat cp-honest">
        {energyCost == null
          ? <><strong>DFS settlement alone doesn't pay for the electricity.</strong> In the half-hours NESO has requested
            turn-up, electricity has cost more than DFS has paid. </>
          : settlementShort
            ? <><strong>DFS settlement alone doesn't pay for the electricity.</strong> Across the replay, the electricity bought
              in request half-hours ({fmtGbp(energyCost * scale)}) cost more than DFS would have paid ({fmtGbp(gross * scale)}). </>
            : <><strong>Settlement covered the electricity in this replay, before levies.</strong> Electricity{" "}
              {fmtGbp(energyCost * scale)}, DFS settlement {fmtGbp(gross * scale)}. </>}
        A turn-up payment only adds up if the site values the extra energy. This is a retrospective estimate, not revenue.
        Zone {zone} is a NESO zone ID.
      </div>
      <p className="cp-footnote small muted">
        Gross DFS settlement before electricity cost and levies; not income: {fmtGbp(gross * scale)} across the replay days.{" "}
        {caveat}
      </p>
      <Source meta={data.meta} />
    </Screen>
  );
}
