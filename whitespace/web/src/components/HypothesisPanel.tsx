import { useEffect, useState } from "react";
import { api } from "../api";
import type { GapDetail, GapSummary } from "../api";
import { fmtDec, fmtGrowth, fmtP, fmtText } from "../lib/format";
import { LinkedProblems } from "./gaps/LinkedProblems";

type Props = { gap: GapSummary; onSelectConcept: (id: string) => void };

const finite = (g: number | null | undefined): g is number => typeof g === "number" && Number.isFinite(g);
const pace = (g: number | null | undefined) =>
  !finite(g) ? "with no trend in the export" : g >= 0.45 ? "growing fast" : g >= 0.15 ? "growing" : g >= -0.05 ? "holding steady" : "shrinking";
const growthText = (g: number | null | undefined) => (finite(g) ? ` (${fmtGrowth(g)} over three years)` : "");

const goToGaps = (event: React.MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState({}, "", "/gaps");
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/** A clicked gap: the hypothesis, the reasons the data gives for it, supporting papers and the honest limits. */
export function HypothesisPanel({ gap, onSelectConcept }: Props) {
  const a = fmtText(gap.a_label), b = fmtText(gap.b_label);
  const [detail, setDetail] = useState<GapDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    setDetail(null);
    api.gap(gap.a, gap.b)
      .then((d) => { if (live) { setDetail(d); setState(d ? "ready" : "none"); } })
      .catch(() => { if (live) setState("none"); });
    return () => { live = false; };
  }, [gap.a, gap.b]);

  const shared = (detail?.shared_neighbours ?? []).slice(0, 8);
  const overlap = typeof gap.neighbour_overlap === "number" ? gap.neighbour_overlap : null;
  const reasons: { head: string; body: string }[] = [
    { head: "Both areas are active", body: `${a} is ${pace(gap.growth_a)}${growthText(gap.growth_a)}; ${b} is ${pace(gap.growth_b)}${growthText(gap.growth_b)}. Growing topics tend to meet.` },
    { head: "Almost nobody has combined them yet", body: `Fewer than 3 papers in the export involve both ${a} and ${b}, so this pairing is still open${overlap !== null ? `; their neighbourhoods overlap by only ${fmtDec(overlap)}` : ""}.` },
    { head: "The model expects the link", body: `Trained on how links formed before 2021, it gives this pair a predicted link score of ${fmtP(gap.p_link)}. That is a ranking signal, not a measured chance.` },
  ];
  if (shared.length) reasons.push({ head: "They already share neighbours", body: `Both connect to ${shared.length === 8 ? "at least " : ""}${shared.length} of the same concepts, which hints at a bridge: ${shared.slice(0, 5).map((c) => fmtText(c.label)).join(", ")}.` });

  return (
    <aside className="whitespace-concept ex__right whitespace-hyp" aria-label="Hypothesis details" aria-live="polite">
      <header>
        <span className="whitespace-concept__area">Hypothesis · predicted gap</span>
        <h2>{a} × {b}</h2>
      </header>

      <section className="whitespace-concept__card whitespace-hyp__claim">
        <h3>The hypothesis</h3>
        <p>Combining <strong>{a}</strong> with <strong>{b}</strong> is a research direction that is likely to appear next. Work that uses one to address the other has not yet been done at scale.</p>
      </section>

      <section className="whitespace-concept__card">
        <h3>Why it should be combined</h3>
        <ol className="whitespace-hyp__reasons">
          {reasons.map((r) => (
            <li key={r.head}><strong>{r.head}</strong><span>{r.body}</span></li>
          ))}
        </ol>
      </section>

      <section className="whitespace-concept__card">
        <h3>Closest papers on each side</h3>
        {state === "loading" && <p className="whitespace-help">Loading supporting papers…</p>}
        {state === "none" && <p className="whitespace-help">Supporting papers are not available for this pair in the export.</p>}
        {state === "ready" && detail && (
          <>
            {([[a, detail.closest_a], [b, detail.closest_b]] as const).map(([name, papers]) => (
              <div key={name} className="whitespace-hyp__side">
                <h4>{name}</h4>
                {papers.length ? (
                  <ul>{papers.slice(0, 3).map((p) => (
                    <li key={p.id}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener">{fmtText(p.title)}</a> : fmtText(p.title)}<span> {p.year ?? ""}</span></li>
                  ))}</ul>
                ) : <p className="whitespace-help">—</p>}
              </div>
            ))}
          </>
        )}
      </section>

      <div className="whitespace-concept__card whitespace-hyp__linked">
        <LinkedProblems gap={gap} attached={detail?.open_problems} loadingGap={state === "loading"} />
      </div>

      <section className="whitespace-concept__card">
        <h3>Explore each side</h3>
        <div className="whitespace-hyp__buttons">
          <button type="button" onClick={() => onSelectConcept(gap.a)}>{a}</button>
          <button type="button" onClick={() => onSelectConcept(gap.b)}>{b}</button>
        </div>
        <p className="whitespace-help">A predicted pairing, not a finding or a validated result. <a href="/gaps" onClick={goToGaps}>Open the Gap finder</a> for the full score breakdown.</p>
      </section>
    </aside>
  );
}
