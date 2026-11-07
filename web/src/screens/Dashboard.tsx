import { useEffect, useMemo, useRef, useState } from "react";
import { CoachMark, useCoach } from "../dashboard/Coach";
import { LiveStale } from "../components";
import { SidePanel, type PanelId, PANELS } from "../dashboard/SidePanel";
import { DashMap, MapLegend, type MapPin } from "../dashboard/DashMap";
import { LoadOptions, TryCard, type LoadSettings } from "../dashboard/PlaceLoad";
import { avoidedMwh, boundaryOf, estimateLoad, scoreUserLoad, tradablePot, type LoadResult, type Sandbox } from "../sandbox";
import { AskingCard, BillCard, CopilotCard, TomorrowCard } from "../dashboard/RailCards";
import { Timeline, type TimelinePoint } from "../dashboard/Timeline";
import {
  fmtEnergy, fmtGbp, fmtNum, fmtTime, useJson,
  type Copilot, type CurtailmentDaily, type DashboardSummary, type DfsRequests, type Farms, type Forecast, type GridFile, type Iceberg, type Replay,
} from "../data";
import { SectionNav } from "../dashboard/SectionNav";
import { DEEP_DIVES } from "../routes";
import { LIVE, fmtDay, parseReplay, project, useLiveReplay, useReplayIndex, type PlacedFarm } from "./WasteMap";

const STEP_MS = 220;
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function useReplay(day: string | null): { data: Replay | null; error: string | null } {
  const [state, setState] = useState<{ day: string | null; data: Replay | null; error: string | null }>({ day: null, data: null, error: null });
  useEffect(() => {
    if (!day || day === LIVE) return;
    let alive = true;
    fetch(`./data/replay/${day}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: unknown) => {
        const data = parseReplay(j);
        if (alive) setState({ day, data, error: data ? null : "Replay data is malformed" });
      })
      .catch((e: Error) => alive && setState({ day, data: null, error: e.message }));
    return () => { alive = false; };
  }, [day]);
  return state.day === day ? state : { data: null, error: null };
}

// A rough scale for the wasted energy, only ever shown as a tooltip and always with its assumption.
const KWH_PER_HOME_YEAR = 2700;
const homesTip = (mwh: number | undefined) =>
  mwh ? `About ${Number(((mwh * 1000) / KWH_PER_HOME_YEAR).toPrecision(2)).toLocaleString("en-GB")} homes' annual electricity (≈2,700 kWh/home/yr, approximate)` : undefined;

function Big({ value, label, tip, signal }: { value: string; label: string; tip?: string; signal?: boolean }) {
  return (
    <div className={`big${signal ? " big-signal" : ""}`} title={tip}>
      <dd>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}

export function Dashboard() {
  const { days, liveUrl, loaded } = useReplayIndex();
  const farms = useJson<Farms>("farms.json");
  const daily = useJson<CurtailmentDaily>("curtailment_daily.json");
  const dfs = useJson<DfsRequests>("dfs_requests.json");
  const iceberg = useJson<Iceberg>("iceberg.json");
  const forecast = useJson<Forecast>("forecast.json");
  const copilot = useJson<Copilot>("copilot.json");
  const summary = useJson<DashboardSummary>("dashboard.json"); // optional (lane B, #74): Tomorrow headline, Copilot call per day, P(request)
  const sandbox = useJson<Sandbox>("sandbox.json"); // optional (lane B, #76); without it the load uses a rough estimate
  const gridFile = useJson<GridFile>("grid.json"); // optional (lane A); without it the map draws the simple cables-south pipe
  const grid = useMemo(() => (Array.isArray(gridFile.data?.lines) ? gridFile.data.lines.filter((l) => l && Array.isArray(l.coords) && l.coords.length > 1) : []), [gridFile.data]);
  const [pin, setPin] = useState<MapPin>(() => project(56.0, -3.8)); // decorative: the score depends on the zone, not the pin
  const [showLines, setShowLines] = useState(false);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [extraGw, setExtraGw] = useState(0);
  const [load, setLoad] = useState<LoadSettings>({ type: "electrolyser", mw: 50, bid: 60, zone: "Z1", value: 100 });

  // Default: the replay day with the most curtailment, so the first impression is the stormiest day on file.
  const defaultDay = useMemo(() => {
    if (!loaded || (!daily.data && !daily.error)) return null;
    const byDate = new Map((daily.data?.days ?? []).map((d) => [d.date, d.curtailed_mwh ?? -1]));
    return [...days].sort((a, b) => (byDate.get(b) ?? -1) - (byDate.get(a) ?? -1) || b.localeCompare(a))[0] ?? null;
  }, [loaded, days, daily.data, daily.error]);
  const [chosen, setChosen] = useState<string | null>(null);
  const day = chosen ?? defaultDay;
  const isLive = day === LIVE;
  const dayReplay = useReplay(isLive ? null : day);
  const liveData = useLiveReplay(liveUrl, isLive);
  const replay = isLive ? { data: liveData, error: null } : dayReplay;

  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const autoplayed = useRef(false);
  const coach = useCoach();
  const n = replay.data?.periods.length ?? 0;
  // Choosing Live sets i past the end, so the playhead follows the newest half-hour as polls add periods.
  const at = Math.min(i, Math.max(n - 1, 0));

  // Auto-play once on first load; under reduced motion, start at the end of the day so the totals are visible at rest.
  useEffect(() => {
    if (!replay.data || autoplayed.current) return;
    autoplayed.current = true;
    if (reducedMotion()) { setI(replay.data.periods.length - 1); return; }
    setI(0);
    setPlaying(true);
  }, [replay.data]);

  useEffect(() => {
    if (!playing || !n) return;
    const t = setInterval(() => setI((v) => (v + 1 < n ? v + 1 : (setPlaying(false), v))), STEP_MS);
    return () => clearInterval(t);
  }, [playing, n]);

  const loadResult = useMemo((): LoadResult | null => {
    if (!replay.data || isLive) return null;
    const sb = sandbox.data && typeof sandbox.data === "object" && sandbox.data.days ? sandbox.data : null;
    if (sb) return scoreUserLoad(sb, replay.data.date, load);
    const est = estimateLoad(load, replay.data, dfs.data?.requests ?? [], copilot.data);
    return est.on.size || est.oracle_gbp ? est : null;
  }, [replay.data, isLive, sandbox.data, load, dfs.data, copilot.data]);
  const pot = useMemo(() => (sandbox.data?.days ? tradablePot(sandbox.data, load.zone) : null), [sandbox.data, load.zone]);

  const series = useMemo(() => {
    const ps = replay.data?.periods ?? [];
    const asked = new Map<string, boolean>();
    for (const r of dfs.data?.requests ?? []) if (r.direction === "Upwards" && r.tag === "System") asked.set(r.start_utc, true);
    const date = replay.data?.date;
    const plan = new Map((copilot.data?.days.find((d) => d.date === date)?.schedule ?? []).map((s) => [s.start_utc, s.bid_gbp_per_mwh]));
    const prob = new Map((summary.data?.replay_days?.find((d) => d.date === date)?.request_probability ?? []).map((r) => [r.start_utc, r.p_turnup_request]));
    let cm = 0, cg: number | null = null;
    const points: TimelinePoint[] = [], cumMwh: number[] = [], cumGbp: (number | null)[] = [], off: number[] = [];
    for (const p of ps) {
      let mwh = 0, o = 0;
      for (const f of Object.values(p.farms)) {
        mwh += f.curtailed_mwh ?? 0;
        if (f.paid_gbp != null) cg = (cg ?? 0) + f.paid_gbp;
        if (f.state === "instructed") o++;
      }
      cm += mwh;
      points.push({ start_utc: p.start_utc, mwh, asked: asked.has(p.start_utc), ready: plan.has(p.start_utc) ? plan.get(p.start_utc) ?? 0 : null,
        mine: loadResult?.on.has(p.start_utc) ?? false, p: prob.get(p.start_utc) ?? null,
        avoided: (() => { const b = boundaryOf(p); return b && extraGw > 0 ? avoidedMwh(mwh, b.flow, b.limit, extraGw * 1000) : 0; })() });
      cumMwh.push(cm); cumGbp.push(cg ?? (isLive ? null : 0)); off.push(o);
    }
    return { points, cumMwh, cumGbp, off };
  }, [replay.data, dfs.data, copilot.data, summary.data, isLive, loadResult, extraGw]);
  const hasBoundary = useMemo(() => (replay.data?.periods ?? []).some((p) => boundaryOf(p) != null), [replay.data]);
  const avoidedTotal = series.points.reduce((s, p) => s + (p.avoided ?? 0), 0);
  const dayTotal = series.cumMwh[series.cumMwh.length - 1] ?? 0;

  // The "what the data shows" sentences, all computed. Missing days are null, not zero, so they are counted out.
  const windowLine = useMemo(() => {
    const ds = (daily.data?.days ?? []).filter((d) => d.curtailed_mwh != null);
    if (!ds.length) return null;
    return `${fmtEnergy(ds.reduce((s, d) => s + (d.curtailed_mwh ?? 0), 0))} of accepted turn-down across ${ds.length} days with data, ${fmtDay(ds[0].date).replace(/ \d{4}$/, "")} to ${fmtDay(ds[ds.length - 1].date)}.${daily.data?.validation?.n_days ? ` Reconciled against NESO over a ${daily.data.validation.n_days}-day window.` : ""}`;
  }, [daily.data]);
  const dayLine = useMemo(() => {
    if (!series.off.length || !replay.data || isLive) return null;
    const peak = series.off.reduce((b, v, k) => (v > series.off[b] ? k : b), 0);
    const paid = series.cumGbp[series.cumGbp.length - 1];
    return `${shortDay(replay.data.date)}: up to ${series.off[peak]} farms with accepted bids at once, ${fmtEnergy(dayTotal)} accepted turn-down${paid ? `, ${fmtGbp(paid)} paid` : ""}.`;
  }, [series, replay.data, isLive, dayTotal]);
  // Two published series measure this day differently, so the figures on screen say which is which.
  const sourceNote = useMemo(() => {
    const other = daily.data?.days.find((d) => d.date === replay.data?.date)?.curtailed_mwh;
    if (isLive || other == null || !dayTotal) return null;
    return `Whole day: ${fmtEnergy(dayTotal)} from Elexon accepted bid volumes (shown here). NESO's wind volumes series says ${fmtEnergy(other)}.`;
  }, [daily.data, replay.data, isLive, dayTotal]);
  const cableLine = useMemo(() => {
    const bs = (replay.data?.periods ?? []).map(boundaryOf).filter((b): b is NonNullable<typeof b> => b != null);
    if (!bs.length) return null;
    const lo = Math.min(...bs.map((b) => b.limit)), hi = Math.max(...bs.map((b) => b.limit));
    const flows = bs.map((b) => b.flow);
    return `Cables south: published limit ${lo === hi ? fmtNum(lo) : `${fmtNum(lo)}–${fmtNum(hi)}`} MW; NESO day-ahead forecast flow ${fmtNum(Math.min(...flows))}–${fmtNum(Math.max(...flows))} MW. Above the limit signals potential constraint pressure, not proof. Not outturn.`;
  }, [replay.data]);

  const placed = useMemo(() => (farms.data?.farms ?? []).filter((f): f is PlacedFarm => f.lat != null && f.lon != null), [farms.data]);
  const period = replay.data?.periods[at];
  const total = period ? Object.keys(period.farms).length : 0;
  const date = replay.data?.date ?? (day && day !== LIVE ? day : "");

  const choose = (d: string) => { setPlaying(false); setI(d === LIVE ? Number.MAX_SAFE_INTEGER : 0); setChosen(d); };
  const togglePlay = () => {
    if (!n) return;
    if (!playing && at >= n - 1) setI(0);
    setPlaying((p) => !p);
  };
  const seek = (v: number) => { setPlaying(false); setI(v); };
  const options = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const hasLive = liveData != null;
  const error = farms.error ?? replay.error;
  const coachOn = (t: string) => (coach.target === t ? " is-coached" : "");
  const onNow = !!(period && loadResult?.on.has(period.start_utc));
  const allMeta = [farms.data?.meta, replay.data?.meta, iceberg.data?.meta, dfs.data?.meta, forecast.data?.meta, copilot.data?.meta, summary.data?.meta, sandbox.data?.meta];
  const anySample = allMeta.some((m) => m?.fixture);
  const liveGenerated = isLive && replay.data?.meta.generated_utc && !Number.isNaN(Date.parse(replay.data.meta.generated_utc)) ? replay.data.meta.generated_utc : null;
  const calm = isLive && series.off[at] === 0;
  const unplaced = farms.data ? farms.data.farms.length - placed.length : 0;
  const togglePanel = (id: PanelId) => setPanel((p) => (p === id ? null : id));

  return (
    <div className={`dash${panel ? " has-panel" : ""}`}>
      <header className="dash-top">
        <div className="dash-bar">
          <h1 className="dash-title">Turn Up Scotland</h1>
          <SectionNav menu={false} />
        </div>
        <div className="dash-head">
          <p className="dash-lede">NESO pays wind farms in Scotland to switch off when the cables south are full.</p>
          <dl className="bigs">
            <Big value={fmtEnergy(series.cumMwh[at])} label="wasted" signal tip={[homesTip(series.cumMwh[at]), "Elexon accepted bid volumes; see Proof."].filter(Boolean).join(". ")} />
            <Big value={fmtGbp(series.cumGbp[at])} label={isLive && series.cumGbp[at] == null ? "paid to stop (settles next morning)" : "paid to stop"} />
            <Big value={period ? `${series.off[at]}` : "—"} label="farms told to stop now" tip={total ? `${series.off[at]} of ${total} farms have an accepted bid to turn down. Delivery is not verified.` : undefined} />
          </dl>
        </div>
      </header>

      <main className="dash-stage">
        <section className={`dash-map${coachOn("map")}`} aria-label="Map of Scottish wind farms">
          {period && farms.data ? (
            <>
              <DashMap farms={placed} period={period} showLines={showLines} lines={grid}
                label={`Wind farm states at ${fmtTime(period.start_utc)} on ${fmtDay(date)}: ${series.off[at]} of ${total} with an accepted bid to turn down`}
                pin={pin} pinOn={onNow} onMovePin={setPin} />
              <MapLegend />
              {showLines && grid.length > 0 && (
                <p className="dash-credit">
                  <a href={gridFile.data?.meta?.attribution_url ?? "https://www.openstreetmap.org/copyright"} target="_blank" rel="noreferrer"
                    title={gridFile.data?.meta?.attribution}>© OpenStreetMap contributors (ODbL)</a>
                </p>
              )}
            </>
          ) : <p className="dash-loading">{error ? `Couldn't load data: ${error}` : "Loading the map…"}</p>}
          {coach.target === "map" && <CoachMark step={coach.step} onNext={coach.next} onClose={coach.close} />}
        </section>

        <nav className="dash-edge" aria-label="More about this">
          {PANELS.map((p) => (
            <button key={p.id} type="button" className={panel === p.id ? "on" : ""} aria-expanded={panel === p.id} aria-controls="dash-panel" onClick={() => togglePanel(p.id)}>{p.label}</button>
          ))}
        </nav>

        <section className={`dash-card${coachOn("try")}`} aria-label={isLive ? "Live status" : "Try it"}>
          {isLive ? (
            <>
              <p className="live-now"><i aria-hidden="true" /><b>LIVE</b>{liveGenerated && <span>updated {fmtTime(liveGenerated)}</span>}</p>
              {liveGenerated && <p className="live-stale"><LiveStale generatedUtc={liveGenerated} /></p>}
              <p className="try-result">{calm ? "No farms have an accepted bid right now." : `${series.off[at]} farms have an accepted bid now.`}</p>
              <p className="try-note">Live estimate from accepted bids. Payments settle the next morning.</p>
              {defaultDay && <button type="button" className="try-go" onClick={() => choose(defaultDay)}>Show {shortDay(defaultDay).replace(/^\w+ /, "")}</button>}
            </>
          ) : (
            <TryCard settings={load} result={loadResult} title="Run a 50 MW load on this storm" onExplain={() => setPanel("proof")}
              onBid={(bid) => { setLoad({ ...load, bid }); if (coach.target === "try") coach.close(); }} />
          )}
          {coach.target === "try" && <CoachMark step={coach.step} onNext={coach.next} onClose={coach.close} />}
        </section>

        {panel && (
          <SidePanel id={panel} onClose={() => setPanel(null)}>
            {panel === "why" && (
              <>
                <p className="dash-story">Scotland has far more wind than it uses, and on windy days the cables south fill up. NESO then pays wind farms to turn down, and also pays gas plants to turn up. It now asks flexible demand to use that wind instead, and hardly anyone answers.</p>
                <AskingCard data={dfs.data} date={date} />
                <BillCard data={iceberg.data} />
              </>
            )}
            {panel === "tomorrow" && (
              <>
                <TomorrowCard data={forecast.data} summary={summary.data} />
                <CopilotCard data={copilot.data} summary={summary.data} date={date} />
              </>
            )}
            {panel === "whatif" && (
              <>
                {!isLive && <LoadOptions settings={load} onChange={setLoad} result={loadResult} pot={pot} onNow={onNow} />}
                <section className={`dash-whatif${hasBoundary ? "" : " is-off"}`} aria-label="What if there were more cables">
                  <h3 className="pl-title">More cables south</h3>
                  <label htmlFor="whatif-gw" className="dash-whatif-label">What if: <b>+{extraGw.toFixed(1)} GW</b></label>
                  <input id="whatif-gw" type="range" min={0} max={6} step={0.5} value={extraGw} disabled={!hasBoundary}
                    aria-describedby="whatif-out" onChange={(e) => setExtraGw(Number(e.target.value))} />
                  <output id="whatif-out" htmlFor="whatif-gw">
                    {!hasBoundary ? "Needs boundary data."
                      : <>{extraGw > 0 && <><b>{fmtEnergy(avoidedTotal)}</b> of {fmtEnergy(dayTotal)} might be avoided ({Math.round((avoidedTotal / Math.max(dayTotal, 1)) * 100)}%). </>}Estimate: simple counterfactual, not a power-flow model.</>}
                  </output>
                  <label className="dash-toggle">
                    <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} />
                    <span>Show power lines</span>
                    <small>No per-line flow is published. The Western Link route is schematic. Border-line animation shows forecast demand on the cables vs their limit.</small>
                  </label>
                </section>
              </>
            )}
            {panel === "proof" && (
              <>
                <section className="dash-explain">
                  <h3>What the data shows</h3>
                  <ul>
                    {windowLine && <li>{windowLine}</li>}
                    {dayLine && <li>{dayLine}</li>}
                    {cableLine && <li>{cableLine}</li>}
                    {sourceNote && <li>{sourceNote}</li>}
                  </ul>
                  <h3>How to read it</h3>
                  <ul>
                    <li>Orange means NESO accepted a bid to turn down. Delivery is not verified.</li>
                    <li>"Your bid" is scored against NESO's accepted prices, pay-as-bid, assuming full delivery. Change the assumptions under What if.</li>
                    <li>On the scrubber, shaded bands are half-hours when NESO asked for extra demand. With a panel open, it also shows your load, the Copilot's plan and the forecast chance NESO asks.</li>
                    {unplaced > 0 && <li>{unplaced} farms have no location yet, so they aren't on the map.</li>}
                  </ul>
                  <h3>Sources</h3>
                  <p className="dash-sources">
                    {anySample && <span className="badge badge-warn">Sample data</span>}
                    {isLive ? "Live estimate; payments settle the next morning." : "Retrospective replay."} Elexon, NESO. Coastline: Natural Earth.
                  </p>
                  <h3>Go deeper</h3>
                  <ul className="dash-deep">
                    {DEEP_DIVES.map((d) => <li key={d.id}><a href={`#${d.id}`}>{d.label}</a></li>)}
                  </ul>
                </section>
              </>
            )}
          </SidePanel>
        )}
      </main>

      <section className={`dash-scrub${coachOn("timeline")}`} aria-label="The day, half-hour by half-hour">
        <button type="button" className="dash-play" onClick={togglePlay} aria-label={playing ? "Pause replay" : "Play replay"} aria-pressed={playing} disabled={!n}>
          {playing
            ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" /></svg>
            : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 0 0 0-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" /></svg>}
        </button>
        <div className="dash-days" role="radiogroup" aria-label="Day">
          {options.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={d === day} className={d === day ? "on" : ""} onClick={() => choose(d)}>
              {shortDay(d).replace(/^\w+ /, "")}
            </button>
          ))}
          {hasLive && (
            <button type="button" role="radio" aria-checked={isLive} className={`dash-live${isLive ? " on" : ""}`} onClick={() => choose(LIVE)}>
              <i aria-hidden="true" />Live
            </button>
          )}
        </div>
        {n > 0 ? <Timeline points={series.points} at={at} onSeek={seek} detail={panel != null} /> : <div className="tl-plot" />}
        {period && (
          <p className="dash-clock">
            <b>{fmtTime(period.start_utc)}</b>
            <span>{isLive ? "live estimate" : `${shortDay(date)} · retrospective`}</span>
          </p>
        )}
        {coach.target === "timeline" && <CoachMark step={coach.step} onNext={coach.next} onClose={coach.close} />}
      </section>
    </div>
  );
}
