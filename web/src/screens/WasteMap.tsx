import { useEffect, useMemo, useState } from "react";
import { Loading, Screen, Source, Stat } from "../components";
import { fmtEnergy, fmtGbp, fmtTime, useJson, type Farm, type Farms, type Replay } from "../data";

// Equirectangular projection over Scotland's bounding box, corrected for latitude.
const BOX = { minLon: -8.2, maxLon: -0.6, minLat: 54.6, maxLat: 60.9 };
const W = 520, H = 640;
const project = (lat: number, lon: number) => {
  const k = Math.cos((57.5 * Math.PI) / 180);
  const x = ((lon - BOX.minLon) * k) / ((BOX.maxLon - BOX.minLon) * k) * W;
  const y = (1 - (lat - BOX.minLat) / (BOX.maxLat - BOX.minLat)) * H;
  return { x, y };
};

export function WasteMap({ day = "2026-10-14" }: { day?: string }) {
  const farms = useJson<Farms>("farms.json");
  const replay = useJson<Replay>(`replay/${day}.json`);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = replay.data?.periods.length ?? 0;

  useEffect(() => {
    if (!playing || !n) return;
    const t = setInterval(() => setI((v) => (v + 1 < n ? v + 1 : (setPlaying(false), v))), 350);
    return () => clearInterval(t);
  }, [playing, n]);

  const totals = useMemo(() => {
    if (!replay.data) return { mwh: 0, gbp: 0 };
    let mwh = 0, gbp = 0;
    for (const p of replay.data.periods.slice(0, i + 1))
      for (const f of Object.values(p.farms)) { mwh += f.curtailed_mwh ?? 0; gbp += f.paid_gbp ?? 0; }
    return { mwh, gbp };
  }, [replay.data, i]);

  if (!farms.data || !replay.data) return <Screen eyebrow="1 · The waste" title="Where did the wind go?" lede=""><Loading error={farms.error ?? replay.error} /></Screen>;

  const period = replay.data.periods[i];
  const placed = farms.data.farms.filter((f): f is Farm & { lat: number; lon: number } => f.lat != null && f.lon != null);
  const unplaced = farms.data.farms.length - placed.length;
  const stopped = Object.values(period.farms).filter((f) => f.state === "instructed").length;

  return (
    <Screen eyebrow="1 · The waste" title="Where did the wind go?"
      lede="Each dot is a wind farm. When the cables south are full, NESO pays farms to switch off. Press play to replay a stormy day.">
      <div className="map-layout">
        <figure className="map card" aria-label={`Wind farm states at ${fmtTime(period.start_utc)}`}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img">
            {placed.map((f) => {
              const s = period.farms[f.id]?.state ?? "unknown";
              const { x, y } = project(f.lat, f.lon);
              const r = 5 + Math.sqrt(f.capacity_mw ?? 50) / 2.2;
              return (
                <g key={f.id} className={`farm farm-${s}`}>
                  <circle cx={x} cy={y} r={r}><title>{`${f.name}: ${s}`}</title></circle>
                  {s === "instructed" && <circle className="halo" cx={x} cy={y} r={r + 6} />}
                </g>
              );
            })}
          </svg>
          <figcaption className="legend">
            <span><i className="dot dot-generating" />Generating</span>
            <span><i className="dot dot-instructed" />Paid to switch off</span>
            <span><i className="dot dot-unavailable" />Unavailable (outage)</span>
            {unplaced > 0 && <span className="muted">{unplaced} farms not yet on the map</span>}
          </figcaption>
        </figure>
        <div className="side">
          <div className="stats">
            <Stat label="wasted so far today" value={fmtEnergy(totals.mwh)} />
            <Stat label="paid to wind so far" value={fmtGbp(totals.gbp)} />
            <Stat label="farms switched off now" value={`${stopped}`} hint={fmtTime(period.start_utc)} />
          </div>
          <div className="scrubber card">
            <button className="btn" onClick={() => { if (i >= n - 1) setI(0); setPlaying((p) => !p); }} aria-pressed={playing}>
              {playing ? "Pause" : "Play"}
            </button>
            <input type="range" min={0} max={n - 1} value={i} aria-label="Half-hour of the day"
              onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} />
            <span className="time">{fmtTime(period.start_utc)}</span>
          </div>
          <p className="muted small">Replay of {replay.data.date}. "Paid to switch off" means NESO accepted a bid on a farm that was available. Outages (availability below plan, with no bid) are shown separately.</p>
          <Source meta={replay.data.meta} />
        </div>
      </div>
    </Screen>
  );
}
