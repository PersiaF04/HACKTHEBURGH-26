import type { MapResponse } from "../api";

const papersIn = (m: MapResponse) => m.concepts.reduce((sum, c) => sum + (typeof c.papers_year === "number" ? c.papers_year : 0), 0);

/**
 * The last year with complete data. A corpus often has a thin final year (a partial year, or a cap), and
 * growth measured into it looks like a collapse. Step back while a year holds under half of the year
 * before it, so growth statistics only run to the last well-populated year.
 */
export async function lastFullYear(range: { min: number; max: number }, load: (year: number) => Promise<MapResponse>): Promise<number> {
  let year = range.max;
  for (let step = 0; step < 4 && year > range.min; step += 1) {
    const [current, before] = await Promise.all([load(year), load(year - 1)]);
    const a = papersIn(current), b = papersIn(before);
    if (b > 0 && a < 0.5 * b) year -= 1; else break;
  }
  return year;
}
