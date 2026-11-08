import type { GapSummary } from "../api";
import { fmtGrowth, fmtInt, fmtP, fmtText } from "../lib/format";
import type { BranchInfo } from "../lib/hierarchy";

type Props = {
  branch?: BranchInfo;
  hypothesis?: GapSummary;
  onSelectConcept: (id: string) => void;
  onSelectNode: (id: string) => void;
  onClose: () => void;
};

const goToGaps = (event: React.MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState({}, "", "/gaps");
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/** Detail for a clicked branch hub or hypothesis node on the graph. Branches are derived in the app. */
export function BranchPanel({ branch, hypothesis, onSelectConcept, onSelectNode, onClose }: Props) {
  if (hypothesis) {
    return (
      <aside className="whitespace-concept ex__right" aria-label="Hypothesis details" aria-live="polite">
        <header>
          <span className="whitespace-concept__area">Hypothesis</span>
          <h2>{fmtText(hypothesis.a_label)} × {fmtText(hypothesis.b_label)}</h2>
          <span className="whitespace-concept__first">One of the top ranked gaps</span>
        </header>
        <dl className="whitespace-concept__stats">
          <div><dt>P(link)</dt><dd>{fmtP(hypothesis.p_link)}</dd></div>
        </dl>
        <section className="whitespace-concept__card">
          <h3>Concepts joined</h3>
          <ul className="whitespace-concept__list">
            {[[hypothesis.a, hypothesis.a_label], [hypothesis.b, hypothesis.b_label]].map(([id, label]) => (
              <li key={id}><button type="button" onClick={() => onSelectConcept(id)}>{fmtText(label)}</button></li>
            ))}
          </ul>
          <p className="whitespace-help">A predicted link, not a finding. <a href="/gaps" onClick={goToGaps}>Open the Gap finder</a> for the score breakdown.</p>
        </section>
        <button type="button" className="ws-link-button" onClick={onClose}>Clear selection</button>
      </aside>
    );
  }
  if (!branch) return null;
  const top = [...branch.shown].sort((x, y) => (y.paper_count ?? 0) - (x.paper_count ?? 0));
  const hyps = [...branch.hypotheses].sort((x, y) => y.p_link - x.p_link).slice(0, 6);
  return (
    <aside className="whitespace-concept ex__right" aria-label="Branch details" aria-live="polite">
      <header>
        <span className="whitespace-concept__area">Branch</span>
        <h2>{fmtText(branch.label)}</h2>
        <span className="whitespace-concept__first">A cluster found in the map layout, named by its largest concept. Not exported by the pipeline.</span>
      </header>
      <dl className="whitespace-concept__stats">
        <div><dt>Concepts</dt><dd>{fmtInt(branch.total)}</dd></div>
        <div><dt>Papers</dt><dd>{fmtInt(branch.papers)}</dd></div>
        <div><dt>3-yr growth</dt><dd>{fmtGrowth(branch.growth)}</dd></div>
      </dl>
      <section className="whitespace-concept__card">
        <h3>Sub-topics</h3>
        <ul className="whitespace-concept__list">
          {top.slice(0, 12).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onSelectConcept(c.id)}>{fmtText(c.label)}</button>
              <span className="whitespace-mono"> {fmtInt(c.paper_count)} papers · {fmtGrowth(c.growth)}</span>
            </li>
          ))}
        </ul>
        {branch.total > 12 && <p className="whitespace-help">Showing the 12 largest of {fmtInt(branch.total)} concepts in this branch.</p>}
      </section>
      <section className="whitespace-concept__card">
        <h3>Hypotheses in this branch</h3>
        {hyps.length ? (
          <ul className="whitespace-concept__list">
            {hyps.map((g) => (
              <li key={`${g.a}|${g.b}`}>
                <button type="button" onClick={() => onSelectNode(`hyp:${g.a}|${g.b}`)}>{fmtText(g.a_label)} × {fmtText(g.b_label)}</button>
                <span className="whitespace-mono"> P {fmtP(g.p_link)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="whitespace-help">None of the top ranked gaps touch this branch.</p>}
      </section>
      <button type="button" className="ws-link-button" onClick={onClose}>Clear selection</button>
    </aside>
  );
}
