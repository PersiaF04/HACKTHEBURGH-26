import { useEffect, useMemo, useState } from "react";
import { SCOTLAND_PATH } from "../assets/scotland";
import { Loading, Screen, Source, Stat } from "../components";
import { fmtEnergy, fmtGbp, fmtNum, fmtTime, useJson, type Farm, type FarmPeriod, type FarmState, type Farms, type Replay } from "../data";

// Equirectangular projection over Scotland's bounding box, corrected for latitude.
// web/scripts/build-coastline.mjs uses the same box and formula; keep them in sync.
const BOX = { minLon: -8.2, maxLon: -0.6, minLat: 54.6, maxLat: 60.9 };
const W = 520, H = 640;
const project = (lat: number, lon: number) => {
  const k = Math.cos((57.5 * Math.PI) / 180);
  const x = ((lon - BOX.minLon) * k) / ((BOX.maxLon - BOX.minLon) * k) * W;
  const y = (1 - (lat - BOX.minLat) / (BOX.maxLat - BOX.minLat)) * H;
  return { x, y };
};

const DEFAULT_DAYS = ["2026-10-14"];
const STATE_LABEL: Record<FarmState, string> = {
  generating: "Generating", instructed: "Paid to switch off", unavailable: "Unavailable (outage)", unknown: "Unknown",
};
type PlacedFarm = Farm & { lat: number; lon: number };

// Checks every replay field this screen reads, so a malformed day or live payload never reaches the render code.
// Returns null when anything is off; meta.source defaults to [] and meta.generated_utc may be missing.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isOptNum = (v: unknown) => v === undefined || isNumOrNull(v);
const isFarmPeriod = (f: unknown) =>
  isObj(f) && typeof f.state === "string" && f.state in STATE_LABEL && isNumOrNull(f.pn_mw) && isOptNum(f.curtailed_mwh) && isOptNum(f.paid_gbp);
const isPeriod = (p: unknown) =>
  isObj(p) && typeof p.start_utc === "string" && !Number.isNaN(Date.parse(p.start_utc)) && typeof p.sp === "number"
  && isObj(p.farms) && Object.values(p.farms).every(isFarmPeriod);
function parseReplay(j: unknown): Replay | null {
  if (!isObj(j) || !isObj(j.meta) || !Array.isArray(j.periods) || !j.periods.length || !j.periods.every(isPeriod)) return null;
  const { meta } = j;
  if (meta.generated_utc !== undefined && typeof meta.generated_utc !== "string") return null;
  const source = Array.isArray(meta.source) ? meta.source.filter((s): s is string => typeof s === "string") : [];
  return { ...j, date: typeof j.date === "string" ? j.date : "", meta: { ...meta, source } } as unknown as Replay;
}

// Optional replay/index.json: either ["2026-10-14", ...] or { "days": [...], "live": "live.json" }. Missing or malformed → defaults.
// `live` is a file name under replay/ or an absolute http(s) URL (for example a raw Gist with CORS enabled).
function useReplayIndex(): { days: string[]; liveUrl: string | null } {
  const [index, setIndex] = useState<{ days: string[]; liveUrl: string | null }>({ days: DEFAULT_DAYS, liveUrl: null });
  useEffect(() => {
    let alive = true;
    fetch("./data/replay/index.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const list = Array.isArray(j) ? j : (j as { days?: unknown } | null)?.days;
        const valid = Array.isArray(list) ? list.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
        const lf = (j as { live?: unknown } | null)?.live;
        const liveUrl = typeof lf !== "string" ? null
          : /^https?:\/\//i.test(lf) ? lf
          : /^[\w.-]+\.json$/.test(lf) ? `./data/replay/${lf}` : null;
        if (alive) setIndex({ days: valid.length ? [...new Set(valid)].sort() : DEFAULT_DAYS, liveUrl });
      })
      .catch(() => { /* optional file; keep defaults */ });
    return () => { alive = false; };
  }, []);
  return index;
}

// R-8: the pipeline poller writes replay/live.json locally and it is gitignored, so the hosted site has none unless
// index.json points `live` at an absolute URL. Probe it once; while `polling`, re-fetch every 60 s with cache-busting.
// Failures are silent: before the first good load the Live option stays hidden; afterwards the last good copy is kept.
const LIVE = "live";
const LIVE_REFRESH_MS = 60_000;
function useLiveReplay(url: string | null, polling: boolean): Replay | null {
  const [data, setData] = useState<Replay | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = () =>
      fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: unknown) => { const r = parseReplay(j); if (alive && r) setData(r); })
        .catch(() => { /* optional source; hide or keep last good */ });
    load();
    const t = polling ? setInterval(load, LIVE_REFRESH_MS) : undefined;
    return () => { alive = false; clearInterval(t); };
  }, [url, polling]);
  return data;
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function FarmCard({ farm, p, pinned, onClose }: { farm: PlacedFarm; p: FarmPeriod | undefined; pinned: boolean; onClose: () => void }) {
  const s = p?.state ?? "unknown";
  return (
    <div className="farm-card" role="status" aria-live="polite">
      <div className="farm-card-head">
        <strong>{farm.name}</strong>
        {pinned && <button className="farm-card-close" onClick={onClose} aria-label="Unpin farm details">×</button>}
      </div>
      <div className="farm-card-state"><i className={`dot dot-${s}`} />{STATE_LABEL[s]}</div>
      <dl>
        <dt>Capacity</dt><dd>{farm.capacity_mw == null ? "—" : `${fmtNum(farm.capacity_mw)} MW`}</dd>
        <dt>Curtailed this half-hour</dt><dd>{fmtEnergy(p?.curtailed_mwh)}</dd>
        <dt>Paid this half-hour</dt><dd>{fmtGbp(p?.paid_gbp)}</dd>
      </dl>
      <p className="farm-card-hint">{pinned ? "Pinned. Press Esc or × to unpin." : "Click or press Enter to pin."}</p>
    </div>
  );
}

export function WasteMap({ day: initialDay = "2026-10-14" }: { day?: string }) {
  const { days, liveUrl } = useReplayIndex();
  const [day, setDay] = useState(initialDay);
  const isLive = day === LIVE;
  const [lastDay, setLastDay] = useState(initialDay);
  const farms = useJson<Farms>("farms.json");
  const dayRaw = useJson<unknown>(`replay/${isLive ? lastDay : day}.json`);
  const dayReplay = useMemo(() => {
    const data = dayRaw.data == null ? null : parseReplay(dayRaw.data);
    return { data, error: dayRaw.error ?? (dayRaw.data != null && !data ? "Replay data is malformed" : null) };
  }, [dayRaw]);
  const liveData = useLiveReplay(liveUrl, isLive);
  const replay = isLive ? { data: liveData, error: null } : dayReplay;
  const [i, setI] = useState(0);
  const [follow, setFollow] = useState(false); // live mode: stick to the latest period as new ones arrive
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const n = replay.data?.periods.length ?? 0;
  const at = isLive && follow ? Math.max(n - 1, 0) : Math.min(i, Math.max(n - 1, 0));
  const dayOptions = isLive || days.includes(day) ? days : [...days, day].sort();
  const latestDay = days[days.length - 1];

  useEffect(() => {
    if (!playing || !n) return;
    const t = setInterval(() => setI((v) => (v + 1 < n ? v + 1 : (setPlaying(false), v))), 350);
    return () => clearInterval(t);
  }, [playing, n]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPinned(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  const totals = useMemo(() => {
    if (!replay.data) return { mwh: 0, gbp: null as number | null };
    let mwh = 0, gbp: number | null = null;
    for (const p of replay.data.periods.slice(0, at + 1))
      for (const f of Object.values(p.farms)) {
        mwh += f.curtailed_mwh ?? 0;
        if (f.paid_gbp != null) gbp = (gbp ?? 0) + f.paid_gbp;
      }
    // Replay days have settled payments; live payments are null until Elexon settles them the next morning.
    return { mwh, gbp: gbp ?? (isLive ? null : 0) };
  }, [replay.data, at, isLive]);

  const chooseDay = (d: string) => {
    setPlaying(false); setI(0); setFollow(d === LIVE); setDay(d);
    if (d !== LIVE) setLastDay(d);
  };
  const hasLive = liveData != null;
  const dayPicker = (
    <div className="day-picker" role="radiogroup" aria-label="Replay day">
      {dayOptions.map((d) => (
        <button key={d} role="radio" aria-checked={d === day} className={d === day ? "active" : ""} onClick={() => chooseDay(d)}>
          {fmtDay(d)}
        </button>
      ))}
      {hasLive && (
        <button role="radio" aria-checked={isLive} className={`day-live${isLive ? " active" : ""}`} onClick={() => chooseDay(LIVE)}>
          Live
        </button>
      )}
    </div>
  );

  const head = { eyebrow: "1 · The waste", title: "Where did the wind go?" };
  if (!farms.data || !replay.data)
    return <Screen {...head} lede="">{(dayOptions.length > 1 || hasLive) && dayPicker}<Loading error={farms.error ?? replay.error} /></Screen>;

  const period = replay.data.periods[at];
  const placed = farms.data.farms.filter((f): f is PlacedFarm => f.lat != null && f.lon != null);
  const unplaced = farms.data.farms.length - placed.length;
  const stopped = Object.values(period.farms).filter((f) => f.state === "instructed").length;
  const latest = replay.data.periods[n - 1];
  const calm = isLive && !Object.values(latest.farms).some((f) => f.state === "instructed");
  const activeId = hover ?? pinned;
  const active = placed.find((f) => f.id === activeId);
  const togglePin = (id: string) => setPinned((p) => (p === id ? null : id));

  return (
    <Screen {...head}
      lede="Each dot is a wind farm. When the cables south are full, NESO pays farms to switch off. Press play to replay a stormy day.">
      <div className="map-layout">
        <figure className="map card">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Wind farm states at ${fmtTime(period.start_utc)}`}
            onClick={(e) => { if (e.target === e.currentTarget) setPinned(null); }}>
            <path className="coast" d={SCOTLAND_PATH} aria-hidden="true" />
            {placed.map((f) => {
              const s = period.farms[f.id]?.state ?? "unknown";
              const { x, y } = project(f.lat, f.lon);
              const r = 5 + Math.sqrt(f.capacity_mw ?? 50) / 2.2;
              return (
                <g key={f.id} className={`farm farm-${s}${f.id === activeId ? " is-active" : ""}${f.id === pinned ? " is-pinned" : ""}`}
                  tabIndex={0} role="button" aria-pressed={f.id === pinned} aria-label={`${f.name}, ${STATE_LABEL[s]}`}
                  onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(f.id)} onBlur={() => setHover(null)}
                  onClick={() => togglePin(f.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePin(f.id); } }}>
                  <circle className="hit" cx={x} cy={y} r={r + 4} />
                  <circle className="body" cx={x} cy={y} r={r} />
                  {s === "instructed" && <circle className="halo" cx={x} cy={y} r={r + 6} />}
                </g>
              );
            })}
          </svg>
          {active && <FarmCard farm={active} p={period.farms[active.id]} pinned={active.id === pinned} onClose={() => setPinned(null)} />}
          <figcaption className="legend">
            <span><i className="dot dot-generating" />Generating</span>
            <span><i className="dot dot-instructed" />Paid to switch off</span>
            <span><i className="dot dot-unavailable" />Unavailable (outage)</span>
            {unplaced > 0 && <span className="muted">{unplaced} farms not yet on the map</span>}
          </figcaption>
        </figure>
        <div className="side">
          {dayOptions.length > 1 || hasLive ? dayPicker : <p className="muted small day-single">Replay day: {fmtDay(day)}</p>}
          {isLive && (
            <p className="live-badge">
              <span className="live-dot" aria-hidden="true" />
              <strong>LIVE</strong>
              {(replay.data.meta.generated_utc as string | undefined) && <span className="muted">updated {fmtTime(replay.data.meta.generated_utc)}</span>}
            </p>
          )}
          {calm && (
            <div className="live-calm card" role="status">
              <p>Live: no curtailment right now. Try a replay day.</p>
              {latestDay && <button className="btn" onClick={() => chooseDay(latestDay)}>Show {fmtDay(latestDay)}</button>}
            </div>
          )}
          <div className="stats">
            <Stat label="wasted so far today" value={fmtEnergy(totals.mwh)} />
            <Stat label="paid to wind so far" value={fmtGbp(totals.gbp)} hint={isLive && totals.gbp == null ? "settled next morning" : undefined} />
            <Stat label="farms switched off now" value={`${stopped}`} hint={fmtTime(period.start_utc)} />
          </div>
          <div className="scrubber card">
            <button className="btn" onClick={() => { setFollow(false); setI(at >= n - 1 ? 0 : at); setPlaying((p) => !p); }} aria-pressed={playing}>
              {playing ? "Pause" : "Play"}
            </button>
            <input type="range" min={0} max={n - 1} value={at} aria-label="Half-hour of the day"
              onChange={(e) => { const v = Number(e.target.value); setPlaying(false); setFollow(isLive && v === n - 1); setI(v); }} />
            <span className="time">{fmtTime(period.start_utc)}</span>
          </div>
          <p className="muted small">{isLive
            ? `Live estimate for ${replay.data.date}, refreshed every minute. Curtailment is estimated from accepted bids; payments settle the next morning.`
            : `Replay of ${replay.data.date}.`} "Paid to switch off" means NESO accepted a bid on a farm that was available. Outages (availability below plan, with no bid) are shown separately. Hover, tab to or click a farm for details.</p>
          <Source meta={replay.data.meta} />
          <p className="source">Coastline: Natural Earth (public domain).</p>
        </div>
      </div>
    </Screen>
  );
}
