// Safety net, not a fact-checker: list figures in the model's answer that no tool result contains.
// The prompt forbids the model from calculating or rounding; this catches it if it does anyway,
// so the UI can warn. Small integers (dates, ranks, counts up to 31) and the data year are ignored.
const NUM = /\d[\d,]*(?:\.\d+)?/g;

function collect(v: unknown, out: Set<number>) {
  if (typeof v === "number") out.add(v);
  else if (typeof v === "string") for (const m of v.match(NUM) ?? []) out.add(parseFloat(m.replace(/,/g, "")));
  else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, out));
}

export function checkNumbers(answer: string, toolResults: unknown[]): string[] {
  const allowed = new Set<number>();
  collect(toolResults, allowed);
  const bad: string[] = [];
  for (const m of answer.match(NUM) ?? []) {
    const raw = m.replace(/,$/, "");
    const n = parseFloat(raw.replace(/,/g, ""));
    if (Number.isInteger(n) && (n <= 31 || n === 2026)) continue;
    if (!allowed.has(n) && !bad.includes(raw)) bad.push(raw);
  }
  return bad;
}
