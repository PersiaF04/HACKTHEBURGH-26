import type { ChangeEvent } from "react";

type TimeSliderProps = {
  year: number;
  minYear: number;
  maxYear: number;
  onChange: (year: number) => void;
};

export function TimeSlider({ year, minYear, maxYear, onChange }: TimeSliderProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.currentTarget.value));
  };

  return (
    <div className="whitespace-time-slider">
      <div className="whitespace-time-slider__labels" aria-hidden="true">
        <span>{minYear}</span>
        <span className="whitespace-time-slider__selected">Snapshot origin: {year}</span>
        <span>{maxYear}</span>
      </div>
      <label className="whitespace-visually-hidden" htmlFor="whitespace-year-slider">
        Choose snapshot origin year
      </label>
      <input
        id="whitespace-year-slider"
        type="range"
        min={minYear}
        max={maxYear}
        step={1}
        value={year}
        onChange={handleChange}
        aria-valuetext={`Snapshot origin ${year}`}
        className="whitespace-time-slider__input"
      />
      <p className="whitespace-time-slider__help">
        Earlier years use information available by the end of that year.
      </p>
    </div>
  );
}
