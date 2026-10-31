// Two jobs, no dependencies:
//   hook   (default; stdin = a PostToolUseFailure payload): find log entries whose symptom quotes
//          text that appears in the failure, hand them to the agent, and append one line per hit
//          to hits.jsonl. A hit means a logged mistake happened again: that is the promotion signal.
//   stats  print hits per entry, promotion candidates, and entries the hook can never match.
// Any failure in hook mode prints nothing; a session must never break because of this file.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PROMOTE_AT = 2;
const MIN_NEEDLE = 8; // shorter quotes ("pnpm", "&") match unrelated failures
const MAX_SHOWN = 3;

export const logPath = () => process.env.LESSONS_FILE || join(homedir(), ".lessons", "LESSONS.md");
const hitsPath = (log) => join(dirname(log), "hits.jsonl");

export function entries(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("- **"))
    .map((line) => {
      const end = line.indexOf("**", 4);
      const symptom = end > 0 ? line.slice(4, end) : line.slice(4);
      const needles = [...symptom.matchAll(/`([^`]+)`|"([^"]+)"/g)]
        .map((m) => (m[1] ?? m[2]).trim())
        .filter((s) => s.length >= MIN_NEEDLE);
      return { line, symptom, needles };
    });
}

// Shells and people quote differently (bash prints `&' where an entry says '&'), so compare without quotes.
const norm = (s) => s.toLowerCase().replace(/[`'"‘’“”]/g, "").replace(/\s+/g, " ");

export function match(text, failure) {
  const hay = norm(failure);
  return entries(text).filter((e) => e.needles.some((n) => hay.includes(norm(n))));
}

export function stats(text, hitLines) {
  const count = new Map();
  for (const l of hitLines) {
    try {
      const { symptom, ts } = JSON.parse(l);
      const c = count.get(symptom) || { n: 0, last: "" };
      count.set(symptom, { n: c.n + 1, last: ts > c.last ? ts : c.last });
    } catch {}
  }
  const all = entries(text);
  const hit = all
    .filter((e) => count.has(e.symptom))
    .map((e) => ({ symptom: e.symptom, ...count.get(e.symptom) }))
    .sort((a, b) => b.n - a.n);
  return {
    total: all.length,
    promote: hit.filter((h) => h.n >= PROMOTE_AT),
    hit,
    unmatchable: all.filter((e) => !e.needles.length).map((e) => e.symptom),
  };
}

function hook() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const log = logPath();
  if (input.is_interrupt || !existsSync(log)) return;
  const failure = `${input.error || ""}\n${input.tool_input?.command || ""}`;
  const found = match(readFileSync(log, "utf8"), failure).slice(0, MAX_SHOWN);
  if (!found.length) return;
  const ts = new Date().toISOString();
  appendFileSync(
    hitsPath(log),
    found.map((e) => JSON.stringify({ ts, symptom: e.symptom, tool: input.tool_name, cwd: input.cwd })).join("\n") + "\n",
  );
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUseFailure",
        additionalContext:
          `This failure matches mistakes already logged in ${log}. Apply the "Do" before retrying:\n` +
          found.map((e) => e.line).join("\n") +
          `\nIt happened again after being logged; run \`node <lessons skill>/lessons.mjs stats\` at the end and propose promoting entries with ${PROMOTE_AT}+ hits.`,
      },
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (process.argv[2] === "stats") {
    const log = logPath();
    const text = existsSync(log) ? readFileSync(log, "utf8") : "";
    const hits = existsSync(hitsPath(log)) ? readFileSync(hitsPath(log), "utf8").split("\n").filter(Boolean) : [];
    const s = stats(text, hits);
    console.log(`${log}: ${s.total} entries, ${hits.length} hits`);
    console.log(`\nPromote (${PROMOTE_AT}+ hits):`);
    for (const h of s.promote) console.log(`  ${h.n}x  ${h.symptom}  (last ${h.last.slice(0, 10)})`);
    console.log("\nHit once:");
    for (const h of s.hit.filter((h) => h.n < PROMOTE_AT)) console.log(`  ${h.symptom}`);
    console.log(`\nNever matchable by the hook (no quoted error text of ${MIN_NEEDLE}+ chars): ${s.unmatchable.length}`);
    for (const u of s.unmatchable) console.log(`  ${u}`);
  } else {
    try {
      hook();
    } catch {}
  }
}
