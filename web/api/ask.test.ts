// Runs the 25 golden questions' tool calls through the TypeScript tools and checks the outputs
// equal the golden expected values. No LLM or network. Run: npm --prefix web run test:ask
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkNumbers } from "./_lib/guard.ts";
import { TOOL_DEFS } from "./_lib/prompt.ts";
import { fileReader, runTool, TOOLS } from "./_lib/tools.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = fileReader(join(root, "data", "public"));
const goldenPath = join(root, "contracts", "fixtures", "ask-golden.json");
const manifestPath = join(root, "contracts", "ask-the-grid-tools.json");
// The golden set and manifest arrive with PR #93 (issue #91). Skip, loudly, until they are on this branch.
const skip = existsSync(goldenPath) ? false : "contracts/fixtures/ask-golden.json missing (needs PR #93)";

const strip = (r: Record<string, unknown>) => {
  const { source, ...rest } = r;
  assert.ok(Array.isArray(source) && source.length > 0, "tool result must carry a source");
  return rest;
};

test("golden questions: tool outputs equal expected values", { skip }, () => {
  const golden = JSON.parse(readFileSync(goldenPath, "utf-8"));
  assert.equal(golden.questions.length, 25);
  for (const q of golden.questions) {
    const got = q.tool_calls.map((c: { tool: string; args: object }) => strip(runTool(read, c.tool, c.args)));
    assert.deepEqual(got, q.expected_results, `${q.id}: ${q.question}`);
  }
});

test("refusal questions make no figure-bearing tool call", { skip }, () => {
  const golden = JSON.parse(readFileSync(goldenPath, "utf-8"));
  const refusals = golden.questions.filter((q: { kind: string }) => q.kind === "refuse");
  assert.equal(refusals.length, 5);
  for (const q of refusals) assert.ok(q.tool_calls.length <= 1, q.id);
});

test("tool definitions match the manifest and the implemented tools", { skip }, () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const names = manifest.tools.map((t: { name: string }) => t.name).sort();
  assert.deepEqual(Object.keys(TOOLS).sort(), names);
  assert.deepEqual(TOOL_DEFS.map((t) => t.name).sort(), names);
  for (const t of manifest.tools) {
    const def = TOOL_DEFS.find((d) => d.name === t.name)!;
    assert.deepEqual(def.input_schema.required ?? [], t.parameters.required ?? [], t.name);
  }
});

test("bad arguments and unknown tools become error results", () => {
  assert.equal(runTool(read, "curtailment_for_day", { date: "14 Oct" }).error, "bad_arguments");
  assert.equal(runTool(read, "top_farms_for_day", { date: "../x", n: 1 }).error, "bad_arguments");
  assert.equal(runTool(read, "top_farms_for_day", { date: "2026-01-01", n: 1 }).error, "no_replay_for_date");
  assert.equal(runTool(read, "curtailment_for_day", { date: "1999-01-01" }).error, "no_data");
  assert.equal(runTool(read, "nope", {}).error, "unknown_tool");
});

test("number guard flags figures that no tool returned", () => {
  const results = [{ curtailed_mwh: 147966, wind_paid_gbp: 5332713.4 }];
  assert.deepEqual(checkNumbers("Curtailed 147,966 MWh on 14 October 2026.", results), []);
  assert.deepEqual(checkNumbers("That is about £5.3 million, or 148,000 MWh.", results), ["5.3", "148,000"]);
});

test("handler runs the tool loop against a stubbed Anthropic API", async () => {
  const { default: handler } = await import("./ask.ts");
  const real = globalThis.fetch;
  const replies = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "curtailment_for_day", input: { date: "2026-10-14" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "147,966 MWh were curtailed (source: curtailment_daily.json), about 150,000 MWh." }] },
  ];
  globalThis.fetch = (async () => ({ ok: true, json: async () => replies.shift() })) as unknown as typeof fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  const out: { code?: number; body?: Record<string, unknown> } = {};
  const res = { setHeader() {}, status(c: number) { out.code = c; return res; }, json(b: Record<string, unknown>) { out.body = b; } };
  try {
    await handler({ method: "POST", body: { question: "How much on 14 Oct?" }, headers: { "x-forwarded-for": "9.9.9.9" } }, res);
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
  assert.equal(out.code, 200);
  assert.equal((out.body!.tool_calls as unknown[]).length, 1);
  assert.deepEqual(out.body!.ungrounded_numbers, ["150,000"]);
});

test("scotex_gap reports no overshoot on a day that never exceeds the limit", () => {
  const calm = { periods: Array.from({ length: 48 }, (_, i) => ({ sp: i + 1, scotex_limit_mw: 5000, scotex_flow_mw: 4001 + i })) };
  const mixed = { periods: [{ sp: 1, scotex_limit_mw: 5000, scotex_flow_mw: 4000 }, { sp: 2, scotex_limit_mw: 5000, scotex_flow_mw: 5200.5 }] };
  const readerFor = (rep: unknown) => ((path: string) => (path.startsWith("replay/") ? rep : null)) as never;
  const a = TOOLS.scotex_gap(readerFor(calm), { date: "2026-10-13" }) as Record<string, unknown>;
  assert.equal(a.periods_over_limit, 0);
  assert.equal(a.max_overshoot_mw, null);
  assert.equal(a.max_overshoot_sp, null);
  const b = TOOLS.scotex_gap(readerFor(mixed), { date: "2026-10-13" }) as Record<string, unknown>;
  assert.equal(b.periods_over_limit, 1);
  assert.equal(b.max_overshoot_mw, 200.5);
  assert.equal(b.max_overshoot_sp, 2);
});
