// TEMPORARY: delete src/demo and DemoToggle when real data is connected.
// Everything the rest of the app needs from the demo feature comes through this module.
import { demoConcept, demoGap, demoGaps, demoMap, demoMeta, demoOpenProblems, demoSearch } from "./data";

export { useDemoMode, isDemoOn, setDemoOn, DEMO_TOGGLE_ENABLED } from "./mode";
export { DemoToggle } from "./DemoToggle";
export { DEMO_CONCEPTS, demoConcept, demoGap, demoGaps, demoMap, demoMeta, demoOpenProblems, demoSearch } from "./data";

export const DEMO_BADGE = "Demo data, invented, not results";
export const DEMO_BADGE_TIP = "Every number, title and sentence in this view is invented for previewing the screens";

/** Same shape as the api object's data methods. */
export const demoApi = {
  meta: async () => demoMeta(),
  map: async (year: number) => demoMap(year),
  search: async (query: string, k = 20) => demoSearch(query, k),
  concept: async (id: string) => demoConcept(id),
  gaps: async (query = {}) => demoGaps(query),
  gap: async (a: string, b: string) => demoGap(a, b),
  openProblems: async (concept = "", type = "") => demoOpenProblems(concept, type),
};
