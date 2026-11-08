import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "./gaps.css";
function display(value, format) {
    if (value == null || !Number.isFinite(value))
        return "Not available";
    return format === "probability" ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
}
export function ScoreBreakdown({ gap }) {
    const metrics = [
        { key: "p-link", label: "P(link) within three years", value: gap.p_link, format: "probability", note: "Model probability returned for this pair." },
        { key: "growth-a", label: "Growth: first concept", value: gap.growth_a },
        { key: "growth-b", label: "Growth: second concept", value: gap.growth_b },
        { key: "cosine", label: "Cosine similarity", value: gap.cosine },
        { key: "neighbour-overlap", label: "Neighbour overlap", value: gap.neighbour_overlap },
        { key: "gap-rate-a", label: "Stated-gap rate: first concept", value: gap.gap_rate_a, format: "probability" },
        { key: "gap-rate-b", label: "Stated-gap rate: second concept", value: gap.gap_rate_b, format: "probability" },
        { key: "momentum", label: "Momentum", value: gap.momentum },
        { key: "novelty", label: "Novelty", value: gap.novelty },
        { key: "gap-rate", label: "Stated-gap rate", value: gap.gap_rate, format: "probability" },
        { key: "gap-score", label: "Gap score", value: gap.gap_score, note: "Combined ranking score. It is not a probability." },
    ];
    const intervalValidation = gap.interval_validation;
    const hasValidatedInterval = intervalValidation?.validated === true
        && Boolean(intervalValidation.interpretation?.trim())
        && intervalValidation.coverage != null
        && Number.isFinite(intervalValidation.coverage)
        && gap.p_lo != null
        && gap.p_hi != null
        && Number.isFinite(gap.p_lo)
        && Number.isFinite(gap.p_hi)
        && gap.p_lo <= gap.p_hi;
    return (_jsxs("section", { className: "gap-score", "aria-labelledby": "gap-score-title", children: [_jsx("h3", { id: "gap-score-title", children: "Score breakdown" }), _jsxs("p", { className: "gap-score__formula", children: ["Proposed PRD formula: ", _jsx("code", { children: "gap_score = P(link) \u00D7 sigmoid(growth_a + growth_b) \u00D7 (1 \u2212 max(cosine, neighbour_overlap)) \u00D7 (1 + gap_rate_a + gap_rate_b)" }), ". The formula's inputs below are shown as returned; missing inputs are not inferred."] }), _jsxs("dl", { className: "gap-score__list", children: [!hasValidatedInterval && (_jsxs("div", { className: "gap-score__row", children: [_jsx("dt", { children: "Model interval" }), _jsx("dd", { children: "Not shown" }), _jsx("p", { className: "gap-score__note", children: "The interval's interpretation and coverage have not both been validated." })] })), hasValidatedInterval && (_jsxs("div", { className: "gap-score__row", children: [_jsx("dt", { children: "Validated model interval" }), _jsxs("dd", { children: [display(gap.p_lo, "probability"), "\u2013", display(gap.p_hi, "probability")] }), _jsxs("p", { className: "gap-score__note", children: [intervalValidation.interpretation, ". Reported coverage: ", intervalValidation.coverage, "."] })] })), metrics.map((metric) => (_jsxs("div", { className: "gap-score__row", children: [_jsx("dt", { children: metric.label }), _jsx("dd", { children: display(metric.value, metric.format) }), metric.note && _jsx("p", { className: "gap-score__note", children: metric.note })] }, metric.key)))] })] }));
}
