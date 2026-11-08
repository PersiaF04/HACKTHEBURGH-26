import type { GapDetail, GapSummary, PaperSummary } from "../../api";
import { NA, fmtDec, fmtInt, fmtPct, fmtText, fmtYear, isNum } from "../../lib/format";
import { ratePair } from "./GapTable";
import { LinkedProblems } from "./LinkedProblems";

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
  /** True when there is no data at all (as opposed to a filter that hides every gap). */
  empty?: boolean;
}

function Papers({ label, papers }: { label: string; papers: PaperSummary[] }) {
  return (
    <div className="gx-papers__col">
      <span className="gx-papers__label">{label}</span>
      {papers.map((p) => {
        const href = safeExternalUrl(p.url);
        const body = (<><span className="gx-paper__t">{fmtText(p.title)}</span><span className="gx-paper__y">{fmtYear(p.year)}</span></>);
        return href
          ? <a key={p.id} className="gx-paper" href={href} target="_blank" rel="noreferrer">{body}</a>
          : <div key={p.id} className="gx-paper">{body}</div>;
      })}
    </div>
  );
}

const SECTIONS: Array<[string, string]> = [
  ["How the score is made", "Likelihood, momentum and novelty multiplied together to rank this pair."],
  ["Closest papers on each side", "The papers that best represent each concept, so you can judge the pair yourself."],
  ["Shared neighbouring concepts", "Concepts both sides already connect to, which hint at a bridge."],
];

const FORMULA_NAMES: Array<[string, string?]> = [["Likelihood"], ["Momentum", "×"], ["Novelty", "×"], ["Gap score", "="]];

/** Neutral explainer shown until a gap is selected. Invents no data. */
function DetailSkeleton({ empty }: { empty: boolean }) {
  return (
    <aside className="gx-detail gx-skel" aria-label="Gap detail">
      <div className="gx-detail__head">
        <span className="gx-eyebrow">Gap detail</span>
        <h2 className="gx-detail__title gx-detail__title--idle">Select a gap to see why it ranks</h2>
        <p className="gx-detail__status">{empty ? "Pick a row in the table once ranked gaps are loaded." : "Nothing is selected. Start with the first row in the table, which has the highest gap score, to open its evidence here."}</p>
      </div>
      <section className="gx-sec">
        <h3 className="gx-h3">What you will see</h3>
        <ul className="gx-outline">
          {SECTIONS.map(([name, text]) => (
            <li key={name}><span className="gx-outline__n">{name}</span><span className="gx-outline__t">{text}</span></li>
          ))}
        </ul>
      </section>
      <section className="gx-sec">
        <h3 className="gx-h3">How the score is made</h3>
        <div className="gx-formula gx-formula--idle" role="img" aria-label="Gap score equals likelihood times momentum times novelty. Values appear when a gap is selected.">
          {FORMULA_NAMES.map(([name, op]) => (
            <div key={name} className="gx-formula__item">
              {op && <span aria-hidden="true" className={op === "=" ? "gx-formula__op is-strong" : "gx-formula__op"}>{op}</span>}
              <div className={op === "=" ? "gx-formula__cell is-strong" : "gx-formula__cell"}>
                <span className="gx-formula__name">{name}</span>
                <span className="gx-formula__v gx-formula__v--idle">{NA}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function GapDetailPanel({ gap, rank, total, detail, loading, error, empty = false }: GapDetailPanelProps) {
  if (!gap) return <DetailSkeleton empty={empty} />;
  const g = gap;
  const rates = ratePair(g);
  const validated = g.interval_validation?.validated === true && isNum(g.p_lo) && isNum(g.p_hi);
  const factors: Array<{ name: string; v: string; why: string; op?: string; strong?: boolean; blue?: boolean }> = [
    { name: "Likelihood", v: fmtPct(g.p_link), why: "model estimate it connects", blue: true },
    { name: "Momentum", v: fmtDec(g.momentum), why: isNum(g.growth_a) && isNum(g.growth_b) ? `weaker topic growth ${fmtDec(Math.min(g.growth_a, g.growth_b))}` : "", op: "×" },
    { name: "Novelty", v: fmtDec(g.novelty), why: isNum(g.neighbour_overlap) ? `1 − ${fmtDec(g.neighbour_overlap)} overlap` : "", op: "×" },
    { name: "Gap score", v: fmtDec(g.gap_score), why: rank != null ? `rank ${fmtInt(rank)} of ${fmtInt(total)}` : "", op: "=", strong: true },
  ];
  const papersA = detail?.closest_a ?? [];
  const papersB = detail?.closest_b ?? [];
  const shared = detail?.shared_neighbours ?? [];
  const labelA = fmtText(g.a_label);
  const labelB = fmtText(g.b_label);
  return (
    <aside className="gx-detail" aria-label="Gap detail">
      <div className="gx-detail__head">
        <span className="gx-eyebrow">Gap{rank != null ? ` · rank ${fmtInt(rank)}` : ""}</span>
        <h2 className="gx-detail__title">{labelA} <span className="gx-blue">↔</span> {labelB}</h2>
        <p className="gx-detail__status">
          Not yet linked.
          {isNum(g.p_link) && <> <span className="gx-mono gx-ink">{fmtPct(g.p_link)}</span> chance they share 3+ papers within three years</>}
          {validated && <> (bootstrap range <span className="gx-mono">{fmtPct(g.p_lo)}–{fmtPct(g.p_hi)}</span>)</>}
          {isNum(g.p_link) && "."}
        </p>
      </div>

      <section className="gx-sec">
        <h3 className="gx-h3">How the score is made</h3>
        <div className="gx-formula" role="group" aria-label={`Gap score ${fmtDec(g.gap_score)} equals likelihood ${fmtPct(g.p_link)} times momentum ${fmtDec(g.momentum)} times novelty ${fmtDec(g.novelty)}`}>
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

      <section className="gx-sec">
        <h3 className="gx-h3">Stated gaps <span className="gx-tag">display only, not in the score</span></h3>
        {rates ? (
          <>
            <p className="gx-desc gx-mono gx-ink">{labelA}: {isNum(g.gap_rate_a) ? `${(g.gap_rate_a * 100).toFixed(1)}%` : NA} · {labelB}: {isNum(g.gap_rate_b) ? `${(g.gap_rate_b * 100).toFixed(1)}%` : NA}</p>
            <p className="gx-desc">Share of each concept's papers whose abstract states an open problem (this export counts open-problem statements only). Shown for context; it does not change the gap score or the ranking.</p>
          </>
        ) : (
          <p className="gx-desc">Not yet: author-stated open problems are not available for this pair in the export. When they are, they appear here as context only, never in the score.</p>
        )}
      </section>

      {loading && <p className="gx-note" role="status">Loading gap evidence…</p>}
      {error && <p className="gx-note" role="alert">Could not load gap details: {error}</p>}

      {(papersA.length > 0 || papersB.length > 0) && (
        <section className="gx-sec">
          <h3 className="gx-h3">Closest papers on each side</h3>
          <div className="gx-papers">
            <Papers label={labelA} papers={papersA} />
            <Papers label={labelB} papers={papersB} />
          </div>
        </section>
      )}

      <LinkedProblems gap={g} attached={detail?.open_problems} loadingGap={loading} />

      <section className="gx-sec gx-sec--tight">
        {shared.length > 0 && (
          <>
            <h3 className="gx-h3">Shared neighbouring concepts</h3>
            <div className="gx-chips">{shared.map((c) => <span key={c.id} className="gx-chip">{fmtText(c.label)}</span>)}</div>
          </>
        )}
      </section>
    </aside>
  );
}
