import type { GapSummary } from "../api";
import { fmtCompact, fmtGrowth, fmtInt, fmtText } from "../lib/format";
import type { BranchInfo } from "../lib/hierarchy";
import { HypothesisPanel } from "./HypothesisPanel";

type Props = {
  branch?: BranchInfo;
  hypothesis?: GapSummary;
  onSelectConcept: (id: string) => void;
};

/** Growth is a log ratio in the export; fmtGrowth converts it to a percentage that cannot fall below -100%. */
const sane = (g: number | null | undefined): g is number => typeof g === "number" && Number.isFinite(g);
const trend = (g: number | null | undefined) =>
  !sane(g) ? "trend unavailable" : g >= 0.45 ? "growing fast" : g >= 0.15 ? "growing" : g >= -0.05 ? "steady" : "shrinking";


/** Detail for a clicked branch hub or hypothesis node on the graph. Branches are derived in the app. */
export function BranchPanel({ branch, hypothesis, onSelectConcept }: Props) {
  if (hypothesis) return <HypothesisPanel gap={hypothesis} onSelectConcept={onSelectConcept} />;
  if (!branch) return null;
  const top = [...branch.shown].sort((x, y) => (y.paper_count ?? 0) - (x.paper_count ?? 0));
  const names = top.slice(0, 3).map((c) => fmtText(c.label));
  const rising = [...branch.shown].filter((c) => sane(c.growth)).sort((x, y) => (y.growth as number) - (x.growth as number)).slice(0, 2).map((c) => fmtText(c.label));
  return (
    <aside className="whitespace-concept ex__right" aria-label="Branch details" aria-live="polite">
      <header>
        <span className="whitespace-concept__area">Branch</span>
        <h2>{fmtText(branch.label)}</h2>
        <span className="whitespace-concept__first">A cluster derived in the app from the map layout</span>
      </header>
      <dl className="whitespace-concept__stats">
        <div><dt>Concepts</dt><dd>{fmtInt(branch.total)}</dd></div>
        <div title={`${fmtInt(branch.papers)} papers`}><dt>Papers</dt><dd>{fmtCompact(branch.papers)}</dd></div>
        <div><dt>3-yr growth</dt><dd>{sane(branch.growth) ? fmtGrowth(branch.growth) : "—"}</dd></div>
      </dl>
      <section className="whitespace-concept__card">
        <h3>About this area</h3>
        <p>
          A group of {fmtInt(branch.total)} related concepts that appear together in {fmtInt(branch.papers)} papers, centred on the words &ldquo;{fmtText(branch.label)}&rdquo;.
          {names.length > 0 && <> Its largest sub-areas are {names.join(", ")}.</>}
          {" "}Overall it is {trend(branch.growth)}{sane(branch.growth) ? ` (${fmtGrowth(branch.growth)} over three years)` : ""}
          {rising.length > 0 && <>; the fastest-rising sub-areas are {rising.join(" and ")}</>}.
        </p>
        <p className="whitespace-help">Summary written from the export&rsquo;s counts, not by a language model.</p>
      </section>
      <section className="whitespace-concept__card whitespace-subareas">
        <h3>Sub-areas</h3>
        <ul className="whitespace-subareas__list">
          {top.slice(0, 12).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onSelectConcept(c.id)} title={fmtText(c.label)}>
                <span className="whitespace-subareas__name">{fmtText(c.label)}</span>
                <span className="whitespace-subareas__meta">{fmtCompact(c.paper_count)} papers · {trend(c.growth)}</span>
              </button>
            </li>
          ))}
        </ul>
        {branch.total > 12 && <p className="whitespace-help">Showing the 12 largest of {fmtInt(branch.total)} sub-areas.</p>}
      </section>
    </aside>
  );
}
