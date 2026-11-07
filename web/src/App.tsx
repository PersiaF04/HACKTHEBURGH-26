import { useEffect, useState } from "react";
import { Screen } from "./components";
import { HelpWanted } from "./screens/HelpWanted";
import { Iceberg } from "./screens/Iceberg";
import { Tomorrow } from "./screens/Tomorrow";
import { UnderTheHood } from "./screens/UnderTheHood";
import { WasteMap } from "./screens/WasteMap";

const SCREENS = [
  { id: "waste", label: "The Waste", render: () => <WasteMap /> },
  { id: "iceberg", label: "Hidden Bill", render: () => <Iceberg /> },
  { id: "help", label: "Help Wanted", render: () => <HelpWanted /> },
  { id: "tomorrow", label: "Tomorrow", render: () => <Tomorrow /> },
  { id: "copilot", label: "Flex Copilot", render: () => <Soon n={5} title="Flex Copilot" /> },
  { id: "hood", label: "Under the Hood", render: () => <UnderTheHood /> },
] as const;

function Soon({ n, title }: { n: number; title: string }) {
  return <Screen eyebrow={`${n} · Coming next`} title={title} lede="This screen is being built in #32." ><span /></Screen>;
}

const fromHash = () => SCREENS.findIndex((s) => s.id === location.hash.slice(1));

export function App() {
  const [index, setIndex] = useState(() => Math.max(0, fromHash()));
  useEffect(() => {
    const onHash = () => setIndex(Math.max(0, fromHash()));
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight") location.hash = SCREENS[Math.min(SCREENS.length - 1, index + 1)].id;
      if (e.key === "ArrowLeft") location.hash = SCREENS[Math.max(0, index - 1)].id;
    };
    addEventListener("hashchange", onHash);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("hashchange", onHash); removeEventListener("keydown", onKey); };
  }, [index]);

  return (
    <div className="app">
      <nav className="topbar" aria-label="Screens">
        <a className="brand" href="#waste">Turn Up Scotland</a>
        <div className="segmented" role="tablist">
          {SCREENS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} role="tab" aria-selected={i === index} className={i === index ? "active" : ""}>{s.label}</a>
          ))}
        </div>
      </nav>
      <main key={SCREENS[index].id} className="fade-in">{SCREENS[index].render()}</main>
    </div>
  );
}
