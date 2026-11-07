import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtNum } from "../data";

export interface TimelinePoint { start_utc: string; mwh: number; asked: boolean; ready: number | null; mine?: boolean; avoided?: number; p?: number | null }

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const L = 6, R = 6, T = 6, B = 15;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// Runs of consecutive true values, as [first, last] index pairs.
const runs = (flags: boolean[]) => flags.reduce<[number, number][]>((acc, f, i) => {
  if (!f) return acc;
  const last = acc[acc.length - 1];
  if (last && last[1] === i - 1) last[1] = i; else acc.push([i, i]);
  return acc;
}, []);

export function Timeline({ points, at, onSeek, detail = false }: { points: TimelinePoint[]; at: number; onSeek: (i: number) => void; detail?: boolean }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const n = points.length;
  const slot = (w - L - R) / Math.max(n, 1);
  const x = (i: number) => L + slot * (i + 0.5);
  const max = Math.max(1, ...points.map((p) => p.mwh)) * 1.08;
  const baseY = h - B;
  const y = (v: number) => baseY - (v / max) * (baseY - T);
  const area = n && w ? `M${L},${baseY}` + points.map((p, i) => `L${x(i).toFixed(1)},${y(p.mwh).toFixed(1)}`).join("") + `L${w - R},${y(points[n - 1].mwh).toFixed(1)}L${w - R},${baseY}Z` : "";
  const hasAvoided = points.some((p) => (p.avoided ?? 0) > 0);
  const avoidedBand = hasAvoided && w ? points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.mwh).toFixed(1)}`).join("") + [...points].reverse().map((p, k) => `L${x(n - 1 - k).toFixed(1)},${y(Math.max(0, p.mwh - (p.avoided ?? 0))).toFixed(1)}`).join("") + "Z" : "";
  const line = n && w ? points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.mwh).toFixed(1)}`).join("") : "";
  const px = x(at);
  const asked = runs(points.map((p) => p.asked));
  const ready = runs(points.map((p) => p.ready != null));
  const mine = runs(points.map((p) => !!p.mine));
  // Walk-forward P(request) on its own 0–1 scale over the plot; breaks at nulls.
  const probLine = w ? points.map((p, i) => (p.p == null ? "" : `${i && points[i - 1].p != null ? "L" : "M"}${x(i).toFixed(1)},${(baseY - p.p * (baseY - T)).toFixed(1)}`)).join("") : "";

  const seekFrom = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - L) / slot))));
  };
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowRight: at + 1, ArrowUp: at + 1, ArrowLeft: at - 1, ArrowDown: at - 1, PageUp: at + 4, PageDown: at - 4, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onSeek(Math.max(0, Math.min(n - 1, to)));
  };
  const cur = points[at];
  const valueText = cur ? `${hhmm(cur.start_utc)}, ${fmtNum(cur.mwh)} MWh of accepted turn-down${cur.asked ? ", NESO turn-up request open" : ""}${cur.ready != null ? ", copilot ready" : ""}` : "";

  return (
    <div className="tl-plot" ref={ref}>
      {w > 0 && n > 0 && (
        <svg width={w} height={h} className="tl-svg" role="slider" tabIndex={0}
          aria-label="Playhead: half-hour of the day" aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={at} aria-valuetext={valueText}
          onKeyDown={onKey}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e); }}>
          <defs>
            <pattern id="tl-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect className="tl-hatch-bg" width="5" height="5" /><line className="tl-hatch" x1="0" y1="0" x2="0" y2="5" /></pattern>
            <linearGradient id="tl-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className="tl-fill-0" />
              <stop offset="1" className="tl-fill-1" />
            </linearGradient>
            <clipPath id="tl-past"><rect x={0} y={0} width={Math.max(0, px)} height={h} /></clipPath>
          </defs>
          {asked.map(([a, b]) => (
            <g key={`a${a}`} className="tl-ask">
              <rect x={x(a) - slot / 2} y={T - 4} width={(b - a + 1) * slot} height={baseY - T + 4} rx={3}><title>NESO asked for extra demand, {hhmm(points[a].start_utc)}–{hhmm(new Date(Date.parse(points[b].start_utc) + 18e5).toISOString())}</title></rect>
            </g>
          ))}
          <line className="tl-base" x1={L} x2={w - R} y1={baseY} y2={baseY} />
          <path className="tl-area-future" d={area} />
          <path className="tl-area" d={area} clipPath="url(#tl-past)" />
          <path className="tl-line" d={line} clipPath="url(#tl-past)" />
          {avoidedBand && <path className="tl-avoided" d={avoidedBand} />}
          {detail && probLine && <path className="tl-prob" d={probLine} />}
                    {detail && ready.map(([a, b]) => (
            <rect key={`r${a}`} className="tl-ready" x={x(a) - slot / 2 + 1} y={baseY - 4} width={(b - a + 1) * slot - 2} height={4} rx={2} />
          ))}
          {detail && mine.map(([a, b]) => (
            <rect key={`m${a}`} className="tl-mine" x={x(a) - slot / 2 + 1} y={baseY - 9} width={(b - a + 1) * slot - 2} height={4} rx={2} />
          ))}
          {points.map((p, i) => i % 6 === 0 && (
            <text key={p.start_utc} className="tl-tick" x={x(i) - slot / 2} y={h - 3}>{hhmm(p.start_utc)}</text>
          ))}
          <g className="tl-head" transform={`translate(${px.toFixed(1)} 0)`}>
            <line y1={T - 4} y2={baseY + 3} />
            <circle cy={baseY} r={5} />
          </g>
        </svg>
      )}
    </div>
  );
}
