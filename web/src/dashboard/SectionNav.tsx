import { DEEP_DIVES, SECTIONS } from "../routes";

// The three top-level sections, plus the older screens one step away under "Deep dives".
export function SectionNav({ current = "dashboard", menu = true }: { current?: string; menu?: boolean }) {
  return (
    <nav className="section-nav" aria-label="Sections">
      <div className="section-links">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} aria-current={s.id === current ? "page" : undefined} className={s.id === current ? "on" : ""}>{s.label}</a>
        ))}
      </div>
      {menu && <details className="dash-menu">
        <summary>Deep dives</summary>
        <ul>
          {DEEP_DIVES.map((s) => <li key={s.id}><a href={`#${s.id}`} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>{s.label}</a></li>)}
        </ul>
      </details>}
    </nav>
  );
}
