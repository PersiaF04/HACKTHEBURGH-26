import { useEffect, useMemo, useState } from "react";
import { Loading, Screen, Source } from "../components";
import { fmtNum, useJson } from "../data";
import type { Farms, FarmState, Meta, Replay, ReplayPeriod } from "../data";

// Local types for the parts of forecast.json and copilot.json this screen reads (contracts/README.md).
interface Forecast { meta: Meta; periods: { start_utc: string; curtailed_mwh_p50: number | null }[] }
interface Copilot {
  meta: Meta; load: { capacity_mw: number };
  days: { date: string; schedule: { start_utc: string; action: string }[] }[];
}

const DATE = "2026-10-14";
const LOAD_MW = 50;
const BLOCKS = 12;
const BUDGET = 6;
const CAP_MWH = LOAD_MW * 0.5; // what a 50 MW load can soak up in one half-hour
const STEP_MS = 140; // reveal animation: one half-hour per step

interface Block { index: number; label: string; periods: ReplayPeriod[]; soak: number; hint: Hint }
interface Hint { level: 0 | 1 | 2 | 3; text: string }

const HINTS = ["Calm", "Breezy", "Windy", "Stormy"] as const;
const localTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// Curtailed MWh a 50 MW load could have absorbed in one half-hour, across all farms.
const soakIn = (p: ReplayPeriod) => Math.min(CAP_MWH, sum(Object.values(p.farms).map((f) => f.curtailed_mwh ?? 0)));
const blockScore = (blocks: Block[], picked: Set<number>) => sum(blocks.filter((b) => picked.has(b.index)).map((b) => b.soak));

function buildBlocks(replay: Replay, forecast: Forecast | null, capacity: number): { blocks: Block[]; hintSource: string } {
  const p50 = new Map((forecast?.periods ?? []).map((p) => [p.start_utc, p.curtailed_mwh_p50]));
  const size = Math.ceil(replay.periods.length / BLOCKS);
  const chunks = Array.from({ length: BLOCKS }, (_, i) => replay.periods.slice(i * size, (i + 1) * size)).filter((c) => c.length);
  const useForecast = chunks.every((c) => c.every((p) => p50.get(p.start_utc) != null));

  const blocks = chunks.map((periods, index) => {
    let ratio: number;
    if (useForecast) {
      // Forecast curtailment per half-hour, scaled so ~1 GWh/half-hour reads as "Stormy".
      ratio = sum(periods.map((p) => p50.get(p.start_utc) ?? 0)) / periods.length / 1000;
    } else {
      // No forecast for this day: use planned output (PN) as a share of fleet capacity. It says how windy, not who got paid.
      ratio = capacity ? sum(periods.map((p) => sum(Object.values(p.farms).map((f) => f.pn_mw ?? 0)))) / periods.length / capacity : 0;
    }
    const level = (ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : ratio >= 0.25 ? 1 : 0) as Hint["level"];
    const end = new Date(Date.parse(periods[periods.length - 1].start_utc) + 30 * 60e3).toISOString();
    return {
      index, periods, soak: sum(periods.map(soakIn)),
      label: `${localTime(periods[0].start_utc)}–${localTime(end)}`,
      hint: { level, text: HINTS[level] },
    };
  });
  return { blocks, hintSource: useForecast ? "forecast p50 curtailment" : "planned wind output (no forecast for this day)" };
}

export function Operator() {
  const replay = useJson<Replay>(`replay/${DATE}.json`);
  const copilot = useJson<Copilot>("copilot.json");
  const farms = useJson<Farms>("farms.json");
  const forecast = useJson<Forecast>("forecast.json");

  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [step, setStep] = useState(0);

  const ready = replay.data && copilot.data && farms.data && (forecast.data || forecast.error);
  const mirror = useMemo(
    () => farms.data?.farms.reduce((a, b) => ((b.capacity_mw ?? 0) > (a.capacity_mw ?? 0) ? b : a)),
    [farms.data],
  );
  const game = useMemo(() => {
    if (!replay.data || !farms.data) return null;
    const capacity = sum(farms.data.farms.map((f) => f.capacity_mw ?? 0));
    return buildBlocks(replay.data, forecast.data, capacity);
  }, [replay.data, farms.data, forecast.data]);

  const periods = replay.data?.periods ?? [];
  const playing = revealed && step < periods.length;
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step]);

  if (!ready || !game || !replay.data || !copilot.data) {
    return <Screen eyebrow="5b · Your turn" title="You're the operator" lede="Loading the replay day…"><Loading error={replay.error ?? copilot.error ?? farms.error} /></Screen>;
  }

  const { blocks, hintSource } = game;
  const schedule = copilot.data.days.find((d) => d.date === DATE)?.schedule ?? [];
  const copilotPicks = new Set(blocks.filter((b) => b.periods.some((p) => schedule.some((s) => s.action === "ready" && s.start_utc === p.start_utc))).map((b) => b.index));
  const oraclePicks = new Set([...blocks].sort((a, b) => b.soak - a.soak || a.index - b.index).slice(0, BUDGET).map((b) => b.index));
  const scores = [
    { id: "you", name: "You", mwh: blockScore(blocks, picked) },
    { id: "copilot", name: "Copilot", mwh: blockScore(blocks, copilotPicks) },
    { id: "oracle", name: "Oracle", mwh: blockScore(blocks, oraclePicks) },
  ];
  const scale = Math.max(1, ...scores.map((s) => s.mwh));

  const toggle = (i: number) => {
    if (revealed) return;
    const next = new Set(picked);
    if (next.has(i)) next.delete(i); else if (next.size < BUDGET) next.add(i);
    setPicked(next);
  };
  const reveal = () => { setStep(0); setRevealed(true); };
  const reset = () => { setPicked(new Set()); setRevealed(false); setStep(0); };

  const current = periods[Math.min(step, periods.length - 1)];
  const currentBlock = revealed && playing ? Math.floor(step / Math.ceil(periods.length / BLOCKS)) : -1;
  const mirrorState: FarmState = (mirror && current?.farms[mirror.id]?.state) || "unknown";

  return (
    <Screen eyebrow="5b · Your turn" title="You're the operator"
      lede={`You run a ${LOAD_MW} MW flexible load in Scotland. Pick up to ${BUDGET} two-hour blocks to be ready to switch on and soak up wind that would otherwise be paid to switch off.`}>
      <div className="op-layout">
        <div className="card op-board">
          <div className="op-head">
            <h2 className="op-title">{new Date(`${DATE}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h2>
            <p className="op-budget" aria-live="polite"><strong>{picked.size}</strong> of {BUDGET} ready blocks used</p>
          </div>
          <ol className="op-grid" aria-label="Two-hour blocks, UK time">
            {blocks.map((b) => {
              const on = picked.has(b.index);
              const full = !on && picked.size >= BUDGET;
              return (
                <li key={b.index}>
                  <button type="button" className={`op-block${on ? " on" : ""}${b.index === currentBlock ? " now" : ""}`}
                    aria-pressed={on} disabled={revealed || full} onClick={() => toggle(b.index)}
                    aria-label={`${b.label}, hint ${b.hint.text}, ${on ? "ready" : "off"}${revealed ? `, soaked ${fmtNum(b.soak)} MWh` : ""}`}>
                    <span className="op-time">{b.label}</span>
                    <span className="op-hint" aria-hidden="true"><Gusts level={b.hint.level} /> {b.hint.text}</span>
                    <span className="op-state">{on ? "Ready" : "Off"}</span>
                    {revealed && (
                      <span className="op-result">
                        <strong>{fmtNum(b.soak)} MWh</strong>
                        <span className="op-tags">
                          {copilotPicks.has(b.index) && <span className="op-tag">Copilot</span>}
                          {oraclePicks.has(b.index) && <span className="op-tag">Oracle</span>}
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="muted small">Hints come from {hintSource}. Times are UK local.</p>
          <div className="op-actions">
            {!revealed
              ? <button type="button" className="btn" onClick={reveal} disabled={picked.size === 0}>Reveal the day</button>
              : <>
                  <button type="button" className="btn" onClick={reset}>Play again</button>
                  {!playing && <button type="button" className="btn btn-quiet" onClick={() => setStep(0)}>Replay the day</button>}
                </>}
          </div>
        </div>

        <figure className="card op-mirror" aria-label={`${mirror?.name ?? "Farm"} turbine mirror`}>
          <Turbine spinning={revealed && mirrorState === "generating"} />
          <figcaption>
            <div className="op-farm">{mirror?.name} · {fmtNum(mirror?.capacity_mw)} MW</div>
            <div className="op-clock" aria-live="polite">
              {revealed ? <>{current && localTime(current.start_utc)} · <strong>{STATE_TEXT[mirrorState]}</strong></> : "Waiting for your calls"}
            </div>
            {revealed && (
              <div className="op-progress" role="progressbar" aria-label="Replay progress" aria-valuemin={0} aria-valuemax={periods.length} aria-valuenow={step}>
                <div style={{ width: `${(step / periods.length) * 100}%` }} />
              </div>
            )}
          </figcaption>
        </figure>
      </div>

      {revealed && (
        <div className="card op-scores" aria-label="Scores">
          {scores.map((s) => (
            <div key={s.id} className={`op-score op-score-${s.id}`}>
              <span className="op-score-name">{s.name}</span>
              <div className="op-track"><div className="op-bar" style={{ width: `${(s.mwh / scale) * 100}%` }} /></div>
              <span className="op-score-value">{fmtNum(s.mwh)} MWh</span>
            </div>
          ))}
          <p className="muted small">Soaked-up MWh in replay; not revenue. Each ready half-hour absorbs up to {CAP_MWH} MWh ({LOAD_MW} MW × 0.5 h) of curtailed wind across all farms. Oracle knows the outcome and takes the best {BUDGET} blocks; Copilot's schedule is mapped onto blocks.</p>
        </div>
      )}
      <Source meta={replay.data.meta} />
    </Screen>
  );
}

const STATE_TEXT: Record<FarmState, string> = {
  generating: "Generating",
  instructed: "Paid to switch off",
  unavailable: "Outage",
  unknown: "No data",
};

function Gusts({ level }: { level: number }) {
  return (
    <svg className="op-gusts" viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 6} y={9 - i * 3} width="4" height={3 + i * 3} rx="1" className={i <= level ? "lit" : ""} />)}
    </svg>
  );
}

function Turbine({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`op-turbine${spinning ? " spinning" : ""}`} viewBox="0 0 200 260" role="img" aria-label={spinning ? "Turbine spinning" : "Turbine stopped"}>
      <path d="M96 100 L104 100 L109 250 L91 250 Z" className="tower" />
      <g className="blades">
        {[0, 120, 240].map((r) => <path key={r} d="M100 100 C96 70 96 40 100 14 C104 40 106 70 100 100 Z" transform={`rotate(${r} 100 100)`} />)}
      </g>
      <circle cx="100" cy="100" r="7" className="hub" />
    </svg>
  );
}
