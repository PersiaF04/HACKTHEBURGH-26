// TEMPORARY: delete src/demo and DemoToggle when real data is connected.
import { useSyncExternalStore } from "react";

const KEY = "ws-demo-data";
/** Build flag: set VITE_SHOW_DEMO_TOGGLE=false to hide the toggle and force demo mode off. Default on. */
export const DEMO_TOGGLE_ENABLED = import.meta.env.VITE_SHOW_DEMO_TOGGLE !== "false";

let on = false;
try { on = DEMO_TOGGLE_ENABLED && window.localStorage.getItem(KEY) === "1"; } catch { /* storage unavailable */ }
const listeners = new Set<() => void>();

export function isDemoOn(): boolean { return on; }
export function setDemoOn(next: boolean): void {
  if (!DEMO_TOGGLE_ENABLED) return;
  on = next;
  try { window.localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

/** [demoOn, setDemoOn]. Components re-render when the switch changes. */
export function useDemoMode(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, isDemoOn, () => false);
  return [value, setDemoOn];
}
