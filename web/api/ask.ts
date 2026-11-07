// POST /api/ask  { question: string }  ->  { answer, tool_calls: [{tool, args, result}], ungrounded_numbers }
// Vercel serverless function. Calls the Anthropic Messages API directly (no SDK dependency) and runs the
// Ask the Grid tools over the committed JSON. ANTHROPIC_API_KEY comes from the environment only.
// On any failure it returns { error, fallback: true } and the rest of the app is unaffected.
import { checkNumbers } from "./_lib/guard.ts";
import { MODEL, SYSTEM_PROMPT, TOOL_DEFS } from "./_lib/prompt.ts";
import { defaultDataDir, fileReader, runTool, type Json } from "./_lib/tools.ts";

// Minimal request/response shapes (the Vercel Node runtime provides these; no @vercel/node dependency).
interface Req { method?: string; body?: Json; headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; json(body: unknown): void; setHeader(k: string, v: string): void }

const MAX_QUESTION = 500;
const MAX_ROUNDS = 5;
const MAX_TOKENS = 700;
const TIMEOUT_MS = 20_000;
const RATE = { windowMs: 60_000, max: 8 };

// Best-effort limiter: per warm instance only, so it blunts casual abuse, not a determined one.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 1000) hits.clear();
  return recent.length > RATE.max;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only", fallback: true });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "Ask the Grid is not configured", fallback: true });
  const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ error: "Too many questions; try again in a minute", fallback: true });

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) return res.status(400).json({ error: `Ask a question of up to ${MAX_QUESTION} characters` });

  const read = fileReader(defaultDataDir());
  const calls: { tool: string; args: Json; result: Json }[] = [];
  const messages: Json[] = [{ role: "user", content: question }];
  const abort = AbortSignal.timeout(TIMEOUT_MS);

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: abort,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, tools: TOOL_DEFS, messages }),
      });
      if (!r.ok) throw new Error(`Anthropic API ${r.status}`);
      const msg = await r.json();
      messages.push({ role: "assistant", content: msg.content });

      if (msg.stop_reason !== "tool_use") {
        const answer = (msg.content as Json[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!answer) throw new Error("empty answer");
        const ungrounded = checkNumbers(answer, calls.map((c) => c.result));
        return res.status(200).json({ answer, tool_calls: calls, ungrounded_numbers: ungrounded, model: MODEL });
      }
      const results = (msg.content as Json[])
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const result = runTool(read, b.name, b.input);
          calls.push({ tool: b.name, args: b.input, result });
          return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result), ...(result.error ? { is_error: true } : {}) };
        });
      messages.push({ role: "user", content: results });
    }
    throw new Error("too many tool rounds");
  } catch (e) {
    // Details stay in the function logs, never in the response.
    console.error("ask failed:", e instanceof Error ? e.message : e);
    return res.status(502).json({ error: "Ask the Grid could not answer just now", fallback: true });
  }
}
