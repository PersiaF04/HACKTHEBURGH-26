import { useEffect, useMemo, useRef, useState } from "react";
import { CoachMark, useCoach } from "../dashboard/Coach";
import { DashMap, MapLegend, type MapPin } from "../dashboard/DashMap";
import { PlaceLoad, type LoadSettings } from "../dashboard/PlaceLoad";
import { avoidedMwh, boundaryOf, estimateLoad, scoreUserLoad, tradablePot, type LoadResult, type Sandbox } from "../sandbox";
import { AskingCard, BillCard, CopilotCard, TomorrowCard, fmtFill } from "../dashboard/RailCards";
import { Timeline, type TimelinePoint } from "../dashboard/Timeline";
import {
  fmtEnergy, fmtGbp, fmtNum, fmtTime, useJson,
  type Copilot, type CurtailmentDaily, type DashboardSummary, type DfsRequests, type Farms, type Forecast, type GridFile, type Iceberg, type Replay,
} from "../data";
import { SectionNav } from "../dashboard/SectionNav";
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

function Kpi({ value, label, hint, tone, tip }: { value: string; label: string; hint?: string; tone?: string; tip?: string }) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ""}`} title={tip}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
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
  const [showLines, setShowLines] = useState(true);
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
  const hasProb = series.points.some((p) => p.p != null);
  const hasBoundary = useMemo(() => (replay.data?.periods ?? []).some((p) => boundaryOf(p) != null), [replay.data]);
  const avoidedTotal = series.points.reduce((s, p) => s + (p.avoided ?? 0), 0);
  const dayTotal = series.cumMwh[series.cumMwh.length - 1] ?? 0;

  const fill = useMemo(() => {
    const reqs = (dfs.data?.requests ?? []).filter((r) => r.direction === "Upwards" && r.tag === "System");
    const req = reqs.reduce((s, r) => s + r.required_mw, 0);
    if (!req) return null;
    const dates = reqs.map((r) => r.start_utc.slice(0, 10)).sort();
    return { fill: reqs.reduce((s, r) => s + (r.procured_mw ?? 0), 0) / req, from: dates[0], to: dates[dates.length - 1] };
  }, [dfs.data]);

  // The "what the data shows" sentences, all computed. Missing days are null, not zero, so they are counted out.
  const windowLine = useMemo(() => {
    const ds = (daily.data?.days ?? []).filter((d) => d.curtailed_mwh != null);
    if (!ds.length) return null;
    return `${fmtEnergy(ds.reduce((s, d) => s + (d.curtailed_mwh ?? 0), 0))} switched off across ${ds.length} days with data, ${fmtDay(ds[0].date).replace(/ \d{4}$/, "")} to ${fmtDay(ds[ds.length - 1].date)}.`;
  }, [daily.data]);
  const dayLine = useMemo(() => {
    if (!series.off.length || !replay.data || isLive) return null;
    const peak = series.off.reduce((b, v, k) => (v > series.off[b] ? k : b), 0);
    const paid = series.cumGbp[series.cumGbp.length - 1];
    return `${shortDay(replay.data.date)}: up to ${series.off[peak]} farms off at once, ${fmtEnergy(dayTotal)} lost${paid ? `, ${fmtGbp(paid)} paid` : ""}.`;
  }, [series, replay.data, isLive, dayTotal]);
  const cableLine = useMemo(() => {
    const bs = (replay.data?.periods ?? []).map(boundaryOf).filter((b): b is NonNullable<typeof b> => b != null);
    if (!bs.length) return null;
    const lo = Math.min(...bs.map((b) => b.limit)), hi = Math.max(...bs.map((b) => b.limit));
    const flows = bs.map((b) => b.flow);
    return `Cables south: published limit ${lo === hi ? fmtNum(lo) : `${fmtNum(lo)}–${fmtNum(hi)}`} MW; NESO day-ahead forecast ${fmtNum(Math.min(...flows))}–${fmtNum(Math.max(...flows))} MW wanting to flow. Above the limit signals potential constraint pressure. Not outturn.`;
  }, [replay.data]);

  const placed = useMemo(() => (farms.data?.farms ?? []).filter((f): f is PlacedFarm => f.lat != null && f.lon != null), [farms.data]);
  const period = replay.data?.periods[at];
  const boundary = period ? boundaryOf(period) : null;
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

  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-brand">
          <h1 className="dash-title">Turn Up Scotland</h1>
          <p className="dash-lede">When Scotland's cables south are full, NESO pays wind farms to switch off. <span className="dash-lede-key">Orange = paid to stop right now.</span></p>
        </div>
        <SectionNav />
      </header>

      <aside className="dash-left" aria-label="What's going on and what the data shows">
        <div className="dash-kpis">
          <Kpi value={fmtEnergy(series.cumMwh[at])} label="wind wasted so far" hint={period ? `by ${fmtTime(period.start_utc)}` : undefined} tone="stopped" tip={homesTip(series.cumMwh[at])} />
          <Kpi value={fmtGbp(series.cumGbp[at])} label="paid to wind so far" hint={isLive && series.cumGbp[at] == null ? "settles next morning" : undefined} />
          <Kpi value={period ? `${series.off[at]}` : "—"} label={`of ${total || "—"} farms off now`} />
          <Kpi value={fill ? fmtFill(fill.fill) : "—"} label="of NESO's call answered" hint={fill ? `${fmtDay(fill.from).replace(/ \d{4}$/, "")}–${fmtDay(fill.to)}` : undefined} />
        </div>
        <section className="dash-explain">
          <h2>What's going on</h2>
          <p>Scotland has far more wind than it uses. The surplus travels to England over a handful of high-voltage cables, and on windy days they are full.</p>
          <h2>Why it's a problem</h2>
          <p>Then NESO, the grid operator, pays wind farms to switch off and pays gas plants in England to switch on. Bill payers fund both: clean power is thrown away and gas is burned.</p>
        </section>
        <AskingCard data={dfs.data} date={date} />
        <BillCard data={iceberg.data} />
        <section className="dash-explain">
          <h2>What the data shows</h2>
          <ul>
            {windowLine && <li>{windowLine}</li>}
            {dayLine && <li>{dayLine}</li>}
            {cableLine && <li>{cableLine}</li>}
          </ul>
        </section>
        <p className="dash-sources">
          {anySample && <span className="badge badge-warn">Sample data</span>}
          {isLive ? "Live estimate; payments settle the next morning." : "Retrospective replay."} Sources: Elexon, NESO. Coastline: Natural Earth.
        </p>
      </aside>

      <main className="dash-centre">
        <section className={`dash-map${coachOn("map")}`} aria-label="Map of Scottish wind farms">
          {period && farms.data ? (
            <>
              <div className="dash-clock">
                <span className="dash-clock-time">{fmtTime(period.start_utc).replace(" UTC", "")}<small> UTC</small></span>
                <span className="dash-clock-day">
                  {isLive ? <><b className="dash-live-tag">Live</b> estimate · {shortDay(date)}</> : <>{shortDay(date)} · replay, retrospective</>}
                </span>
                {isLive && series.off[at] === 0 && <span className="dash-clock-day">No farms are paid to switch off right now. Try a replay day.</span>}
              </div>
              <DashMap farms={placed} period={period} showLines={showLines} lines={grid}
                label={`Wind farm states at ${fmtTime(period.start_utc)} on ${fmtDay(date)}: ${series.off[at]} of ${total} paid to switch off`}
                pin={pin} pinOn={onNow} onMovePin={setPin} />
              <MapLegend unplaced={farms.data.farms.length - placed.length} />
              {showLines && grid.length > 0 && (
                <p className="dash-credit">
                  <a href={gridFile.data?.meta?.attribution_url ?? "https://www.openstreetmap.org/copyright"} target="_blank" rel="noreferrer"
                    title={gridFile.data?.meta?.attribution}>© OpenStreetMap contributors (ODbL)</a><br />
                  Western Link route is schematic. No per-line flow is published.
                </p>
              )}
            </>
          ) : <p className="dash-loading">{error ? `Couldn't load data: ${error}` : "Loading the map…"}</p>}
          {coach.target === "map" && <CoachMark step={coach.step} onNext={coach.next} onClose={coach.close} />}
        </section>

        {/* The map's own cable label is too small to read on a phone, so its honesty text moves here. */}
        {boundary && showLines && (
          <p className="dash-pipe-note">
            <strong>Cables south: {boundary.flow > boundary.limit ? `${(boundary.flow / boundary.limit).toFixed(1)}× over the limit` : `${Math.round((boundary.flow / boundary.limit) * 100)}% full`} (estimate).</strong>{" "}
            NESO day-ahead forecast: {fmtNum(boundary.flow)} MW wanting to flow; published limit {fmtNum(boundary.limit)} MW. Forecast demand on the cables vs their limit, not outturn. Above the limit signals potential constraint pressure.
          </p>
        )}

        <section className={`dash-time${coachOn("timeline")}`} aria-label="The day, half-hour by half-hour">
          <div className="dash-time-head">
            <h2 className="dash-time-title">Wind switched off</h2>
            <ul className="dash-time-key">
              <li><i className="tk tk-area" aria-hidden="true" />MWh off</li>
              <li title="NESO's Demand Flexibility Service (DFS) requests"><i className="tk tk-ask" aria-hidden="true" />NESO asked</li>
              <li><i className="tk tk-ready" aria-hidden="true" />Copilot ready</li>
              {hasProb && <li title="Walk-forward: the model saw only earlier days"><i className="tk tk-prob" aria-hidden="true" />Forecast chance</li>}
              {loadResult && loadResult.on.size > 0 && <li><i className="tk tk-mine" aria-hidden="true" />Your load</li>}
              {extraGw > 0 && <li><i className="tk tk-avoided" aria-hidden="true" />+{extraGw.toFixed(1)} GW est.</li>}
            </ul>
          </div>
          {n > 0 ? <Timeline points={series.points} at={at} onSeek={seek} /> : <div className="tl-plot" />}
          {coach.target === "timeline" && <CoachMark step={coach.step} onNext={coach.next} onClose={coach.close} />}
        </section>

        <div className="dash-next">
          <TomorrowCard data={forecast.data} summary={summary.data} />
          <div className={`dash-copilot-wrap${coachOn("copilot")}`}>
            <CopilotCard data={copilot.data} summary={summary.data} date={date} />
            {coach.target === "copilot" && <CoachMark step={coach.step} onNext={coach.next} onClose={coach.close} />}
          </div>
        </div>
      </main>

      <aside className="dash-right" aria-label="Try it">
        <div className="dash-controls">
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
          <button type="button" className="dash-play" onClick={togglePlay} aria-label={playing ? "Pause replay" : "Play replay"} aria-pressed={playing} disabled={!n}>
            {playing
              ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" /></svg>
              : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4c0 .6.7 1 1.2.6l8-5.2a.7.7 0 0 0 0-1.2l-8-5.2c-.5-.4-1.2 0-1.2.6z" /></svg>}
          </button>
        </div>
        {!isLive && <PlaceLoad settings={load} onChange={setLoad} result={loadResult} onNow={onNow} pot={pot} dayLabel={shortDay(date)} />}
        <section className={`dash-whatif${hasBoundary ? "" : " is-off"}`} aria-label="What if there were more cables">
          <label className="dash-toggle">
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} />
            <span>Power lines</span>
            <small>forecast demand on the cables vs their limit</small>
          </label>
          <label htmlFor="whatif-gw" className="dash-whatif-label">What if: <b>+{extraGw.toFixed(1)} GW</b> cables south</label>
          <input id="whatif-gw" type="range" min={0} max={6} step={0.5} value={extraGw} disabled={!hasBoundary}
            aria-describedby="whatif-out" onChange={(e) => setExtraGw(Number(e.target.value))} />
          <output id="whatif-out" htmlFor="whatif-gw">
            {!hasBoundary ? "Needs boundary data."
              : <>{extraGw > 0 && <><b>{fmtEnergy(avoidedTotal)}</b> of {fmtEnergy(dayTotal)} might be avoided ({Math.round((avoidedTotal / Math.max(dayTotal, 1)) * 100)}%). </>}Estimate: simple counterfactual, not a power-flow model.</>}
          </output>
        </section>
      </aside>
    </div>
  );
}
