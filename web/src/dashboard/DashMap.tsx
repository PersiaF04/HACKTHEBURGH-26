import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { SCOTLAND_PATH } from "../assets/scotland";
import { fmtEnergy, fmtGbp, fmtNum, type FarmPeriod, type FarmState, type GridLine, type ReplayPeriod } from "../data";
import { boundaryOf } from "../sandbox";
import { project, STATE_LABEL, type PlacedFarm } from "../screens/WasteMap";

// The map is tilted by a small perspective projection rather than CSS 3D, so turbines stay upright and clicks map exactly.
// Input is the 520x640 space of WasteMap's project(); north recedes from the viewer.
const CX = 260, CY = 320, DEPTH = 1100, SIN = Math.sin((38 * Math.PI) / 180), COS = Math.cos((38 * Math.PI) / 180);
const tilt = (x: number, y: number) => {
  const dy = y - CY, s = DEPTH / (DEPTH - dy * SIN);
  return { x: CX + (x - CX) * s, y: CY + dy * COS * s, s };
};
const untilt = (X: number, Y: number) => {
  const t = Y - CY, dy = (t * DEPTH) / (COS * DEPTH + t * SIN), s = DEPTH / (DEPTH - dy * SIN);
  return { x: CX + (X - CX) / s, y: CY + dy };
};
const VB = { x: -70, y: 88, w: 680, h: 584 };

const COAST = SCOTLAND_PATH.replace(/([ML])\s*(-?[\d.]+)[ ,](-?[\d.]+)/g, (_, c: string, x: string, y: string) => {
  const p = tilt(Number(x), Number(y));
  return `${c}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
});
const pathOf = (pts: [number, number][]) => pts.map(([lat, lon], i) => {
  const b = project(lat, lon), p = tilt(b.x, b.y);
  return `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}).join("");

// Scotland–England land border, west to east: the simple drawing of the cables south (the SCOTEX boundary).
const PIPE = pathOf([[54.93, -3.2], [55.01, -2.95], [55.09, -2.8], [55.21, -2.6], [55.32, -2.42], [55.38, -2.22], [55.51, -2.2], [55.61, -2.25], [55.75, -2.02]]);

const SPIN_MIN_MW = 100; // smaller rotors are too small to read, and animating all of them costs frames
const noMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function Turbine({ state, size, spin }: { state: FarmState; size: number; spin: boolean }) {
  const h = size * 1.5, blade = size * 0.8;
  const blades = [0, 120, 240].map((a) => <line key={a} x1={0} y1={0} x2={0} y2={-blade} transform={`rotate(${a + 20})`} />);
  return (
    <>
      <ellipse className="dm-shadow" cx={0} cy={0} rx={size * 0.45} ry={size * 0.16} />
      {state === "instructed" && <ellipse className="dm-halo" cx={0} cy={0} rx={size * 0.95} ry={size * 0.42} />}
      <line className="dm-mast" x1={0} y1={0} x2={0} y2={-h} />
      <g className="dm-rotor" transform={`translate(0 ${-h})`}>
        <g>
          {blades}
          {spin && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite" />}
        </g>
      </g>
    </>
  );
}

function FarmDetail({ farm, p, pinned, onClose }: { farm: PlacedFarm; p: FarmPeriod | undefined; pinned: boolean; onClose: () => void }) {
  const s = p?.state ?? "unknown";
  return (
    <div className={`dm-card${pinned ? " is-pinned" : ""}`} role="status" aria-live="polite">
      <div className="dm-card-head">
        <div>
          <strong>{farm.name}</strong>
          <div className="dm-card-region">{farm.region}</div>
        </div>
        {pinned && <button type="button" className="dm-card-close" onClick={onClose} aria-label="Unpin farm details">×</button>}
      </div>
      <div className={`dm-card-state st-${s}`}><Glyph state={s} />{STATE_LABEL[s]}</div>
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

export function DashMap({ farms, period, label, showLines, lines, pin, pinOn, onMovePin }: {
  farms: PlacedFarm[]; period: ReplayPeriod; label: string; showLines: boolean; lines: GridLine[];
  pin: MapPin; pinOn: boolean; onMovePin: (p: MapPin) => void;
}) {
  const boundary = boundaryOf(period);
  const ratio = boundary ? boundary.flow / boundary.limit : 0;
  const over = ratio > 1;
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1); // keyboard: index into `order`
  const reduced = useMemo(noMotion, []);

  // Largest switch-off first, so arrow keys visit the farms that matter most.
  const order = useMemo(() => [...farms].sort((a, b) =>
    (period.farms[b.id]?.curtailed_mwh ?? 0) - (period.farms[a.id]?.curtailed_mwh ?? 0) || (b.capacity_mw ?? 0) - (a.capacity_mw ?? 0)), [farms, period]);
  // Painter's order: farther (northern) turbines first, so nearer ones stand in front.
  const drawn = useMemo(() => farms.map((f) => {
    const b = project(f.lat, f.lon), p = tilt(b.x, b.y);
    return { f, x: p.x, y: p.y, size: (3 + Math.sqrt(f.capacity_mw ?? 30) / 2.1) * p.s };
  }).sort((a, b) => a.y - b.y), [farms]);
  // About 1,700 lines: batched into one path per class, so the layer costs a few elements. Only border crossings animate.
  const grid = useMemo(() => {
    const d = (ls: GridLine[]) => ls.map((l) => pathOf(l.coords.map(([lon, lat]) => [lat, lon]))).join("");
    const schematic = lines.filter((l) => l.schematic);
    const start = schematic[0]?.coords[0];
    const b = start ? project(start[1], start[0]) : null;
    return {
      kv400: d(lines.filter((l) => !l.schematic && l.kv === 400)), kv275: d(lines.filter((l) => !l.schematic && l.kv !== 400)),
      border: d(lines.filter((l) => l.crosses_border && !l.schematic)), schematic: d(schematic), schematicAt: b ? tilt(b.x, b.y) : null,
    };
  }, [lines]);
  const keyId = cursor >= 0 ? order[cursor]?.id ?? null : null;
  const activeId = hover ?? keyId ?? pinned;
  const active = farms.find((f) => f.id === activeId);
  const pinAt = tilt(pin.x, pin.y);

  useEffect(() => {
    if (!pinned) return;
    const onEsc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setPinned(null); };
    addEventListener("keydown", onEsc);
    return () => removeEventListener("keydown", onEsc);
  }, [pinned]);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step) { e.preventDefault(); setCursor((c) => (c + step + order.length) % order.length); }
    else if ((e.key === "Enter" || e.key === " ") && keyId) { e.preventDefault(); setPinned((p) => (p === keyId ? null : keyId)); }
    else if (e.key === "Escape") { setCursor(-1); setPinned(null); }
  };

  return (
    <div className="dm">
      <svg className="dm-svg" viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet"
        tabIndex={0} role="application" aria-roledescription="map"
        aria-label={`${label}. Use arrow keys to step through farms, largest switch-off first; Enter pins details; Escape clears.`}
        onKeyDown={onKey} onBlur={() => setCursor(-1)}
        onClick={(e) => {
          setPinned(null);
          const m = e.currentTarget.getScreenCTM();
          if (!m) return;
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()), b = untilt(p.x, p.y);
          onMovePin({ x: Math.max(0, Math.min(520, b.x)), y: Math.max(0, Math.min(640, b.y)) });
        }}>
        <defs>
          <radialGradient id="dm-glow">
            <stop offset="0" className="dm-glow-0" />
            <stop offset="0.45" className="dm-glow-1" />
            <stop offset="1" className="dm-glow-2" />
          </radialGradient>
          <radialGradient id="dm-pin-glow"><stop offset="0" className="dm-pin-g0" /><stop offset="1" className="dm-pin-g1" /></radialGradient>
        </defs>
        <path className="dm-coast-wall" d={COAST} transform="translate(0 7)" aria-hidden="true" />
        <path className="dm-coast" d={COAST} aria-hidden="true" />

        <g className="dm-glows" aria-hidden="true">
          {drawn.map(({ f, x, y, size }) => {
            const p = period.farms[f.id];
            if (p?.state !== "instructed" || !p.curtailed_mwh) return null;
            return <circle key={f.id} cx={x} cy={y} r={size + 8 + Math.sqrt(p.curtailed_mwh) * 3.4} fill="url(#dm-glow)" />;
          })}
        </g>

        {showLines && (
          <g className={`dm-cables${over ? " is-over" : ""}`} aria-hidden="true">
            {grid.kv275 && <path className="dm-line dm-line-275" d={grid.kv275} />}
            {grid.kv400 && <path className="dm-line dm-line-400" d={grid.kv400} />}
            {grid.schematic && <path className="dm-line-schematic" d={grid.schematic} />}
            {grid.schematicAt && <text className="dm-line-label" x={grid.schematicAt.x - 8} y={grid.schematicAt.y + 14} textAnchor="end">Western Link (schematic route)</text>}
            {grid.border && <path className="dm-line-border" d={grid.border} />}
            {grid.border && !reduced && (
              // No per-line flow is published: this speed only reflects forecast demand on the cables vs their limit.
              <path className="dm-line-flow" d={grid.border} style={{ animationDuration: `${Math.max(0.4, 2.4 - Math.min(ratio, 4) * 0.5)}s` }} />
            )}
            {over && <path className="dm-pipe-spill" d={PIPE} style={{ strokeWidth: 14 + Math.min(4, ratio - 1) * 9 }} />}
            <path className="dm-pipe-case" d={PIPE} />
            <path className="dm-pipe-core" d={PIPE} />
            {boundary && <path className="dm-pipe-fill" d={PIPE} pathLength={100} strokeDasharray={`${Math.min(1, ratio) * 100} 100`} />}
            {!reduced && (!boundary || over) && <path className="dm-pipe-flow" d={PIPE} />}
            <text className="dm-pipe-label" x={262} y={622}>
              Cables south{boundary && <tspan className={over ? "dm-pipe-over" : "dm-pipe-ok"}>{over ? `  ${ratio.toFixed(1)}× over the limit (estimate)` : `  ${Math.round(ratio * 100)}% full (estimate)`}</tspan>}
            </text>
            <text className="dm-pipe-sub" x={262} y={637}>
              {boundary ? `NESO forecast: ${fmtNum(boundary.flow)} MW wanting to flow; limit ${fmtNum(boundary.limit)} MW` : "SCOTEX boundary · to England"}
            </text>
            {boundary && <text className="dm-pipe-sub" x={262} y={651}>Forecast demand on the cables vs their limit, not outturn.</text>}
            {boundary && over && <text className="dm-pipe-sub" x={262} y={665}>Above the limit signals potential constraint pressure.</text>}
          </g>
        )}

        <g className="dm-farms">
          {drawn.map(({ f, x, y, size }) => {
            const s = period.farms[f.id]?.state ?? "unknown";
            return (
              <g key={f.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                className={`dm-farm dm-${s}${f.id === activeId ? " is-active" : ""}${f.id === pinned ? " is-pinned" : ""}`}
                onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); setPinned((p) => (p === f.id ? null : f.id)); }}>
                <circle className="dm-hit" cx={0} cy={-size * 0.8} r={size + 2} />
                <Turbine state={s} size={size} spin={!reduced && s === "generating" && (f.capacity_mw ?? 0) >= SPIN_MIN_MW} />
              </g>
            );
          })}
        </g>

        <g className={`dm-pin${pinOn ? " is-on" : ""}`} transform={`translate(${pinAt.x.toFixed(1)} ${pinAt.y.toFixed(1)})`} aria-hidden="true">
          {pinOn && <circle className="dm-pin-glow" r={30} fill="url(#dm-pin-glow)" />}
          <rect className="dm-pin-body" x={-8} y={-8} width={16} height={16} rx={4} transform="rotate(45)" />
          <circle className="dm-pin-core" r={3.5} />
          <text className="dm-pin-label" x={15} y={-3}>Your load</text>
          <text className="dm-pin-sub" x={15} y={10}>illustrative location</text>
        </g>
      </svg>
      {active && <FarmDetail farm={active} p={period.farms[active.id]} pinned={active.id === pinned} onClose={() => setPinned(null)} />}
    </div>
  );
}

// The same turbine as on the map, so the key teaches the shape as well as the colour.
function Glyph({ state }: { state: FarmState }) {
  return (
    <svg className={`dm-glyph dm-${state}`} viewBox="-11 -21 22 24" aria-hidden="true">
      <Turbine state={state} size={9} spin={false} />
    </svg>
  );
}

export function MapLegend({ unplaced }: { unplaced: number }) {
  return (
    <ul className="dm-legend" aria-label="Map key">
      <li><Glyph state="generating" />Generating</li>
      <li><Glyph state="instructed" />Paid to switch off</li>
      <li><Glyph state="unavailable" />Outage</li>
      <li className="dm-legend-note">Each turbine is a wind farm; bigger means more capacity.{unplaced > 0 && ` ${unplaced} not yet located.`}</li>
    </ul>
  );
}
