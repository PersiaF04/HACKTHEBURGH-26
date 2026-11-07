import { useEffect, useRef, useState } from "react";

const KEY = "tus.dashboard.coach.v1";
export const COACH_STEPS = [
  { target: "map", title: "Each turbine is a wind farm", body: "Bigger turbines are bigger farms. Orange with a ring and a stopped rotor means NESO accepted a bid for it to turn down at this moment." },
  { target: "timeline", title: "Scrub through the day", body: "Drag the playhead, or focus it and use the arrow keys. Blue bands are half-hours when NESO asked for extra demand." },
  { target: "copilot", title: "What a flexible load should do", body: "The Copilot turns the forecast into a plan: when to be ready and what to bid. Try beating it with your own load on the right." },
] as const;
export type CoachTarget = (typeof COACH_STEPS)[number]["target"];

const seen = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return false; } };
const remember = () => { try { localStorage.setItem(KEY, "done"); } catch { /* private mode: show again next time */ } };

export function useCoach() {
  const [step, setStep] = useState<number>(() => (seen() ? -1 : 0));
  const close = () => { remember(); setStep(-1); };
  const next = () => (step + 1 < COACH_STEPS.length ? setStep(step + 1) : close());
  return { step, target: step >= 0 ? COACH_STEPS[step].target : null, next, close };
}

export function CoachMark({ step, onNext, onClose }: { step: number; onNext: () => void; onClose: () => void }) {
  const s = COACH_STEPS[step];
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const last = step === COACH_STEPS.length - 1;
  return (
    <div className={`coach coach-${s.target}`} role="dialog" aria-modal="false" aria-labelledby="coach-title" aria-describedby="coach-body">
      <p className="coach-step">{step + 1} of {COACH_STEPS.length}</p>
      <h2 id="coach-title" className="coach-title">{s.title}</h2>
      <p id="coach-body" className="coach-body">{s.body}</p>
      <div className="coach-actions">
        {!last && <button type="button" className="coach-skip" onClick={onClose}>Skip tour</button>}
        <button type="button" ref={btn} className="coach-next" onClick={onNext}>{last ? "Got it" : "Next"}</button>
      </div>
    </div>
  );
}
