import { cssVar } from "./useTheme";

export type MapTheme = {
  growth: string[]; // 5 steps then unknown
  link: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  halo: string;
  surface: string;
  mapBg: string;
  rule: string;
};

/** Read the current theme's map colours from the CSS custom properties (hex values). */
export function readMapTheme(): MapTheme {
  return {
    growth: [0, 1, 2, 3, 4].map((i) => cssVar(`--ws-growth-${i}`)).concat(cssVar("--ws-unknown")),
    link: cssVar("--ws-link"),
    ink: cssVar("--ws-ink"),
    muted: cssVar("--ws-muted"),
    accent: cssVar("--ws-accent"),
    onAccent: cssVar("--ws-on-accent"),
    halo: cssVar("--ws-halo"),
    surface: cssVar("--ws-surface"),
    mapBg: cssVar("--ws-map-bg"),
    rule: cssVar("--ws-rule"),
  };
}

/** "#RRGGBB" plus alpha to an rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}
