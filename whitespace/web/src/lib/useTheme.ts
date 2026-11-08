import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
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
  let mq: MediaQueryList | null = null;
  const onSystem = () => apply(systemTheme());
  try { mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", onSystem); } catch { /* ignore */ }
  return () => { observer.disconnect(); mq?.removeEventListener("change", onSystem); };
}

/** Current system theme; re-renders whenever the OS appearance changes. */
export function useTheme(): { theme: Theme } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  return { theme };
}

/** Resolve a CSS custom property to a concrete colour string (for canvas and three.js). */
export function cssVar(name: string, fallback = "#808080"): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
