import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { GapDetail, GapPaper, GapSummary } from "../../api";
import { ScoreBreakdown } from "./ScoreBreakdown";
import "./gaps.css";
import "./gaps-drawer.css";

export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const problemTypeLabels: Record<string, string> = {
  future_work: "Future work",
  limitation: "Limitation",
  open_problem: "Open problem",
};

export interface GapDrawerProps {
  detail?: GapDetail | null;
  open: boolean;
  loading?: boolean;
  error?: string | null;
  placeholder?: boolean;
  onClose: () => void;
}

function linkStatement(summary: GapSummary): string {
  const w = summary.starting_weight;
  const shared = w == null ? "Not yet linked: fewer than 3 shared papers." : `Not yet linked: ${w} shared ${w === 1 ? "paper" : "papers"}, fewer than 3.`;
  const p = summary.p_link;
  if (p == null || !Number.isFinite(p)) return `${shared} P(link) not available.`;
  return `${shared} P(link) is ${(p * 100).toFixed(1)}%, the model chance that they reach 3 or more shared papers within three years.`;
}

function PaperList({ id, title, papers }: { id: string; title: string; papers: GapPaper[] }) {
  return (
    <section className="gap-drawer__section" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>{title}</h3>
      {papers.length === 0 ? <p>Not available: no papers returned for this side.</p> : (
        <ul className="gap-paper-list">
          {papers.map((paper) => (
            <li key={paper.id}>
              {safeExternalUrl(paper.url) ? <a href={safeExternalUrl(paper.url) ?? undefined} target="_blank" rel="noreferrer">{paper.title}</a> : <span>{paper.title}</span>}
              {paper.year != null && <span className="gap-paper-year"> · {paper.year}</span>}
              {paper.abstract_excerpt && <p>{paper.abstract_excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GapDrawer({ detail, open, loading = false, error, placeholder = false, onClose }: GapDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => priorFocus.current?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const title = detail ? `${detail.summary.a_label} and ${detail.summary.b_label}` : "Gap details";

  return (
    <div className="gap-drawer-backdrop">
      <div
        className="gap-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gap-drawer-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="gap-drawer__header">
          <div>
            <p className="gap-eyebrow">Candidate link</p>
            <h2 id="gap-drawer-title">{detail ? <>{detail.summary.a_label} <span className="gap-drawer__arrow" aria-hidden="true">↔</span><span className="gap-sr-only"> and </span> {detail.summary.b_label}</> : title}</h2>
            {detail && <p className="gap-drawer__link-statement">{linkStatement(detail.summary)}</p>}
          </div>
          <button ref={closeRef} className="gap-drawer__close" type="button" onClick={onClose} aria-label="Close gap details">Close</button>
        </header>

        {placeholder && <p className="gap-placeholder" role="note">Placeholder data — these values are examples, not measured results.</p>}
        {loading && <p role="status">Loading gap evidence…</p>}
        {error && <p className="gap-state--error" role="alert">Could not load gap details: {error}</p>}
        {!loading && !error && !detail && <p>No detail is available for this pair.</p>}
        {detail && !loading && !error && (
          <div className="gap-drawer__content">
            <ScoreBreakdown gap={detail.summary} />
            <div className="gap-drawer__papers">
              <PaperList id="closest-a" title={`Closest papers: ${detail.summary.a_label}`} papers={detail.closest_a} />
              <PaperList id="closest-b" title={`Closest papers: ${detail.summary.b_label}`} papers={detail.closest_b} />
            </div>
            <section className="gap-drawer__section" aria-labelledby="shared-neighbours-heading">
              <h3 id="shared-neighbours-heading">Shared neighbouring concepts</h3>
              {detail.shared_neighbours.length === 0 ? <p>Not available: no shared neighbouring concepts returned.</p> : (
                <ul className="gap-neighbours">
                  {detail.shared_neighbours.map((concept) => <li key={concept.id}>{concept.label}</li>)}
                </ul>
              )}
            </section>
            <section className="gap-drawer__section" aria-labelledby="stated-problems-heading">
              <h3 id="stated-problems-heading">Authors’ stated open problems</h3>
              {detail.open_problems.length === 0 ? <p>Not available: no linked open-problem statements returned.</p> : (
                <ul className="gap-problem-list">
                  {detail.open_problems.map((problem) => (
                    <li key={`${problem.paper.id}-${problem.sentence}`}>
                      <blockquote>{problem.sentence}</blockquote>
                      <p>
                        {problemTypeLabels[problem.type]}{problem.confidence != null ? ` · classifier confidence ${(problem.confidence * 100).toFixed(0)}%` : ""}
                        {" · "}
                        {safeExternalUrl(problem.paper.url) ? <a href={safeExternalUrl(problem.paper.url) ?? undefined} target="_blank" rel="noreferrer">Source: {problem.paper.title}</a> : `Source: ${problem.paper.title}`}
                        {problem.paper.year != null ? ` (${problem.paper.year})` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
