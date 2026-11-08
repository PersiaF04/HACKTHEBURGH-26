import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "ws-theme";

function systemTheme(): Theme {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}
function storedTheme(): Theme | null {
  try { const v = window.localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; } catch { return null; }
}
export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" || attr === "light" ? attr : systemTheme();
}
function apply(theme: Theme) {
  const root = document.documentElement;
  // Switch without animating every property at once.
  root.setAttribute("data-theme-switching", "");
  root.setAttribute("data-theme", theme);
  window.setTimeout(() => root.removeAttribute("data-theme-switching"), 50);
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Follow the system only while the user has not chosen.
  let mq: MediaQueryList | null = null;
  const onSystem = () => { if (!storedTheme()) apply(systemTheme()); };
  try { mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", onSystem); } catch { /* ignore */ }
  return () => { observer.disconnect(); mq?.removeEventListener("change", onSystem); };
}

/** Current theme plus a toggle; re-renders whenever data-theme changes (including from other code). */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
    apply(next);
  }, []);
  return { theme, toggle };
}

/** Resolve a CSS custom property to a concrete colour string (for canvas and three.js). */
export function cssVar(name: string, fallback = "#808080"): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
