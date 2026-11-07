import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { SCOTLAND_PATH } from "../assets/scotland";
import { fmtEnergy, fmtGbp, fmtNum, type FarmPeriod, type ReplayPeriod } from "../data";
import { boundaryOf } from "../sandbox";
import { project, STATE_LABEL, type PlacedFarm } from "../screens/WasteMap";

// The coastline is projected into 520x640 (see WasteMap). The wider viewBox leaves room for the cables south and their label.
const VB = { x: -60, y: -6, w: 660, h: 700 };

// Scotland–England land border, west to east. The pipe follows it to show the cables south (the SCOTEX boundary).
const BORDER: [number, number][] = [[54.97, -3.2], [55.05, -2.95], [55.13, -2.8], [55.25, -2.6], [55.36, -2.42], [55.42, -2.22], [55.55, -2.2], [55.65, -2.25], [55.79, -2.02]];
const PIPE = BORDER.map(([lat, lon], i) => {
  const { x, y } = project(lat, lon);
  return `${i ? "L" : "M"}${x.toFixed(1)},${(y + 9).toFixed(1)}`;
}).join("");

const radius = (mw: number | null) => 2.2 + Math.sqrt(mw ?? 30) / 2.4;

function FarmDetail({ farm, p, pinned, onClose }: { farm: PlacedFarm; p: FarmPeriod | undefined; pinned: boolean; onClose: () => void }) {
  const s = p?.state ?? "unknown";
  return (
    <div className="dm-card" role="status" aria-live="polite">
      <div className="dm-card-head">
        <div>
          <strong>{farm.name}</strong>
          <div className="dm-card-region">{farm.region}</div>
        </div>
        {pinned && <button type="button" className="dm-card-close" onClick={onClose} aria-label="Unpin farm details">×</button>}
      </div>
      <div className={`dm-card-state st-${s}`}><i className={`dm-key dm-key-${s}`} aria-hidden="true" />{STATE_LABEL[s]}</div>
      <dl>
        <dt>Capacity</dt><dd>{farm.capacity_mw == null ? "—" : `${fmtNum(farm.capacity_mw)} MW`}</dd>
        <dt>Planned output</dt><dd>{p?.pn_mw == null ? "—" : `${fmtNum(p.pn_mw)} MW`}</dd>
        <dt>Switched off, this half-hour</dt><dd>{fmtEnergy(p?.curtailed_mwh)}</dd>
        <dt>Paid, this half-hour</dt><dd>{fmtGbp(p?.paid_gbp)}</dd>
      </dl>
    </div>
  );
}

export interface MapPin { x: number; y: number }

export function DashMap({ farms, period, label, placing = false, pin = null, pinOn = false, onPlace }: {
  farms: PlacedFarm[]; period: ReplayPeriod; label: string;
  placing?: boolean; pin?: MapPin | null; pinOn?: boolean; onPlace?: (p: MapPin) => void;
}) {
  const boundary = boundaryOf(period);
  const ratio = boundary ? boundary.flow / boundary.limit : 0;
  const over = ratio > 1;
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1); // keyboard: index into `order`

  // Largest curtailment first, so arrow keys visit the farms that matter most.
  const order = useMemo(() => [...farms].sort((a, b) =>
    (period.farms[b.id]?.curtailed_mwh ?? 0) - (period.farms[a.id]?.curtailed_mwh ?? 0) || (b.capacity_mw ?? 0) - (a.capacity_mw ?? 0)), [farms, period]);
  // Draw small farms on top of big ones so every dot stays reachable by pointer.
  const drawn = useMemo(() => [...farms].sort((a, b) => (b.capacity_mw ?? 0) - (a.capacity_mw ?? 0)), [farms]);
  const keyId = cursor >= 0 ? order[cursor]?.id ?? null : null;
  const activeId = hover ?? keyId ?? pinned;
  const active = farms.find((f) => f.id === activeId);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setPinned(null); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [pinned]);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step) { e.preventDefault(); setCursor((c) => (c + step + order.length) % order.length); }
    else if ((e.key === "Enter" || e.key === " ") && keyId) { e.preventDefault(); setPinned((p) => (p === keyId ? null : keyId)); }
    else if (e.key === "Escape") { setCursor(-1); setPinned(null); }
  };

  return (
    <div className="dm">
      <svg className={`dm-svg${placing ? " is-placing" : ""}`} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet"
        tabIndex={0} role="application" aria-roledescription="map"
        aria-label={`${label}. Use arrow keys to step through farms, largest switch-off first; Enter pins details; Escape clears.`}
        onKeyDown={onKey} onBlur={() => setCursor(-1)}
        onClick={(e) => {
          if (placing && onPlace) {
            const m = e.currentTarget.getScreenCTM();
            if (m) { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); onPlace({ x: p.x, y: p.y }); }
            return;
          }
          if (e.target === e.currentTarget) setPinned(null);
        }}>
        <defs>
          <radialGradient id="dm-glow">
            <stop offset="0" className="dm-glow-0" />
            <stop offset="0.45" className="dm-glow-1" />
            <stop offset="1" className="dm-glow-2" />
          </radialGradient>
        </defs>
        <path className="dm-coast" d={SCOTLAND_PATH} aria-hidden="true" />

        <g className="dm-glows" aria-hidden="true">
          {farms.map((f) => {
            const p = period.farms[f.id];
            if (p?.state !== "instructed" || !p.curtailed_mwh) return null;
            const { x, y } = project(f.lat, f.lon);
            return <circle key={f.id} cx={x} cy={y} r={10 + Math.sqrt(p.curtailed_mwh) * 4.2} fill="url(#dm-glow)" />;
          })}
        </g>

        <g className={`dm-cables${over ? " is-over" : ""}`} aria-hidden="true">
          {over && <path className="dm-pipe-spill" d={PIPE} style={{ strokeWidth: 14 + Math.min(4, ratio - 1) * 9 }} />}
          <path className="dm-pipe-case" d={PIPE} />
          <path className="dm-pipe-core" d={PIPE} />
          {boundary && <path className="dm-pipe-fill" d={PIPE} pathLength={100} strokeDasharray={`${Math.min(1, ratio) * 100} 100`} />}
          {(!boundary || over) && <path className="dm-pipe-flow" d={PIPE} />}
          <text className="dm-pipe-label" x={300} y={636}>
            Cables south{boundary && <tspan className={over ? "dm-pipe-over" : "dm-pipe-ok"}>{over ? `  ${ratio.toFixed(1)}× over the limit` : `  ${Math.round(ratio * 100)}% full`}</tspan>}
          </text>
          <text className="dm-pipe-sub" x={300} y={653}>
            {boundary ? `SCOTEX: wants ${fmtNum(boundary.flow)} MW, limit ${fmtNum(boundary.limit)} MW` : "SCOTEX boundary · to England"}
          </text>
          {boundary && <text className="dm-pipe-sub" x={300} y={668}>Day-ahead forecast flow vs limit (NESO), not outturn</text>}
        </g>

        <g className="dm-farms">
          {drawn.map((f) => {
            const s = period.farms[f.id]?.state ?? "unknown";
            const { x, y } = project(f.lat, f.lon);
            const r = radius(f.capacity_mw);
            const on = f.id === activeId;
            return (
              <g key={f.id} className={`dm-farm dm-${s}${on ? " is-active" : ""}${f.id === pinned ? " is-pinned" : ""}`}
                onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
                onClick={() => { if (!placing) setPinned((p) => (p === f.id ? null : f.id)); }}>
                <circle className="dm-hit" cx={x} cy={y} r={r + 3} />
                {s === "instructed" && <circle className="dm-halo" cx={x} cy={y} r={r + 3.2} />}
                <circle className="dm-body" cx={x} cy={y} r={r} />
              </g>
            );
          })}
        </g>

        {pin && (
          <g className={`dm-pin${pinOn ? " is-on" : ""}`} transform={`translate(${pin.x.toFixed(1)} ${pin.y.toFixed(1)})`} aria-hidden="true">
            {pinOn && <circle className="dm-pin-glow" r={30} fill="url(#dm-pin-glow)" />}
            <defs>
              <radialGradient id="dm-pin-glow"><stop offset="0" className="dm-pin-g0" /><stop offset="1" className="dm-pin-g1" /></radialGradient>
            </defs>
            <rect className="dm-pin-body" x={-9} y={-9} width={18} height={18} rx={4} transform="rotate(45)" />
            <circle className="dm-pin-core" r={3.5} />
            <text className="dm-pin-label" x={15} y={-4}>Your load</text>
            <text className="dm-pin-sub" x={15} y={10}>illustrative location</text>
          </g>
        )}
      </svg>
      {active && <FarmDetail farm={active} p={period.farms[active.id]} pinned={active.id === pinned} onClose={() => setPinned(null)} />}
    </div>
  );
}

export function MapLegend({ unplaced }: { unplaced: number }) {
  return (
    <ul className="dm-legend" aria-label="Map key">
      <li><i className="dm-key dm-key-generating" aria-hidden="true" />Generating</li>
      <li><i className="dm-key dm-key-instructed" aria-hidden="true" />Paid to switch off</li>
      <li><i className="dm-key dm-key-unavailable" aria-hidden="true" />Outage</li>
      <li><i className="dm-key dm-key-size" aria-hidden="true" />Size = capacity</li>
      {unplaced > 0 && <li className="dm-legend-note">{unplaced} farms not yet located</li>}
    </ul>
  );
}
