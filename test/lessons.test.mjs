import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { entries, match, stats } from "../skills/lessons/lessons.mjs";

const LOG = `# Lessons

## General
- **\`!\` command fails with \`syntax error near unexpected token '&'\`** — cause. Do: x. (all, 2026-10-27)
- **"Python was not found; run without arguments"** — cause. Do: y. (all, 2026-10-28)
- **Built a page that looked like a form** — cause. Do: z. (all, 2026-10-27)
`;

test("needles come from quoted symptom text, short ones dropped", () => {
  const [a, b, c] = entries(LOG);
  assert.deepEqual(a.needles, ["syntax error near unexpected token '&'"]);
  assert.deepEqual(b.needles, ["Python was not found; run without arguments"]);
  assert.deepEqual(c.needles, []);
});

test("matches case-insensitively inside a real failure string", () => {
  const err = "Exit code 2\nbash: -c: line 1: SYNTAX ERROR NEAR UNEXPECTED TOKEN '&'";
  assert.equal(match(LOG, err).length, 1);
  assert.equal(match(LOG, "Exit code 1\nsomething else").length, 0);
  // real bash quoting differs from the entry's
  assert.equal(match(LOG, "bash: -c: line 1: syntax error near unexpected token `&'").length, 1);
});

test("stats counts hits and flags promotion at 2", () => {
  const sym = entries(LOG)[0].symptom;
  const hits = [1, 2].map((i) => JSON.stringify({ ts: `2026-10-2${i}T00:00:00Z`, symptom: sym }));
  const s = stats(LOG, [...hits, "not json"]);
  assert.equal(s.promote.length, 1);
  assert.equal(s.promote[0].n, 2);
  assert.equal(s.unmatchable.length, 1);
});

test("hook end to end: emits additionalContext and appends a hit", () => {
  const dir = mkdtempSync(join(tmpdir(), "lessons-"));
  writeFileSync(join(dir, "LESSONS.md"), LOG);
  const script = fileURLToPath(new URL("../skills/lessons/lessons.mjs", import.meta.url));
  const run = (payload) =>
    execFileSync("node", [script], { input: payload, env: { ...process.env, LESSONS_FILE: join(dir, "LESSONS.md") } }).toString();
  const out = run(JSON.stringify({ tool_name: "Bash", error: "Exit code 2\nsyntax error near unexpected token '&'" }));
  assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /Do: x/);
  assert.equal(readFileSync(join(dir, "hits.jsonl"), "utf8").trim().split("\n").length, 1);
  assert.equal(run("not json"), "");
  assert.equal(run(JSON.stringify({ error: "unrelated" })), "");
});
