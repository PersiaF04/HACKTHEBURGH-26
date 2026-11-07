import { useEffect, useRef, useState } from "react";

const KEY = "tus.dashboard.coach.v1";
export const COACH_STEPS = [
  { target: "map", title: "Orange means told to stop", body: "Each turbine is a wind farm. NESO accepted a bid for the orange ones to turn down at this moment." },
  { target: "timeline", title: "This is the day", body: "Drag along it to move through the half-hours. The map follows." },
  { target: "try", title: "Your turn: move this slider", body: "It sets your bid. Can you beat the Copilot?" },
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
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { btn.current?.focus({ preventScroll: true }); box.current?.scrollIntoView({ block: "nearest" }); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const last = step === COACH_STEPS.length - 1;
  return (
    <div ref={box} className={`coach coach-${s.target}`} role="dialog" aria-modal="false" aria-labelledby="coach-title" aria-describedby="coach-body">
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
