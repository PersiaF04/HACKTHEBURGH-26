import { useTheme } from "../lib/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {dark ? "☀" : "◐"}
    </button>
  );
}
