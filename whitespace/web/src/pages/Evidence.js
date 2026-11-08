import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "./evidence.css";
export default function EvidencePage({ response, status, errorMessage }) {
    const placeholder = response?.placeholder === true;
    const aggregate = response ? response.by_starting_weight?.all ?? {
        base_rate: response.base_rate,
        roc_auc: response.roc_auc,
        pr_auc: response.pr_auc,
        average_precision: response.average_precision,
        precision_at_100: response.precision_at_100,
        baselines: response.baselines,
    } : null;
    const strata = [
        { key: "all", label: "All eligible pairs", metrics: aggregate },
        { key: "0", label: "Pairs with 0 shared papers at origin", metrics: response?.by_starting_weight?.["0"] ?? null },
        { key: "1", label: "Pairs with 1 shared paper at origin", metrics: response?.by_starting_weight?.["1"] ?? null },
        { key: "2", label: "Pairs with 2 shared papers at origin", metrics: response?.by_starting_weight?.["2"] ?? null },
    ];
    const bins = response?.calibration.bins ?? [];
    const hits = response?.hits ?? [];
    const misses = response?.misses ?? [];
    const codeLink = response?.code_link_evaluation;
    return (_jsxs("section", { className: "evidence-page", "aria-label": "Evidence", children: [_jsx("header", { className: "evidence-header", children: _jsx("p", { children: "See what was measured, which baselines were compared, and where evidence is still missing." }) }), placeholder && (_jsx("p", { className: "evidence-notice", role: "status", children: "Placeholder data - evaluation artifacts have not been loaded. No forecast performance is claimed." })), status === "loading" && _jsx("p", { role: "status", children: "Loading evaluation evidence..." }), status === "error" && _jsx("p", { className: "evidence-error", role: "alert", children: errorMessage || "Evidence could not be loaded." }), _jsxs("section", { "aria-labelledby": "ranking-title", className: "evidence-section", children: [_jsx("h2", { id: "ranking-title", children: "Ranking quality" }), _jsx("p", { className: "evidence-muted", children: "Metrics are reported for the full eligible pair set and separately by starting pair weight. Each ranking value is shown beside its own base rate." }), _jsx("div", { className: "evidence-strata", children: strata.map((stratum) => _jsx(RankingTable, { label: stratum.label, metrics: stratum.metrics }, stratum.key)) })] }), _jsxs("section", { "aria-labelledby": "calibration-title", className: "evidence-section", children: [_jsx("h2", { id: "calibration-title", children: "Calibration" }), bins.length ? _jsx(CalibrationPlot, { bins: bins }) : (_jsxs("div", { className: "evidence-empty", children: [_jsx("strong", { children: "Not yet measured" }), _jsx("p", { children: "A calibration plot appears only when predicted probabilities and observed outcomes are present in the evaluation artifact." })] })), _jsxs("details", { children: [_jsx("summary", { children: "Calibration data table" }), bins.length ? _jsx(CalibrationTable, { bins: bins }) : _jsx("p", { className: "evidence-muted", children: "No calibration bins are available yet." })] })] }), _jsxs("section", { className: "evidence-section evidence-tables", "aria-label": "Evaluation examples", children: [_jsx(EvidenceTable, { title: "Top hits", rows: hits, empty: "No measured hits are available yet.", error: status === "error" }), _jsx(EvidenceTable, { title: "Misses", rows: misses, empty: "No measured misses are available yet.", error: status === "error" })] }), _jsxs("section", { className: "evidence-section", children: [_jsx("h2", { children: "Paper-to-code matching" }), _jsxs("p", { children: ["Code-link precision: ", _jsx("strong", { children: formatMetric(codeLink?.precision) })] }), _jsxs("p", { children: ["Binomial precision interval: ", _jsx("strong", { children: codeLink?.interval_method === "binomial" ? `${formatMetric(codeLink.lower)} to ${formatMetric(codeLink.upper)}` : "Not yet measured" })] }), _jsxs("p", { children: ["Hand-checked sample size: ", _jsx("strong", { children: formatMetric(codeLink?.sample_size) })] }), _jsxs("p", { children: ["Correct matches: ", _jsx("strong", { children: formatMetric(codeLink?.correct_matches) })] }), _jsxs("p", { children: ["Sampling protocol: ", _jsx("strong", { children: codeLink?.protocol || "Not yet available" })] }), _jsxs("div", { children: [_jsx("strong", { children: "Sample composition" }), codeLink?.sample_composition && Object.keys(codeLink.sample_composition).length > 0
                                ? _jsx("ul", { children: Object.entries(codeLink.sample_composition).map(([kind, count]) => _jsxs("li", { children: [kind, ": ", count] }, kind)) })
                                : _jsx("p", { children: "Not yet available." })] }), _jsx("p", { className: "evidence-muted", children: "Coverage is a lower bound from an incomplete historical archive. \"No linked code in this archive\" does not mean no implementation exists." })] })] }));
}
function CalibrationPlot({ bins }) {
    const points = bins.map((bin) => `${12 + Math.max(0, Math.min(1, bin.predicted)) * 176},${188 - Math.max(0, Math.min(1, bin.observed)) * 176}`).join(" ");
    return (_jsxs("figure", { className: "evidence-plot", children: [_jsxs("svg", { viewBox: "0 0 200 210", role: "img", "aria-label": "Calibration plot comparing predicted and observed probabilities", children: [_jsx("line", { x1: "12", y1: "188", x2: "188", y2: "12", stroke: "#84948a", strokeDasharray: "4 4" }), _jsx("line", { x1: "12", y1: "188", x2: "188", y2: "188", stroke: "#60736a" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "188", stroke: "#60736a" }), bins.map((bin, index) => {
                        const cx = 12 + Math.max(0, Math.min(1, bin.predicted)) * 176;
                        const cy = 188 - Math.max(0, Math.min(1, bin.observed)) * 176;
                        return _jsx("circle", { cx: cx, cy: cy, r: Math.max(3, Math.min(8, 2 + Math.sqrt(bin.count))), fill: "#34775d" }, `${bin.predicted}-${index}`);
                    })] }), _jsx("figcaption", { children: "Predicted probability (horizontal) and observed rate (vertical). Dashed line: perfect calibration." }), _jsxs("span", { className: "sr-only", children: ["Calibration point values: ", points] })] }));
}
function CalibrationTable({ bins }) {
    return (_jsx("div", { className: "evidence-table-scroll", tabIndex: 0, "aria-label": "Scrollable calibration data", children: _jsxs("table", { children: [_jsx("caption", { children: "Predicted and observed probability by bin" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Predicted" }), _jsx("th", { scope: "col", children: "Observed" }), _jsx("th", { scope: "col", children: "Pairs" })] }) }), _jsx("tbody", { children: bins.map((bin, index) => _jsxs("tr", { children: [_jsx("td", { children: formatMetric(bin.predicted) }), _jsx("td", { children: formatMetric(bin.observed) }), _jsx("td", { children: formatMetric(bin.count) })] }, `${bin.predicted}-${index}`)) })] }) }));
}
function RankingTable({ label, metrics }) {
    const metricRows = metrics ? [
        ["Model Precision@100", metrics.precision_at_100],
        ["Model PR-AUC", metrics.pr_auc],
        ["Model ROC-AUC", metrics.roc_auc],
        ["Model average precision", metrics.average_precision],
        ["Current co-occurrence weight Precision@100", metrics.baselines.current_weight?.precision_at_100],
        ["Degree product Precision@100", metrics.baselines.degree_product?.precision_at_100],
        ["Preferential attachment Precision@100", metrics.baselines.preferential_attachment?.precision_at_100],
        ["Adamic-Adar Precision@100", metrics.baselines.adamic_adar?.precision_at_100],
        ["Cosine Precision@100", metrics.baselines.cosine?.precision_at_100],
    ] : [];
    return (_jsxs("section", { className: "evidence-stratum", "aria-label": label, children: [_jsx("h3", { children: label }), metrics ? _jsx("div", { className: "evidence-table-scroll", tabIndex: 0, "aria-label": `Scrollable ranking metrics for ${label}`, children: _jsxs("table", { children: [_jsx("caption", { children: "Ranking metrics and corresponding base rate" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Metric" }), _jsx("th", { scope: "col", children: "Value" }), _jsx("th", { scope: "col", children: "Base rate" })] }) }), _jsx("tbody", { children: metricRows.map(([name, value]) => _jsxs("tr", { children: [_jsx("th", { scope: "row", children: name }), _jsx("td", { children: formatMetric(value) }), _jsx("td", { children: formatMetric(metrics.base_rate) })] }, name)) })] }) }) : _jsx("p", { className: "evidence-empty", children: "Not yet measured for this starting weight." })] }));
}
function EvidenceTable({ title, rows, empty, error }) {
    return (_jsxs("div", { children: [_jsx("h2", { children: title }), error ? _jsx("p", { children: "Unable to load examples." }) : rows.length ? (_jsx("div", { className: "evidence-table-scroll", tabIndex: 0, "aria-label": `Scrollable ${title.toLowerCase()} table`, children: _jsxs("table", { children: [_jsxs("caption", { children: [title, " from the evaluation artifact"] }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Concept pair" }), _jsx("th", { scope: "col", children: "Score" }), _jsx("th", { scope: "col", children: "Starting weight" }), _jsx("th", { scope: "col", children: "Year" })] }) }), _jsx("tbody", { children: rows.map((row, index) => _jsxs("tr", { children: [_jsxs("td", { children: [row.a, " / ", row.b] }), _jsx("td", { children: formatMetric(row.score) }), _jsx("td", { children: formatMetric(row.starting_weight) }), _jsx("td", { children: formatMetric(row.year) })] }, `${row.a}-${row.b}-${index}`)) })] }) })) : _jsx("p", { children: empty })] }));
}
function formatMetric(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    if (typeof value === "string" && value.trim())
        return value;
    return "Not yet measured";
}
