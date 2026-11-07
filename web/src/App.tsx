import { useEffect, useState } from "react";
import { Copilot } from "./screens/Copilot";
import { HelpWanted } from "./screens/HelpWanted";
import { Iceberg } from "./screens/Iceberg";
import { Operator } from "./screens/Operator";
import { Tomorrow } from "./screens/Tomorrow";
import { UnderTheHood } from "./screens/UnderTheHood";
import { WasteMap } from "./screens/WasteMap";

const SCREENS = [
  { id: "waste", label: "The Waste", render: () => <WasteMap /> },
  { id: "iceberg", label: "Hidden Bill", render: () => <Iceberg /> },
  { id: "help", label: "Help Wanted", render: () => <HelpWanted /> },
  { id: "tomorrow", label: "Tomorrow", render: () => <Tomorrow /> },
  { id: "copilot", label: "Flex Copilot", render: () => <Copilot /> },
  { id: "operator", label: "Be the Operator", render: () => <Operator /> },
  { id: "hood", label: "Under the Hood", render: () => <UnderTheHood /> },
] as const;


const fromHash = () => SCREENS.findIndex((s) => s.id === location.hash.slice(1));
const go = (i: number) => { location.hash = SCREENS[Math.min(SCREENS.length - 1, Math.max(0, i))].id; };

export function App() {
  const [index, setIndex] = useState(() => Math.max(0, fromHash()));
  useEffect(() => {
    const onHash = () => setIndex(Math.max(0, fromHash()));
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    addEventListener("hashchange", onHash);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("hashchange", onHash); removeEventListener("keydown", onKey); };
  }, [index]);

  return (
    <div className="app">
      <nav className="topbar" aria-label="Screens">
        <a className="brand" href="#waste">Turn Up Scotland</a>
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
