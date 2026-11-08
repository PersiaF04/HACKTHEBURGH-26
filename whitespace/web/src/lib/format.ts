/**
 * One format for every missing or unusable value in the UI.
 * Components must use these helpers instead of printing null, undefined, NaN or "n/a".
 */
export const NA = "—";

type Maybe<T> = T | null | undefined;

export function isNum(value: Maybe<number>): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Whole number with thousands separators: 102864 -> "102,864". */
export function fmtInt(value: Maybe<number>): string {
  return isNum(value) ? Math.round(value).toLocaleString("en-GB") : NA;
}

/** Compact count for tight spaces: 10010345 -> "10M", 1010345 -> "1.01M", 12400 -> "12.4K"; under 10,000 it stays in full. */
export function fmtCompact(value: Maybe<number>): string {
  if (!isNum(value)) return NA;
  if (Math.abs(value) < 10000) return fmtInt(value);
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 2 }).format(value).replace(/[a-z]+$/i, (u) => u.toUpperCase());
}

/** Fixed decimals: fmtDec(0.7134, 2) -> "0.71". */
export function fmtDec(value: Maybe<number>, digits = 2): string {
  return isNum(value) ? value.toFixed(digits) : NA;
}

/** Share 0..1 as a percentage: 0.08 -> "8%". */
export function fmtPct(value: Maybe<number>, digits = 0): string {
  return isNum(value) ? `${(value * 100).toFixed(digits)}%` : NA;
}

/**
 * 3-year growth as a percentage change. The export's `growth` is a natural-log ratio,
 * log(papers in Y-2..Y + 1) - log(papers in Y-5..Y-3 + 1) (export_map_gaps.growth), so the change is exp(g) - 1:
 * 0 -> "0%", 0.69 -> "+99%", -5.6 -> "-100%". It can never fall below -100%.
 */
export function fmtGrowth(value: Maybe<number>): string {
  if (!isNum(value)) return NA;
  const pct = Math.round((Math.exp(value) - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** Probability-like P(link) value: 0.64 -> "0.64". Never a percentage claim. */
export function fmtP(value: Maybe<number>): string {
  return fmtDec(value, 2);
}

/** Interval "[0.55, 0.72]" only when both bounds exist. */
export function fmtInterval(lo: Maybe<number>, hi: Maybe<number>): string {
  return isNum(lo) && isNum(hi) ? `[${lo.toFixed(2)}, ${hi.toFixed(2)}]` : NA;
}

export function fmtYear(value: Maybe<number>): string {
  return isNum(value) ? String(Math.round(value)) : NA;
}

/** Text that may be missing or blank. */
export function fmtText(value: Maybe<string>): string {
  return typeof value === "string" && value.trim() ? value : NA;
}
