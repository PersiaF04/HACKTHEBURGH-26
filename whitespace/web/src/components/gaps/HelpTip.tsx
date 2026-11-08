import { useEffect, useId, useRef, useState } from "react";

export interface HelpTipProps {
  /** Short name of the thing being explained, used for the button's accessible name. */
  label: string;
  /** Plain-words explanation. */
  text: string;
  /** Anchor the popover to the right edge (for right-hand columns). */
  align?: "left" | "right";
}

/** A small (?) button that explains a term. Opens on hover, focus or click; Escape closes it. */
export function HelpTip({ label, text, align = "left" }: HelpTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <span ref={ref} className={`gx-tip${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="gx-tip__btn"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-describedby={id}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >?</button>
      <span id={id} role="tooltip" className={`gx-tip__pop gx-tip__pop--${align}`}>{text}</span>
    </span>
  );
}
