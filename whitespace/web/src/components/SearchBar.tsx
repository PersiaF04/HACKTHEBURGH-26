import { useId, useState, type FormEvent } from "react";
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
  const [results, setSearchResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [abstract, setAbstract] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await onSearch(value);
      setSearchResults(response);
      onResults(response);
    } catch {
      setError("Search is unavailable. Try again in a moment.");
      setSearchResults(null);
    } finally {
      setBusy(false);
    }
  }

  function findNearest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!abstract.trim() || !concepts) return;
    setMatches(nearestByTermOverlap(abstract, concepts));
  }

  return (
    <div className="whitespace-search">
      <div className="whitespace-seg" role="group" aria-label="Search mode">
        <button type="button" aria-pressed={mode === "search"} onClick={() => setMode("search")}>
          Find a concept or paper
        </button>
        <button type="button" aria-pressed={mode === "paper"} onClick={() => setMode("paper")}>
          From my paper
        </button>
      </div>

      {mode === "search" && (
        <>
          <form className="whitespace-search__form" onSubmit={submit} role="search">
            <label htmlFor={`${uid}-q`}>Find a concept or paper</label>
            <div className="whitespace-search__controls">
              <input
                id={`${uid}-q`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Try a research topic or paper title"
                autoComplete="off"
              />
              <button type="submit" disabled={busy || !query.trim()}>
                {busy ? "Searching…" : "Search"}
              </button>
            </div>
          </form>
          <div className="whitespace-search__results" aria-live="polite" aria-busy={busy}>
            {error && <p className="whitespace-search__error" role="alert">{error}</p>}
            {results && results.concepts.length === 0 && results.papers.length === 0 && (
              <p className="whitespace-search__message">No matching papers or concepts were returned.</p>
            )}
            {results && results.concepts.length > 0 && (
              <div>
                <h3>Concepts</h3>
                <ul className="whitespace-search__list">
                  {results.concepts.map((concept) => (
                    <li key={concept.id}>
                      <button type="button" onClick={() => onSelectConcept(concept.id)}>{concept.label}</button>
                      {typeof concept.paper_count === "number" && (
                        <span className="whitespace-mono"> {concept.paper_count.toLocaleString()}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {results && results.papers.length > 0 && (
              <div>
                <h3>Papers</h3>
                <ul className="whitespace-search__list">
                  {results.papers.map((paper) => (
                    <li key={paper.id}>
                      <a href={paper.url} target="_blank" rel="noreferrer">
                        {paper.title} <span>({paper.year})</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
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
            aria-describedby={`${uid}-note`}
          />
          <p id={`${uid}-note`} className="whitespace-note">
            Matching runs in your browser by word overlap with concept names. It is not a semantic or embedding
            match, so treat the order as a rough guide.
          </p>
          <button type="submit" className="whitespace-primary" disabled={!abstract.trim() || !concepts}>
            Find nearest concepts
          </button>
          {!concepts && <p className="whitespace-note">Nearest-concept matching is not available: no concept list has loaded.</p>}
          <div aria-live="polite">
            {matches && matches.length === 0 && (
              <p className="whitespace-note">No concept names share words with this abstract.</p>
            )}
            {matches && matches.length > 0 && (
              <ul className="whitespace-search__list whitespace-search__list--plain">
                {matches.map(({ concept, score }) => (
                  <li key={concept.id}>
                    <button type="button" onClick={() => onSelectConcept(concept.id)}>{concept.label}</button>
                    <span className="whitespace-mono"> {Math.round(score * 100)}% of name words found</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
