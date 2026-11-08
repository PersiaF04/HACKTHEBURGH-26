import type { PaperSummary } from "../api";

function safeExternalUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Paper title, linked when the paper has a safe http(s) url, with its year. */
export function PaperLink({ paper }: { paper: PaperSummary }) {
  const url = safeExternalUrl(paper.url);
  return (
    <>
      {url
        ? <a href={url} target="_blank" rel="noreferrer">{paper.title || paper.id}</a>
        : <span>{paper.title || paper.id}</span>}
      {paper.year != null && <span> ({paper.year})</span>}
    </>
  );
}
