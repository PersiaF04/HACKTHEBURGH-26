import "./map.css";

/**
 * Ghost map for an export with no data. Positions are a fixed decorative pattern, not data:
 * neutral grey, no labels, no numbers, so it can never be mistaken for real concepts.
 */
const CLUSTERS: [number, number, number][] = [[250, 230, 9], [660, 200, 8], [470, 400, 10], [800, 410, 6]];
const GHOSTS = CLUSTERS.flatMap(([cx, cy, count], c) =>
  Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399 + c; // golden angle spread
    const dist = 22 + 15 * Math.sqrt(i + 1) * 2.2;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist * 0.75, r: 5 + ((i * 7 + c * 3) % 5) * 3 };
  }));
const GHOST_LINKS: [number, number][] = [[0, 3], [2, 7], [9, 12], [14, 20], [18, 25], [5, 16], [21, 30]];

type MapSkeletonProps = { caption: string };

export function MapSkeleton({ caption }: MapSkeletonProps) {
  return (
    <section className="whitespace-map whitespace-map--skeleton" aria-label="Research map, empty until data loads">
      <div className="whitespace-map__stage">
        <svg className="whitespace-map__ghosts" viewBox="0 0 960 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {GHOST_LINKS.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={GHOSTS[a].x} y1={GHOSTS[a].y} x2={GHOSTS[b].x} y2={GHOSTS[b].y} stroke="#D9D9D4" strokeWidth="2" strokeDasharray="7 6" />
          ))}
          {GHOSTS.map((g, i) => <circle key={i} cx={g.x} cy={g.y} r={g.r} fill="#E4E4DF" />)}
        </svg>
        <p className="whitespace-map__caption" role="status">{caption}</p>
      </div>
    </section>
  );
}
