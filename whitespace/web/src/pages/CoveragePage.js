import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CoverageHeatmap } from './CoverageHeatmap';
import './coverage.css';
export function CoveragePage({ response, selectedYear, onYearChange, onSelectCell, status, errorMessage, onRetry, }) {
    const years = response?.years ?? [];
    const concepts = response?.concepts ?? [];
    const placeholder = response?.placeholder ?? false;
    const archive = response?.archive;
    const caveat = response?.caveat?.replace(/^Coverage is a lower bound(?:\s+from)?\.?\s*/i, '')
        || 'The archive is incomplete and historical; a paper with no linked code here may still have an implementation elsewhere.';
    return (_jsxs("section", { className: "ws-coverage-page", "aria-label": "Code coverage", children: [_jsx("header", { className: "ws-coverage-header", children: _jsx("p", { children: "Explore the share of papers with a recorded code link by concept and year." }) }), _jsxs("aside", { className: "ws-coverage-caveat", "aria-label": "Important limitation", children: [_jsx("strong", { children: "Coverage is a lower bound." }), _jsx("span", { children: caveat.charAt(0).toUpperCase() + caveat.slice(1) })] }), _jsxs("section", { className: "ws-coverage-provenance", "aria-labelledby": "ws-coverage-source-title", children: [_jsx("h3", { id: "ws-coverage-source-title", children: "Archive source and licence" }), archive?.source_url
                        ? _jsxs("p", { children: ["Source: ", _jsxs("a", { href: archive.source_url, target: "_blank", rel: "noreferrer", children: ["Papers with Code paper-to-code archive ", _jsx("span", { className: "ws-coverage-sr-only", children: "(opens in a new tab)" })] })] })
                        : _jsx("p", { children: "Archive source link not supplied." }), _jsxs("p", { children: ["Dataset card-reported snapshot date: ", _jsx("strong", { children: archive?.snapshot_date ?? 'Not reported' }), "."] }), archive?.file_vintage_verified && archive.revision_sha
                        ? _jsxs("p", { children: ["File vintage verified at dataset revision ", _jsx("code", { children: archive.revision_sha }), "."] })
                        : _jsx("p", { className: "ws-coverage-vintage-warning", children: "Exact file vintage and dataset revision are unverified; the date above is the dataset card\u2019s reported date." }), _jsxs("p", { children: ["Licence: ", archive?.license_id
                                ? archive.license_url
                                    ? _jsxs("a", { href: archive.license_url, target: "_blank", rel: "noreferrer", children: [archive.license_id, " ", _jsx("span", { className: "ws-coverage-sr-only", children: "(opens in a new tab)" })] })
                                    : _jsxs("strong", { children: [archive.license_id, " (licence link not supplied)"] })
                                : 'Licence information not supplied.'] })] }), _jsxs("div", { className: "ws-coverage-controls", children: [_jsx("label", { htmlFor: "ws-coverage-year", children: "Focus year" }), _jsx("select", { id: "ws-coverage-year", value: selectedYear, disabled: years.length === 0, onChange: (event) => onYearChange(Number(event.currentTarget.value)), children: years.map((year) => _jsx("option", { value: year, children: year }, year)) }), _jsx("span", { children: "The full matrix remains visible; the focus year is highlighted." })] }), status === 'loading' && _jsx("p", { className: "ws-coverage-state", role: "status", children: "Loading coverage\u2026" }), status === 'error' && (_jsxs("div", { className: "ws-coverage-state ws-coverage-error", role: "alert", children: [_jsx("p", { children: errorMessage || 'Coverage could not be loaded.' }), onRetry && _jsx("button", { type: "button", onClick: onRetry, children: "Try again" })] })), (status === 'empty' || (status === 'ready' && concepts.length === 0)) && (_jsx("p", { className: "ws-coverage-state", role: "status", children: placeholder
                    ? 'The placeholder response contains no example coverage values. No research result is being shown.'
                    : `No coverage values are available${selectedYear ? ` for ${selectedYear}` : ''}.` })), status === 'ready' && concepts.length > 0 && years.length > 0 && (_jsx(CoverageHeatmap, { years: years, selectedYear: selectedYear, concepts: concepts, onSelectCell: onSelectCell }))] }));
}
