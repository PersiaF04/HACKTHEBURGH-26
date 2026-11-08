import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

type TimeSliderProps = {
  year: number;
  minYear: number;
  maxYear: number;
  onChange: (year: number) => void;
  /** Optional: show a busy hint while the parent loads the new snapshot. */
  loading?: boolean;
};

export function TimeSlider({ year, minYear, maxYear, onChange, loading = false }: TimeSliderProps) {
  // Local value keeps the thumb and label instant; the parent is notified at most once per frame.
  const [local, setLocal] = useState(year);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);

  useEffect(() => setLocal(year), [year]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const commit = (next: number) => {
    setLocal(next);
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current !== null) onChange(pending.current);
      pending.current = null;
    });
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => commit(Number(event.currentTarget.value));
  const step = (delta: number) => commit(Math.max(minYear, Math.min(maxYear, local + delta)));
  const span = Math.max(1, maxYear - minYear);
  const fill = ((local - minYear) / span) * 100;

  return (
    <div className="whitespace-time-slider" aria-busy={loading}>
      <div className="whitespace-time-slider__head">
        <span className="whitespace-time-slider__selected">Snapshot origin: {local}</span>
        <span className="whitespace-time-slider__status" role="status" aria-live="polite">
          {loading ? "Loading snapshot…" : ""}
        </span>
      </div>
      <div className="whitespace-time-slider__row">
        <button type="button" onClick={() => step(-1)} disabled={local <= minYear} aria-label="Previous year">‹</button>
        <div className="whitespace-time-slider__track">
          <label className="whitespace-visually-hidden" htmlFor="whitespace-year-slider">
            Choose snapshot origin year
          </label>
          <input
            id="whitespace-year-slider"
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={local}
            onChange={handleChange}
            aria-valuetext={`Snapshot origin ${local}`}
            className="whitespace-time-slider__input"
            style={{ background: `linear-gradient(to right, var(--ws-ink) ${fill}%, var(--ws-track) ${fill}%)` }}
          />
          <div className="whitespace-time-slider__labels" aria-hidden="true">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>
        <button type="button" onClick={() => step(1)} disabled={local >= maxYear} aria-label="Next year">›</button>
      </div>
      <p className="whitespace-time-slider__help">
        Earlier years use information available by the end of that year.
      </p>
    </div>
  );
}
