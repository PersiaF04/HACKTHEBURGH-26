import { useEffect, useState } from "react";

type TourStep = {
  route: "/" | "/gaps" | "/open-problems";
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    route: "/",
    eyebrow: "Start here",
    title: "Find a direction worth exploring",
    body: "Search a concept or paper, then use the topic, paper-count, and growth filters to focus the research map.",
  },
  {
    route: "/",
    eyebrow: "Read the map",
    title: "Every node is a research concept",
    body: "Size shows papers, colour shows three-year growth, and height shows growth in 3D. Drag to orbit, scroll to zoom, and click a node for its papers, gaps, and author-stated questions.",
  },
  {
    route: "/gaps",
    eyebrow: "Compare possibilities",
    title: "Gap Finder ranks possible new links",
    body: "Use it to inspect concepts that are not yet established together. Each result shows the model score, uncertainty, evidence, and any stated research gap.",
  },
  {
    route: "/open-problems",
    eyebrow: "Read the source",
    title: "Open problems stay tied to papers",
    body: "Browse limitation, future-work, and open-problem statements. They are evidence to investigate, not claims that Whitespace has solved the question.",
  },
];

type OnboardingProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: TourStep["route"]) => void;
};

export function Onboarding({ open, onClose, onNavigate }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  useEffect(() => {
    if (open) onNavigate(STEPS[step].route);
  }, [open, step, onNavigate]);

  if (!open) return null;
  const close = () => {
    try { window.localStorage.setItem("ws-onboarding-seen", "true"); } catch { /* storage unavailable */ }
    onClose();
  };
  const next = () => {
    if (step === STEPS.length - 1) { close(); return; }
    setStep((value) => value + 1);
  };

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-copy">
        <div className="onboarding__topline">
          <span>{current.eyebrow}</span>
          <span aria-label={`Step ${step + 1} of ${STEPS.length}`}>{step + 1} / {STEPS.length}</span>
        </div>
        <h2 id="onboarding-title">{current.title}</h2>
        <p id="onboarding-copy">{current.body}</p>
        <div className="onboarding__progress" aria-hidden="true">
          {STEPS.map((item, index) => <i key={item.title} className={index <= step ? "is-current" : undefined} />)}
        </div>
        <div className="onboarding__actions">
          <button type="button" className="onboarding__skip" onClick={close}>Skip tour</button>
          <div>
            {step > 0 && <button type="button" className="onboarding__back" onClick={() => setStep((value) => value - 1)}>Back</button>}
            <button type="button" className="onboarding__next" onClick={next}>{step === STEPS.length - 1 ? "Start exploring" : "Next"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
