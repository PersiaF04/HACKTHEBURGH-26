export function isNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}
export const f2 = (v: number | null | undefined): string => (isNum(v) ? v.toFixed(2) : "—");
export const pct = (v: number | null | undefined): string => (isNum(v) ? `${Math.round(v * 100)}%` : "—");
