import { useEffect, useState, type ReactNode } from "react";
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

// The live gist comes from one poller on one PC, about every 5 minutes. Past this age, assume it has stopped.
const LIVE_STALE_MINUTES = 20;

// Ticks on its own clock, so the age keeps counting when gist fetches fail and no new data arrives.
export function LiveStale({ generatedUtc }: { generatedUtc: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const minutes = Math.floor((now - Date.parse(generatedUtc)) / 60_000);
  if (!(minutes > LIVE_STALE_MINUTES)) return null;
  return <span className="badge badge-warn" role="status">Data is {minutes} minutes old. The live feed may have stopped.</span>;
}

export function Source({ meta }: { meta: Meta }) {
  return (
    <p className="source">
      {meta.live && meta.generated_utc && <LiveStale generatedUtc={meta.generated_utc} />}
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
