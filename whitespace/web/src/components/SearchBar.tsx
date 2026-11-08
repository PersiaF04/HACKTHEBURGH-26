import { useState, type FormEvent } from "react";
import type { SearchResponse } from "../api";
import "./explore.css";

type SearchBarProps = {
  onSearch: (query: string) => Promise<SearchResponse>;
  onResults: (results: SearchResponse) => void;
  onSelectConcept: (id: string) => void;
};

export function SearchBar({ onSearch, onResults, onSelectConcept }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setSearchResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="whitespace-search">
      <form className="whitespace-search__form" onSubmit={submit} role="search">
        <label htmlFor="whitespace-search-input">Find a paper or concept</label>
        <div className="whitespace-search__controls">
          <input
            id="whitespace-search-input"
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
    </div>
  );
}
