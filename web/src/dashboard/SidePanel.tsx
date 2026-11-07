import { useEffect, useRef, type ReactNode } from "react";

export const PANELS = [
  { id: "why", label: "Why it matters" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "whatif", label: "What if" },
  { id: "proof", label: "Proof" },
] as const;
export type PanelId = (typeof PANELS)[number]["id"];

// One panel at a time, and non-modal: the map stays visible and live beside it, so changes can be seen as they are made.
export function SidePanel({ id, onClose, children }: { id: PanelId; onClose: () => void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  const title = PANELS.find((p) => p.id === id)?.label;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside id="dash-panel" className="dash-panel" role="dialog" aria-modal="false" aria-label={title}>
      <header className="dash-panel-head">
        <h2>{title}</h2>
        <button type="button" ref={close} onClick={onClose}>Close</button>
      </header>
      <div className="dash-panel-body">{children}</div>
    </aside>
  );
}
