import { useState } from "react";
import responses from "../mock/responses.json";
import type { MetaResponse } from "./api";

const sections = [
  ["/", "Explore"],
  ["/gaps", "Gap finder"],
  ["/open-problems", "Open problems"],
  ["/evidence", "Evidence"],
  ["/coverage", "Code coverage"],
] as const;

function currentPath() {
  return window.location.pathname;
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const meta = responses.meta as MetaResponse;
  const active = sections.find(([route]) => route === path) ?? sections[0];

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, route: string) {
    event.preventDefault();
    window.history.pushState({}, "", route);
    setPath(route);
  }

  window.onpopstate = () => setPath(currentPath());

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => navigate(event, "/")} aria-label="Whitespace home">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span>Whitespace</span>
        </a>
        <p className="topbar-note">Research directions, with evidence</p>
      </header>
      <div className="workspace">
        <nav className="side-nav" aria-label="Main navigation">
          {sections.map(([route, label]) => (
            <a
              key={route}
              href={route}
              aria-current={path === route ? "page" : undefined}
              onClick={(event) => navigate(event, route)}
            >
              {label}
            </a>
          ))}
        </nav>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">AI research landscape · {meta.year_range.min}–{meta.year_range.max}</p>
              <h1>{active[1]}</h1>
            </div>
            <span className="offline-pill">Offline demo</span>
          </div>
          <div className="placeholder-banner" role="status">
            <strong>Placeholder data</strong>
            <span>{responses.notice}</span>
          </div>
          <section className="empty-panel" aria-labelledby="empty-title">
            <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
            <h2 id="empty-title">Research artifacts aren’t loaded yet</h2>
            <p>This screen is connected to the local mock contract. It will show only values from the frozen research artifacts when they are available.</p>
          </section>
          <p className="source-note">No forecast or coverage claims are shown in this placeholder.</p>
        </main>
      </div>
    </div>
  );
}
