import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, entries, match, sessionWarning, stats } from "../skills/lessons/lessons.mjs";

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

test("two hits in one session mean review, not promote", () => {
  const sym = entries(LOG)[0].symptom;
  const hits = [1, 2].map((i) => JSON.stringify({ ts: `2026-10-21T0${i}:00:00Z`, symptom: sym, session_id: "s1" }));
  const s = stats(LOG, hits);
  assert.equal(s.promote.length, 0);
  assert.equal(s.review.length, 1);
  assert.equal(s.review[0].n, 2);
  // the same two hits in different sessions promote
  const s2 = stats(LOG, [hits[0], JSON.stringify({ ts: "2026-10-22T00:00:00Z", symptom: sym, session_id: "s2" })]);
  assert.equal(s2.promote.length, 1);
  assert.equal(s2.review.length, 0);
});

test("check finds old entries that overlap a draft, in either direction", () => {
  assert.equal(check(LOG, "- **`!` dies: `syntax error near unexpected token '&'` again** — c. Do: d.").length, 1);
  assert.equal(check(LOG, "- **`pip` says `Python was not found; run without arguments to install`** — c.").length, 1);
  assert.equal(check(LOG, "- **something unrelated `with a long quote here`** — c.").length, 0);
});

test("stats flags stale entries, oversized sections and duplicate headers", () => {
  const s = stats(LOG, [], new Date("2026-11-30T00:00:00Z"));
  // 10-27 entries are 34 days old; 10-28 is 33 days old: all stale, none hit
  assert.deepEqual(s.stale.length, 3);
  assert.equal(stats(LOG, [], new Date("2026-11-20T00:00:00Z")).stale.length, 0);
  assert.deepEqual(s.oversized, []);
  assert.deepEqual(s.dupHeaders, []);

  const big = "## A\n" + Array.from({ length: 26 }, (_, i) => `- **e${i}** — c. Do: d. (all, 2026-10-27)`).join("\n") + "\n## A\n- **x** — c. Do: d. (all, 2026-10-27)\n";
  const b = stats(big, []);
  assert.deepEqual(b.oversized, [{ section: "A", n: 27 }]);
  assert.deepEqual(b.dupHeaders, ["## A"]);
  assert.match(sessionWarning("L", b), /27 entries \(cap 25\).*appears more than once/);
  assert.equal(sessionWarning("L", s), "");
});

test("hook on SessionStart warns only when the log needs compaction", () => {
  const dir = mkdtempSync(join(tmpdir(), "lessons-"));
  const script = fileURLToPath(new URL("../skills/lessons/lessons.mjs", import.meta.url));
  const run = (payload) =>
    execFileSync("node", [script], { input: payload, env: { ...process.env, LESSONS_FILE: join(dir, "LESSONS.md") } }).toString();
  writeFileSync(join(dir, "LESSONS.md"), LOG);
  assert.equal(run(JSON.stringify({ hook_event_name: "SessionStart" })), "");
  writeFileSync(join(dir, "LESSONS.md"), LOG + "\n## General\n- **again** — c. Do: d. (all, 2026-10-27)\n");
  const out = JSON.parse(run(JSON.stringify({ hook_event_name: "SessionStart" })));
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /appears more than once/);
});

test("hook end to end: emits additionalContext and appends a hit", () => {
  const dir = mkdtempSync(join(tmpdir(), "lessons-"));
  writeFileSync(join(dir, "LESSONS.md"), LOG);
  const script = fileURLToPath(new URL("../skills/lessons/lessons.mjs", import.meta.url));
  const run = (payload) =>
    execFileSync("node", [script], { input: payload, env: { ...process.env, LESSONS_FILE: join(dir, "LESSONS.md") } }).toString();
  const payload = JSON.stringify({ tool_name: "Bash", session_id: "s1", error: "Exit code 2\nsyntax error near unexpected token '&'" });
  const out = run(payload);
  assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /Apply the "Do" before retrying:\n- \*\*.*Do: x/);
  assert.equal(readFileSync(join(dir, "hits.jsonl"), "utf8").trim().split("\n").length, 1);
  // same failure again in the same session: the Do did not work, say so instead of repeating it
  const again = JSON.parse(run(payload)).hookSpecificOutput.additionalContext;
  assert.match(again, /did not prevent the repeat/);
  assert.doesNotMatch(again, /Apply the "Do"/);
  assert.equal(readFileSync(join(dir, "hits.jsonl"), "utf8").trim().split("\n").length, 2);
  assert.equal(run("not json"), "");
  assert.equal(run(JSON.stringify({ error: "unrelated" })), "");
});
