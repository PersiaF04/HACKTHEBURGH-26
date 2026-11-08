import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { ConceptSummary, SearchResponse } from "../api";
import { fmtInt, fmtText, fmtYear } from "../lib/format";
import "./explore.css";

type SearchBarProps = {
  onSearch: (query: string) => Promise<SearchResponse>;
  onResults: (results: SearchResponse) => void;
  onSelectConcept: (id: string) => void;
  /** Concepts on the map, searched by name as you type. */
  concepts?: ConceptSummary[];
  /** Skeleton state: no data to search yet. */
  disabled?: boolean;
};

export function SearchBar({ onSearch, onResults, onSelectConcept, concepts, disabled = false }: SearchBarProps) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<SearchResponse["papers"]>([]);
  const [searchPlaceholder, setSearchPlaceholder] = useState(false);

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle || !concepts) return [];
    return concepts
      .filter((c) => c.label.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(needle)) - Number(a.label.toLowerCase().startsWith(needle)) || (b.paper_count ?? 0) - (a.paper_count ?? 0))
      .slice(0, 6);
  }, [needle, concepts]);

  // Papers come from the search index; concept matches are instant and local.
  useEffect(() => {
    if (!needle || disabled) { setPapers([]); return undefined; }
    let current = true;
    const timer = window.setTimeout(() => {
      onSearch(needle).then((r) => { if (current) { setPapers((r.papers ?? []).slice(0, 4)); setSearchPlaceholder(r.placeholder === true); } }).catch(() => { if (current) setPapers([]); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [needle, disabled, onSearch]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!needle || disabled) return;
    if (results.length > 0) onSelectConcept(results[0].id);
    else onSearch(needle).then(onResults).catch(() => undefined);
  }

  const none = needle && results.length === 0 && papers.length === 0;

  return (
    <section className="whitespace-search" aria-label="Search">
      <form className="whitespace-search__form" onSubmit={submit} role="search">
        <label htmlFor={`${uid}-q`}>Find a concept or paper</label>
        <div className="whitespace-search__field">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" style={{ stroke: "var(--ws-muted)" }} strokeWidth="1.6" /><line x1="11" y1="11" x2="14.5" y2="14.5" style={{ stroke: "var(--ws-muted)" }} strokeWidth="1.6" strokeLinecap="round" /></svg>
          <input
            id={`${uid}-q`}
            type="search"
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={disabled ? "Search unlocks with data" : "Search concepts and papers"}
            autoComplete="off"
          />
        </div>
        {results.length > 0 && (
          <ul className="whitespace-search__results" aria-label="Matching concepts">
            {results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onSelectConcept(c.id)}>
                  <span>{fmtText(c.label)}</span>
                  <span className="whitespace-mono" title="Papers">{fmtInt(c.paper_count)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {papers.length > 0 && (
          <ul className="whitespace-search__results whitespace-search__papers" aria-label="Matching papers">
            {papers.map((p) => (
              <li key={p.id}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  <span>{fmtText(p.title)}</span>
                  <span className="whitespace-mono">{fmtYear(p.year)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {none && <p className="whitespace-search__none" role="status">
          {searchPlaceholder ? "Search is not available yet." : <>No concept names match {"“"}{query.trim()}{"”"}. This searches concept names only.</>}
        </p>}
      </form>
    </section>
  );
}
