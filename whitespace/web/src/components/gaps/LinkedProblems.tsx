import { useEffect, useState } from "react";
import { api } from "../../api";
import type { GapSummary, OpenProblem } from "../../api";
import { fmtText, fmtYear } from "../../lib/format";
import { safeExternalUrl } from "./GapDetailPanel";

const TYPE: Record<OpenProblem["type"], string> = { open_problem: "Open problem", limitation: "Limitation", future_work: "Future work" };

/** Sentences linked to this pair: the ones attached to the gap itself, else those tagged with either concept. */
function useLinkedProblems(gap: GapSummary, attached: OpenProblem[] | undefined) {
  const [found, setFound] = useState<OpenProblem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const have = (attached?.length ?? 0) > 0;

  useEffect(() => {
    if (have) { setState("done"); return undefined; }
    let live = true;
    setState("loading");
    setFound([]);
    Promise.all([api.openProblems(gap.a, ""), api.openProblems(gap.b, "")])
      .then(([x, y]) => {
        if (!live) return;
        const seen = new Set<string>();
        const merged = [...x.items, ...y.items].filter((o) => (seen.has(o.sentence) ? false : (seen.add(o.sentence), true)));
        setFound(merged.slice(0, 5));
        setState("done");
      })
      .catch(() => { if (live) setState("done"); });
    return () => { live = false; };
  }, [gap.a, gap.b, have]);

  return { items: have ? (attached as OpenProblem[]) : found, loading: state === "loading" };
}

/** Linked author-stated open problems for a gap, always visible, each quoted and linked to its paper. */
export function LinkedProblems({ gap, attached, loadingGap = false }: { gap: GapSummary; attached?: OpenProblem[]; loadingGap?: boolean }) {
  const { items, loading } = useLinkedProblems(gap, attached);
  const shown = items.slice(0, 5);
  return (
    <section className="gx-sec gx-sec--tight gx-linked" aria-labelledby="gx-linked-h">
      <h3 id="gx-linked-h" className="gx-h3">Linked open problems <span className="gx-tag">quoted from abstracts</span></h3>
      {(loading || loadingGap) && shown.length === 0 && <p className="gx-note" role="status">Looking for linked statements…</p>}
      {shown.length > 0 && (
        <ul className="gx-problems__list">
          {shown.map((o, i) => {
            const href = safeExternalUrl(o.paper?.url);
            return (
              <li key={`${o.paper?.id ?? i}-${i}`}>
                <span className="gx-problems__t">{TYPE[o.type] ?? o.type}</span>
                <span className="gx-problems__s">{fmtText(o.sentence)}</span>
                <span className="gx-problems__m">{href ? <a href={href} target="_blank" rel="noreferrer noopener">{fmtText(o.paper?.title)}</a> : fmtText(o.paper?.title)} · {fmtYear(o.paper?.year)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && !loadingGap && shown.length === 0 && <p className="gx-note">No author-stated open problems are linked to either concept in this export.</p>}
      {shown.length > 0 && <p className="gx-note">Statements were picked by a pattern match and are not hand-checked; read each as a lead to follow up, not a finding.</p>}
    </section>
  );
}
