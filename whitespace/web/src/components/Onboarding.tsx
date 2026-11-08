import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TourStep = {
  route: "/" | "/gaps" | "/open-problems";
  target: string;
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  { route: "/", target: "[data-tour='map-search']", eyebrow: "Research map · 1 of 10", title: "Start with a question", body: "Search a concept or paper name. Selecting a result centres the map on the closest matching research area." },
  { route: "/", target: "[data-tour='map-filters']", eyebrow: "Research map · 2 of 10", title: "Shape the view", body: "Use these filters to keep only the concepts, paper counts and growth direction relevant to your question. Reset restores the complete current snapshot." },
  { route: "/", target: "[data-tour='map-canvas']", eyebrow: "Research map · 3 of 10", title: "Explore the research landscape", body: "Each node is a concept. Drag to orbit around the centre, scroll to zoom, and use Top, Front or Default to reset your camera. Heat map makes recent growth easier to scan." },
  { route: "/", target: "[data-tour='concept-panel']", eyebrow: "Research map · 4 of 10", title: "Inspect one concept", body: "Click any node to read its papers, related concepts and any predicted links the model has scored for it. This panel is the evidence-led detail view for the selected concept." },
  { route: "/gaps", target: "[data-tour='gap-filters']", eyebrow: "Gap finder · 5 of 10", title: "Narrow the candidate links", body: "Set a minimum model probability, choose a ranking signal, or focus the list on a growing concept. These controls only change what you inspect — they do not retrain the model." },
  { route: "/gaps", target: "[data-tour='gap-list']", eyebrow: "Gap finder · 6 of 10", title: "Compare possible connections", body: "Every row is a pair that has not yet reached the established-link threshold. Pick one to see why it ranked, rather than treating the score as a recommendation on its own." },
  { route: "/gaps", target: "[data-tour='gap-detail']", eyebrow: "Gap finder · 7 of 10", title: "Check the underlying evidence", body: "The right panel explains the score and shows nearby papers for the pair, where the export includes them. Use it to decide whether the connection is worth investigating." },
  { route: "/open-problems", target: "[data-tour='open-problem-filters']", eyebrow: "Open problems · 8 of 10", title: "Focus the source statements", body: "Filter by concept or statement type. This keeps the evidence view readable without changing the underlying paper extraction." },
  { route: "/open-problems", target: "[data-tour='open-problem-trend']", eyebrow: "Open problems · 9 of 10", title: "Read the context over time", body: "The trend compares the selected concept’s extracted statement rate with the wider AI/ML scope. Missing values remain missing; they are not counted as zero." },
  { route: "/open-problems", target: "[data-tour='open-problem-list']", eyebrow: "Open problems · 10 of 10", title: "Read author-stated questions at the source", body: "This dedicated page groups future-work, limitation and open-problem statements with the paper they came from. It is evidence to investigate, not proof that a question is still unresolved." },
];

type OnboardingProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: TourStep["route"]) => void;
};

function clearHighlight() {
  document.querySelectorAll<HTMLElement>("[data-tour-highlight='true']").forEach((element) => element.removeAttribute("data-tour-highlight"));
}

const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export function Onboarding({ open, onClose, onNavigate }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [found, setFound] = useState<"searching" | "found" | "missing">("searching");
  const [dock, setDock] = useState<"top" | "bottom">("bottom");
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const originRef = useRef({ path: "/", opener: null as HTMLElement | null });
  const current = STEPS[step];

  useEffect(() => {
    if (!open) return;
    setStep(0);
    originRef.current = { path: window.location.pathname.replace(/\/+$/, "") || "/", opener: document.activeElement as HTMLElement | null };
    const shell = document.querySelector<HTMLElement>(".app-shell");
    shell?.setAttribute("inert", "");
    return () => shell?.removeAttribute("inert");
  }, [open]);
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open, step]);
  useEffect(() => {
    if (!open) { clearHighlight(); return; }
    onNavigate(current.route);
    setFound("searching");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = Date.now();
    const look = () => {
      const target = document.querySelector<HTMLElement>(current.target);
      if (target) {
        clearHighlight();
        target.dataset.tourHighlight = "true";
        target.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
        const box = target.getBoundingClientRect();
        setDock(box.top + box.height / 2 < window.innerHeight / 2 ? "bottom" : "top");
        setFound("found");
        return true;
      }
      if (Date.now() - started > 2000) { clearHighlight(); setFound("missing"); return true; }
      return false;
    };
    if (look()) return;
    const timer = window.setInterval(() => { if (look()) window.clearInterval(timer); }, 100);
    return () => window.clearInterval(timer);
  }, [open, current, onNavigate]);
  useEffect(() => () => clearHighlight(), []);

  if (!open) return null;
  const close = () => {
    clearHighlight();
    try { window.localStorage.setItem("ws-onboarding-seen", "true"); } catch { /* storage unavailable */ }
    onNavigate(originRef.current.path as TourStep["route"]);
    onClose();
    const opener = originRef.current.opener;
    window.setTimeout(() => { if (opener?.isConnected) opener.focus(); }, 0);
  };
  const next = () => step === STEPS.length - 1 ? close() : setStep((value) => value + 1);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.stopPropagation(); close(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === headingRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className={`onboarding-backdrop onboarding-backdrop--${dock}`} role="presentation" onKeyDown={onKeyDown}>
      <section ref={dialogRef} className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-copy">
        <div className="onboarding__topline"><span>{current.eyebrow}</span><span aria-label={`Step ${step + 1} of ${STEPS.length}`}>{step + 1} / {STEPS.length}</span></div>
        <h2 id="onboarding-title" ref={headingRef} tabIndex={-1}>{current.title}</h2>
        <p id="onboarding-copy">{current.body}</p>
        <p className="onboarding__status" role="status">{found === "searching" ? "Loading this panel…" : found === "missing" ? "This panel is not available for the current data." : ""}</p>
        <div className="onboarding__progress" aria-hidden="true">{STEPS.map((item, index) => <i key={item.title} className={index <= step ? "is-current" : undefined} />)}</div>
        <div className="onboarding__actions">
          <button type="button" className="onboarding__skip" onClick={close}>Skip tour</button>
          <div>{step > 0 && <button type="button" className="onboarding__back" onClick={() => setStep((value) => value - 1)}>Back</button>}<button type="button" className="onboarding__next" onClick={next}>{step === STEPS.length - 1 ? "Start exploring" : "Next"}</button></div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
