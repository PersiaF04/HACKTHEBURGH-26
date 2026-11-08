import { useId, useMemo, useState, type FormEvent } from "react";
import type { ConceptSummary, SearchResponse } from "../api";
import "./explore.css";

type SearchBarProps = {
  onSearch: (query: string) => Promise<SearchResponse>;
  onResults: (results: SearchResponse) => void;
  onSelectConcept: (id: string) => void;
  /** Optional: concepts available to the "From my paper" fallback. Without them that tab says so. */
  concepts?: ConceptSummary[];
};

type Mode = "search" | "paper";
type Match = { concept: ConceptSummary; score: number };

const STOP = new Set(["the", "and", "for", "with", "that", "this", "are", "was", "our", "from", "into", "can", "which", "using", "based", "via", "its", "has", "have", "been", "than", "also", "not", "but"]);

function terms(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Client-side fallback only: share of a concept's name words found in the abstract.
 * This is plain term overlap, not an embedding similarity.
 */
export function nearestByTermOverlap(abstract: string, concepts: ConceptSummary[], limit = 5): Match[] {
  const bag = new Set(terms(abstract));
  if (bag.size === 0) return [];
  return concepts
    .map((concept) => {
      const t = terms(concept.label);
      const hits = t.filter((x) => bag.has(x)).length;
      return { concept, score: t.length ? hits / t.length : 0 };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || (b.concept.paper_count ?? 0) - (a.concept.paper_count ?? 0))
    .slice(0, limit);
}

export function SearchBar({ onSearch, onResults, onSelectConcept, concepts }: SearchBarProps) {
  const uid = useId();
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [abstract, setAbstract] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle || !concepts) return [];
    return concepts
      .filter((c) => c.label.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(needle)) - Number(a.label.toLowerCase().startsWith(needle)) || (b.paper_count ?? 0) - (a.paper_count ?? 0))
      .slice(0, 6);
  }, [needle, concepts]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!needle) return;
    if (results.length > 0) onSelectConcept(results[0].id);
    else onSearch(needle).then(onResults).catch(() => undefined);
  }

  function findNearest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!abstract.trim() || !concepts) return;
    setMatches(nearestByTermOverlap(abstract, concepts, 4));
  }

  return (
    <section className="whitespace-search" aria-label="Search">
      <div className="whitespace-seg" role="group" aria-label="Search mode">
        <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")}>Search</button>
        <button type="button" aria-pressed={mode === "paper"} onClick={() => setMode("paper")}>From my paper</button>
      </div>

      {mode === "search" && (
        <form className="whitespace-search__form" onSubmit={submit} role="search">
          <label htmlFor={`${uid}-q`}>Find a concept or paper</label>
          <div className="whitespace-search__field">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="#5B606B" strokeWidth="1.6" /><line x1="11" y1="11" x2="14.5" y2="14.5" stroke="#5B606B" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <input
              id={`${uid}-q`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="e.g. diffusion, offline RL"
              autoComplete="off"
            />
          </div>
          {results.length > 0 && (
            <ul className="whitespace-search__results">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onSelectConcept(c.id)}>
                    <span>{c.label}</span>
                    {typeof c.paper_count === "number" && <span className="whitespace-mono">{c.paper_count.toLocaleString("en-GB")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {needle && results.length === 0 && <p className="whitespace-search__none">No concept matches {"“"}{query.trim()}{"”"}.</p>}
        </form>
      )}

      {mode === "paper" && (
        <form className="whitespace-search__form" onSubmit={findNearest}>
          <label htmlFor={`${uid}-abs`}>Paste your abstract</label>
          <textarea
            id={`${uid}-abs`}
            className="whitespace-search__abstract"
            rows={6}
            value={abstract}
            onChange={(event) => setAbstract(event.currentTarget.value)}
            placeholder="We find its nearest concepts and the unexplored pairs next to them."
          />
          <button type="submit" className="whitespace-primary" disabled={!abstract.trim() || !concepts}>
            Find nearest concepts
          </button>
          {matches && matches.length === 0 && <p className="whitespace-search__none">No concept names share words with this abstract.</p>}
          {matches && matches.length > 0 && (
            <ul className="whitespace-search__nearest">
              {matches.map(({ concept, score }) => (
                <li key={concept.id}>
                  <button type="button" onClick={() => onSelectConcept(concept.id)}>
                    <span><span>{concept.label}</span><span className="whitespace-mono">match {score.toFixed(2)}</span></span>
                    <span className="whitespace-search__bar"><span style={{ width: `${Math.round(score * 100)}%` }} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </section>
  );
}
