import { useEffect, useState } from "react";
import { DEEP_DIVES, type DeepDiveId } from "./routes";
import { Copilot } from "./screens/Copilot";
import { Dashboard } from "./screens/Dashboard";
import { HelpWanted } from "./screens/HelpWanted";
import { Iceberg } from "./screens/Iceberg";
import { Operator } from "./screens/Operator";
import { Tomorrow } from "./screens/Tomorrow";
import { UnderTheHood } from "./screens/UnderTheHood";
import { WasteMap } from "./screens/WasteMap";

const RENDER: Record<DeepDiveId, () => JSX.Element> = {
  waste: () => <WasteMap />, iceberg: () => <Iceberg />, help: () => <HelpWanted />, tomorrow: () => <Tomorrow />,
  copilot: () => <Copilot />, operator: () => <Operator />, hood: () => <UnderTheHood />,
};
const SCREENS = DEEP_DIVES.map((s) => ({ ...s, render: RENDER[s.id] }));

// -1 means the dashboard: #dashboard, an empty hash, or anything unknown.
const fromHash = () => SCREENS.findIndex((s) => s.id === location.hash.slice(1));
const go = (i: number) => { location.hash = SCREENS[Math.min(SCREENS.length - 1, Math.max(0, i))].id; };

export function App() {
  const [index, setIndex] = useState(fromHash);
  useEffect(() => {
    const onHash = () => { setIndex(fromHash()); window.scrollTo(0, 0); };
    const onKey = (e: KeyboardEvent) => {
      if (index < 0 || e.defaultPrevented) return; // the dashboard uses arrow keys for its own playhead
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    addEventListener("hashchange", onHash);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("hashchange", onHash); removeEventListener("keydown", onKey); };
  }, [index]);

  if (index < 0) return <Dashboard />;

  return (
    <div className="app">
      <nav className="topbar" aria-label="Screens">
        <a className="brand" href="#dashboard">Turn Up Scotland</a>
        <a className="topbar-home" href="#dashboard"><span aria-hidden="true">‹ </span>Dashboard</a>
        <div className="segmented">
          {SCREENS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} aria-current={i === index ? "page" : undefined} className={i === index ? "active" : ""}>{s.label}</a>
          ))}
        </div>
        {/* Phones: a pop-up button with previous/next instead of a 7-segment control. */}
        <div className="pager">
          <button type="button" className="pager-step" aria-label="Previous screen" disabled={index === 0} onClick={() => go(index - 1)}>‹</button>
          <label className="pager-pick">
            <span className="sr-only">Screen</span>
            <select value={SCREENS[index].id} onChange={(e) => { location.hash = e.target.value; }}>
              {SCREENS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <button type="button" className="pager-step" aria-label="Next screen" disabled={index === SCREENS.length - 1} onClick={() => go(index + 1)}>›</button>
        </div>
      </nav>
      <main key={SCREENS[index].id} className="fade-in">{SCREENS[index].render()}</main>
    </div>
  );
}
