import { useState } from "react";

// Ask the Grid chat panel. Not mounted anywhere yet: see web/src/ask/README.md for how to mount it.
// Styling is inline on purpose (styles.css belongs to the dashboard PR); CSS variables fall back to neutral values.

interface ToolCall { tool: string; args: Record<string, unknown>; result: { error?: string; source?: { file: string; fields: string[] }[] } & Record<string, unknown> }
interface Answer { answer: string; tool_calls: ToolCall[]; ungrounded_numbers: string[] }

export const SUGGESTED_QUESTIONS = [
  "Which day wasted the most wind?",
  "Which farm wasted the most wind on 14 October?",
  "What is tomorrow's outlook?",
];

const box = { border: "1px solid var(--line, #c9cdd2)", borderRadius: 8, padding: 12, background: "var(--panel, transparent)" } as const;
const fmt = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => `${k}=${String(v)}`).join(", ");

export function AskTheGrid({ endpoint = "/api/ask" }: { endpoint?: string }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true); setError(null); setAnswer(null);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
      setAnswer(body as Answer);
    } catch (e) {
      // The rest of the dashboard does not depend on this panel.
      setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Ask the Grid did not answer in time.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Ask the Grid" style={{ ...box, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Ask the Grid</h2>
      <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>
        Answers are worded by an AI model; every figure is copied from a tool reading our published data files and shown with its source. Retrospective, not a forecast service.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SUGGESTED_QUESTIONS.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => { setQuestion(s); void ask(s); }}>{s}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} style={{ display: "flex", gap: 6 }}>
        <input
          aria-label="Your question" value={question} maxLength={500} placeholder="Ask about curtailed Scottish wind"
          onChange={(e) => setQuestion(e.target.value)} style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" disabled={busy || !question.trim()}>{busy ? "Asking..." : "Ask"}</button>
      </form>
      <div aria-live="polite">
        {error && <p role="alert" style={{ margin: 0 }}>{error} The dashboard shows the same figures without the chat.</p>}
        {answer && (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{answer.answer}</p>
            {answer.ungrounded_numbers.length > 0 && (
              <p role="alert" style={{ margin: 0, fontSize: "0.85rem" }}>
                Check these figures against the sources, a tool did not return them: {answer.ungrounded_numbers.join(", ")}.
              </p>
            )}
            <details>
              <summary>Tools used ({answer.tool_calls.length})</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "0.85rem" }}>
                {answer.tool_calls.map((c, i) => (
                  <li key={i}>
                    <code>{c.tool}({fmt(c.args)})</code>
                    {c.result.error ? ` returned ${c.result.error}` : ` read ${(c.result.source ?? []).map((s) => s.file).join(", ")}`}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}

export default AskTheGrid;
