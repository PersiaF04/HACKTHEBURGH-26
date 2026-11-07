import type { ReactNode } from "react";
import type { Meta } from "./data";

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Source({ meta }: { meta: Meta }) {
  return (
    <p className="source">
      {meta.fixture && <span className="badge badge-warn">Sample data</span>}
      {meta.retrospective && <span className="badge">Retrospective</span>}
      Source: {meta.source.join(" · ")}
    </p>
  );
}

export function Screen({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="screen">
      <header className="screen-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </header>
      {children}
    </section>
  );
}

export function Loading({ error }: { error: string | null }) {
  return <p className="muted">{error ? `Couldn't load data: ${error}` : "Loading…"}</p>;
}
