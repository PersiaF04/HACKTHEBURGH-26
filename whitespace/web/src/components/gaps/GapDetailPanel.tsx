import type { GapDetail, GapSummary, PaperSummary } from "../../api";
import { f2, isNum, pct } from "./format";
import { statedGapsFactor } from "./GapTable";

export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export interface GapDetailPanelProps {
  gap: GapSummary | null;
  rank: number | null;
  total: number;
  detail: GapDetail | null;
  loading?: boolean;
  error?: string | null;
}

function Papers({ label, papers }: { label: string; papers: PaperSummary[] }) {
  return (
    <div className="gx-papers__col">
      <span className="gx-papers__label">{label}</span>
      {papers.map((p) => {
        const href = safeExternalUrl(p.url);
        const body = (<><span className="gx-paper__t">{p.title}</span>{p.year != null && <span className="gx-paper__y">{p.year}</span>}</>);
        return href
          ? <a key={p.id} className="gx-paper" href={href} target="_blank" rel="noreferrer">{body}</a>
          : <div key={p.id} className="gx-paper">{body}</div>;
      })}
    </div>
  );
}

export function GapDetailPanel({ gap, rank, total, detail, loading, error }: GapDetailPanelProps) {
  if (!gap) return <aside className="gx-detail" aria-label="Gap detail" />;
  const g = gap;
  const sg = statedGapsFactor(g);
  const validated = g.interval_validation?.validated === true && isNum(g.p_lo) && isNum(g.p_hi);
  const factors: Array<{ name: string; v: string; why: string; op?: string; strong?: boolean; blue?: boolean }> = [
    { name: "P(link)", v: f2(g.p_link), why: "model probability", blue: true },
    { name: "Momentum", v: f2(g.momentum), why: isNum(g.growth_a) && isNum(g.growth_b) ? `growth ${f2(g.growth_a)} + ${f2(g.growth_b)}` : "", op: "×" },
    { name: "Novelty", v: f2(g.novelty), why: isNum(g.neighbour_overlap) ? `1 − ${f2(g.neighbour_overlap)} overlap` : "", op: "×" },
    { name: "Stated gaps", v: sg == null ? "—" : sg.toFixed(2), why: sg == null ? "" : `1 + ${f2(g.gap_rate_a)} + ${f2(g.gap_rate_b)}`, op: "×" },
    { name: "Gap score", v: f2(g.gap_score), why: rank != null ? `rank ${rank} of ${total}` : "", op: "=", strong: true },
  ];
  const papersA = detail?.closest_a ?? [];
  const papersB = detail?.closest_b ?? [];
  const shared = detail?.shared_neighbours ?? [];
  return (
    <aside className="gx-detail" aria-label="Gap detail">
      <div className="gx-detail__head">
        <span className="gx-eyebrow">Gap{rank != null ? ` · rank ${rank}` : ""}</span>
        <h2 className="gx-detail__title">{g.a_label} <span className="gx-blue">↔</span> {g.b_label}</h2>
        <p className="gx-detail__status">
          Not yet linked.
          {isNum(g.p_link) && <> <span className="gx-mono gx-ink">{pct(g.p_link)}</span> chance they share 3+ papers within three years</>}
          {validated && <> (bootstrap range <span className="gx-mono">{pct(g.p_lo)}–{pct(g.p_hi)}</span>)</>}
          {isNum(g.p_link) && "."}
        </p>
      </div>

      <section className="gx-sec">
        <h3 className="gx-h3">How the score is made</h3>
        <div className="gx-formula" role="group" aria-label={`Gap score ${f2(g.gap_score)} equals P(link) ${f2(g.p_link)} times momentum ${f2(g.momentum)} times novelty ${f2(g.novelty)} times stated gaps ${sg == null ? "not available" : sg.toFixed(2)}`}>
          {factors.map((f) => (
            <div key={f.name} className="gx-formula__item">
              {f.op && <span aria-hidden="true" className={f.strong ? "gx-formula__op is-strong" : "gx-formula__op"}>{f.op}</span>}
              <div className={f.strong ? "gx-formula__cell is-strong" : "gx-formula__cell"}>
                <span className="gx-formula__name">{f.name}</span>
                <span className="gx-formula__v" style={{ fontWeight: f.strong ? 600 : 500, color: f.blue ? "var(--ws-accent)" : undefined }}>{f.v}</span>
                {f.why && <span className="gx-formula__why">{f.why}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {loading && <p className="gx-note" role="status">Loading gap evidence…</p>}
      {error && <p className="gx-note" role="alert">Could not load gap details: {error}</p>}

      {(papersA.length > 0 || papersB.length > 0) && (
        <section className="gx-sec">
          <h3 className="gx-h3">Closest papers on each side</h3>
          <div className="gx-papers">
            <Papers label={g.a_label} papers={papersA} />
            <Papers label={g.b_label} papers={papersB} />
          </div>
        </section>
      )}

      <section className="gx-sec gx-sec--tight">
        {shared.length > 0 && (
          <>
            <h3 className="gx-h3">Shared neighbouring concepts</h3>
            <div className="gx-chips">{shared.map((c) => <span key={c.id} className="gx-chip">{c.label}</span>)}</div>
          </>
        )}
        <a className="gx-link" href="#open-problems">Stated open problems for this pair ↓</a>
      </section>
    </aside>
  );
}
