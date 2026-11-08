import type { ConceptPoint, ConceptResponse, GapSummary } from "../api";

export type ConceptPanelProps = {
  /** The selected concept from the map, or undefined when nothing is selected. */
  concept: ConceptPoint | undefined;
  /** Detail from api.concept(id): undefined while loading, null when the export has no entry. */
  detail: ConceptResponse | null | undefined;
  /** Gaps involving this concept from api.gaps({ concepts: [id] }); undefined while loading. */
  gaps: GapSummary[] | undefined;
  /** Whether the snapshot/detail data is placeholder data. */
  placeholder: boolean;
  /** Snapshot year, used as the last observed year for the papers-per-year chart. */
  year: number;
  onSelectConcept: (id: string) => void;
};

/** Placeholder implementation; the "panels" helper replaces this with the design port. */
export function ConceptPanel({ concept, detail, gaps, onSelectConcept }: ConceptPanelProps) {
  if (!concept) return <aside aria-label="Concept details" className="ex__right"><p className="ex__muted">Select a concept on the map to see its details.</p></aside>;
  return (
    <aside aria-label="Concept details" className="ex__right">
      <h2 className="ex-cp__title">{concept.label}</h2>
      {typeof concept.paper_count === "number" && <p>{concept.paper_count.toLocaleString("en-GB")} papers</p>}
      {detail === undefined && <p className="ex__muted">Loading details…</p>}
      {gaps?.map((g) => (
        <button key={`${g.a}|${g.b}`} type="button" onClick={() => onSelectConcept(g.a === concept.id ? g.b : g.a)}>
          {g.a === concept.id ? g.b_label : g.a_label} P {g.p_link.toFixed(2)}
        </button>
      ))}
    </aside>
  );
}
