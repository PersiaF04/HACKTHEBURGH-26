import { useEffect, useState } from "react";
import { api } from "../api";
import type { OpenProblem } from "../api";
import { fmtText, fmtYear } from "../lib/format";

const TYPE_LABEL: Record<string, string> = { open_problem: "Open problem", limitation: "Limitation", future_work: "Future work" };

const safeUrl = (url: string | undefined | null) => (url && /^https?:\/\//i.test(url) ? url : null);

const goToOpenProblems = (event: React.MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState({}, "", "/open-problems");
  window.dispatchEvent(new PopStateEvent("popstate"));
};

type Props = { conceptId: string; label: string; attached?: OpenProblem[] };

/** Author-stated open problems linked to the selected concept, quoted and linked to their papers. Sits below the papers. */
export function ConceptProblems({ conceptId, label, attached }: Props) {
  const [found, setFound] = useState<OpenProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const have = (attached?.length ?? 0) > 0;

  useEffect(() => {
    if (have) return undefined;
    let live = true;
    setLoading(true);
    setFound([]);
    api.openProblems(conceptId, "")
      .then((r) => { if (live) setFound(r.items.slice(0, 4)); })
      .catch(() => undefined)
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [conceptId, have]);

  const items = (have ? (attached as OpenProblem[]) : found).slice(0, 4);

  return (
    <section aria-labelledby="wc-probs">
      <div className="whitespace-concept__head">
        <h3 id="wc-probs">Linked open problems</h3>
        <a href="/open-problems" onClick={goToOpenProblems}>All {"→"}</a>
      </div>
      {loading && items.length === 0 && <p className="whitespace-help" role="status">Looking for statements about {fmtText(label)}…</p>}
      {items.map((op, i) => {
        const href = safeUrl(op.paper?.url);
        return (
          <blockquote key={`${op.paper?.id ?? "p"}-${i}`} className="whitespace-concept__problem">
            <span className="whitespace-concept__tag">{fmtText(TYPE_LABEL[op.type] ?? op.type)}</span>
            <span>{fmtText(op.sentence)}</span>
            <span className="whitespace-concept__src">
              {href ? <a href={href} target="_blank" rel="noreferrer noopener">{fmtText(op.paper?.title)}</a> : fmtText(op.paper?.title)} · {fmtYear(op.paper?.year)}
            </span>
          </blockquote>
        );
      })}
      {!loading && items.length === 0 && <p className="whitespace-help">No author-stated open problems are linked to {fmtText(label)} in this export.</p>}
      {items.length > 0 && <p className="whitespace-help">Picked by a pattern match on abstracts, not hand-checked. Read each as a lead, not a finding.</p>}
    </section>
  );
}
