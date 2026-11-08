import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function TimeSlider({ year, minYear, maxYear, onChange }) {
    const handleChange = (event) => {
        onChange(Number(event.currentTarget.value));
    };
    return (_jsxs("div", { className: "whitespace-time-slider", children: [_jsxs("div", { className: "whitespace-time-slider__labels", "aria-hidden": "true", children: [_jsx("span", { children: minYear }), _jsxs("span", { className: "whitespace-time-slider__selected", children: ["Snapshot origin: ", year] }), _jsx("span", { children: maxYear })] }), _jsx("label", { className: "whitespace-visually-hidden", htmlFor: "whitespace-year-slider", children: "Choose snapshot origin year" }), _jsx("input", { id: "whitespace-year-slider", type: "range", min: minYear, max: maxYear, step: 1, value: year, onChange: handleChange, "aria-valuetext": `Snapshot origin ${year}`, className: "whitespace-time-slider__input" }), _jsx("p", { className: "whitespace-time-slider__help", children: "Earlier years use information available by the end of that year." })] }));
}
