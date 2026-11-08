import type { GapDetail, GapSummary, PaperSummary } from "../../api";
import { NA, fmtDec, fmtInt, fmtPct, fmtText, fmtYear, isNum } from "../../lib/format";
import { fmtFactor, statedGapsFactor } from "./GapTable";

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
  ["How the score is made", "The four numbers multiplied together to rank this pair."],
  ["Closest papers on each side", "The papers that best represent each concept, so you can judge the pair yourself."],
  ["Shared neighbouring concepts", "Concepts both sides already connect to, which hint at a bridge."],
];

const FORMULA_NAMES: Array<[string, string?]> = [["P(link)"], ["Momentum", "×"], ["Novelty", "×"], ["Stated gaps", "×"], ["Gap score", "="]];

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
        <div className="gx-formula gx-formula--idle" role="img" aria-label="Gap score equals P(link) times momentum times novelty times stated gaps. Values appear when a gap is selected.">
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
  const sg = statedGapsFactor(g);
  const validated = g.interval_validation?.validated === true && isNum(g.p_lo) && isNum(g.p_hi);
  const factors: Array<{ name: string; v: string; why: string; op?: string; strong?: boolean; blue?: boolean }> = [
    { name: "P(link)", v: fmtDec(g.p_link), why: "model probability", blue: true },
    { name: "Momentum", v: fmtDec(g.momentum), why: isNum(g.growth_a) && isNum(g.growth_b) ? `growth ${fmtDec(g.growth_a)} + ${fmtDec(g.growth_b)}` : "", op: "×" },
    { name: "Novelty", v: fmtDec(g.novelty), why: isNum(g.neighbour_overlap) ? `1 − ${fmtDec(g.neighbour_overlap)} overlap` : "", op: "×" },
    { name: "Stated gaps", v: isNum(sg) ? fmtDec(sg) : NA, why: isNum(sg) ? `1 + ${fmtDec(g.gap_rate_a)} + ${fmtDec(g.gap_rate_b)}` : "", op: "×" },
    { name: "Gap score", v: fmtDec(g.gap_score), why: rank != null ? `rank ${fmtInt(rank)} of ${fmtInt(total)}` : "", op: "=", strong: true },
  ];
  const papersA = detail?.closest_a ?? [];
  const papersB = detail?.closest_b ?? [];
  const shared = detail?.shared_neighbours ?? [];
  const problems = detail?.open_problems ?? [];
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
        <div className="gx-formula" role="group" aria-label={`Gap score ${fmtDec(g.gap_score)} equals P(link) ${fmtDec(g.p_link)} times momentum ${fmtDec(g.momentum)} times novelty ${fmtDec(g.novelty)} times stated gaps ${fmtFactor(sg).replace("×", "")}`}>
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
            <Papers label={labelA} papers={papersA} />
            <Papers label={labelB} papers={papersB} />
          </div>
        </section>
      )}

      {detail && (
        <section className="gx-sec gx-sec--tight">
          <details className="gx-problems">
            <summary>
              <span className="gx-h3">Author-stated open problems</span>
              <span className="gx-mono gx-problems__n">{problems.length > 0 ? fmtInt(problems.length) : NA}</span>
            </summary>
            {problems.length > 0 ? (
              <ul className="gx-problems__list">
                {problems.slice(0, 5).map((o, i) => {
                  const href = safeExternalUrl(o.paper?.url);
                  return (
                    <li key={`${o.paper?.id ?? i}-${i}`}>
                      <span className="gx-problems__s">{fmtText(o.sentence)}</span>
                      <span className="gx-problems__m">{href ? <a href={href} target="_blank" rel="noreferrer">{fmtText(o.paper?.title)}</a> : fmtText(o.paper?.title)} · {fmtYear(o.paper?.year)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="gx-note">Author-stated open problems are not available in this export yet.</p>
            )}
            <a
              className="gx-problems__more"
              href="/open-problems"
              onClick={(event) => {
                if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                window.history.pushState({}, "", "/open-problems");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >Browse all open problems</a>
          </details>
        </section>
      )}

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
