import type { CSSProperties, ReactNode } from "react";
import "./skeleton.css";

/** Neutral grey placeholders for loading, error and empty states. Never carries invented content. */
export function SkeletonBlock({ width, height = 16, className = "", label }: { width?: number | string; height?: number | string; className?: string; label?: string }) {
  const style: CSSProperties = { width, height };
  return <span className={`ws-skel ${className}`.trim()} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`ws-skel-text ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <SkeletonBlock key={index} height={10} width={index === lines - 1 && lines > 1 ? "62%" : "100%"} />)}
    </div>
  );
}

/** One consistent line explaining why a region is empty. */
export function EmptyNote({ children, role = "status" }: { children: ReactNode; role?: "status" | "alert" }) {
  return <p className="ws-empty-note" role={role}>{children}</p>;
}
