// Two jobs, no dependencies:
//   hook   (default; stdin = a hook payload):
//          PostToolUseFailure: find log entries whose symptom quotes text that appears in the failure,
//          hand them to the agent, and append one line per hit to hits.jsonl. A hit means a logged
//          mistake happened again: that is the promotion signal.
//          SessionStart: warn when the log needs compaction (a section over the cap, or a section
//          header that appears twice), so the agent compacts before adding more.
//   stats  print hits per entry, entries to review (hit twice in one session: the "Do" did not work),
//          promotion candidates (hit in 2+ sessions), stale entries, and entries the hook can never match.
//   check <draft entry>  print existing entries that overlap the draft, so it is sharpened instead of duplicated.
// Any failure in hook mode prints nothing; a session must never break because of this file.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PROMOTE_AT = 2;
export const SECTION_CAP = 25;
export const STALE_DAYS = 30; // an entry this old with no hit is reviewed: promote, add an error quote, or delete
const MIN_NEEDLE = 8; // shorter quotes ("pnpm", "&") match unrelated failures
const MAX_SHOWN = 3;

export const logPath = () => process.env.LESSONS_FILE || join(homedir(), ".lessons", "LESSONS.md");
const hitsPath = (log) => join(dirname(log), "hits.jsonl");

export function entries(text) {
  const out = [];
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) section = line.slice(3).trim();
    if (!line.startsWith("- **")) continue;
    const end = line.indexOf("**", 4);
    const symptom = end > 0 ? line.slice(4, end) : line.slice(4);
    const needles = [...symptom.matchAll(/`([^`]+)`|"([^"]+)"/g)]
      .map((m) => (m[1] ?? m[2]).trim())
      .filter((s) => s.length >= MIN_NEEDLE);
    const date = line.match(/, (\d{4}-\d{2}-\d{2})\)\s*$/)?.[1] || "";
    out.push({ line, symptom, needles, section, date });
  }
  return out;
}

// Shells and people quote differently (bash prints `&' where an entry says '&'), so compare without quotes.
const norm = (s) => s.toLowerCase().replace(/[`'"‘’“”]/g, "").replace(/\s+/g, " ");

export function match(text, failure) {
  const hay = norm(failure);
  return entries(text).filter((e) => e.needles.some((n) => hay.includes(norm(n))));
}

// Quoted strings in a new entry, so `check` can find old entries that mention the same thing.
const quotes = (s) =>
  [...s.matchAll(/`([^`]+)`|"([^"]+)"/g)].map((m) => (m[1] ?? m[2]).trim()).filter((q) => q.length >= MIN_NEEDLE);

// Old entries that overlap a new one: their quoted text appears in it, or its quoted text appears in them.
export function check(text, draft) {
  const mine = quotes(draft).map(norm);
  return entries(text).filter(
    (e) => e.needles.some((n) => norm(draft).includes(norm(n))) || mine.some((q) => norm(e.line).includes(q)),
  );
}

// Old hit lines have no session; a day is the closest stand-in.
const sessionOf = (h) => h.session_id || h.ts.slice(0, 10);

export function stats(text, hitLines, today = new Date()) {
  const count = new Map(); // symptom -> { n, last, sessions: Map<session, hits in it> }
  for (const l of hitLines) {
    try {
      const h = JSON.parse(l);
      const c = count.get(h.symptom) || { n: 0, last: "", sessions: new Map() };
      const s = sessionOf(h);
      c.sessions.set(s, (c.sessions.get(s) || 0) + 1);
      count.set(h.symptom, { ...c, n: c.n + 1, last: h.ts > c.last ? h.ts : c.last });
    } catch {}
  }
  const all = entries(text);
  const hit = all
    .filter((e) => count.has(e.symptom))
    .map((e) => ({ symptom: e.symptom, ...count.get(e.symptom) }))
    .sort((a, b) => b.n - a.n);
  // Hit twice in one session means the "Do" was applied and did not prevent the repeat: revise, do not promote.
  const review = hit.filter((h) => [...h.sessions.values()].some((n) => n >= 2));
  const reviewed = new Set(review.map((h) => h.symptom));
  const headers = text.split(/\r?\n/).filter((l) => l.startsWith("## ")).map((l) => l.trim());
  const perSection = new Map();
  for (const e of all) perSection.set(e.section, (perSection.get(e.section) || 0) + 1);
  const cutoff = new Date(today.getTime() - STALE_DAYS * 86400e3).toISOString().slice(0, 10);
  return {
    total: all.length,
    promote: hit.filter((h) => h.sessions.size >= PROMOTE_AT && !reviewed.has(h.symptom)),
    review,
    hit,
    unmatchable: all.filter((e) => !e.needles.length).map((e) => e.symptom),
    stale: all.filter((e) => e.date && e.date <= cutoff && !count.has(e.symptom)).map((e) => e.symptom),
    oversized: [...perSection].filter(([, n]) => n > SECTION_CAP).map(([section, n]) => ({ section, n })),
    dupHeaders: [...new Set(headers.filter((h, i) => headers.indexOf(h) !== i))],
  };
}

function readLog(log) {
  const text = existsSync(log) ? readFileSync(log, "utf8") : "";
  const hits = existsSync(hitsPath(log)) ? readFileSync(hitsPath(log), "utf8").split("\n").filter(Boolean) : [];
  return { text, hits };
}

export function sessionWarning(log, s) {
  const problems = [
    ...s.oversized.map((o) => `section "${o.section}" has ${o.n} entries (cap ${SECTION_CAP})`),
    ...s.dupHeaders.map((h) => `section header "${h}" appears more than once`),
  ];
  if (!problems.length) return "";
  return (
    `Lessons log ${log} needs compaction before any new entry is added: ${problems.join("; ")}. ` +
    `Merge entries that share a cause, delete ones whose cause is gone, or propose promotions to the user; edit in place, never rewrite the file.`
  );
}

function hook() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const log = logPath();
  if (input.is_interrupt || !existsSync(log)) return;
  const emit = (hookEventName, additionalContext) =>
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }));
  if (input.hook_event_name === "SessionStart") {
    const { text, hits } = readLog(log);
    const warning = sessionWarning(log, stats(text, hits));
    if (warning) emit("SessionStart", warning);
    return;
  }
  const failure = `${input.error || ""}\n${input.tool_input?.command || ""}`;
  const { text, hits } = readLog(log);
  const found = match(text, failure).slice(0, MAX_SHOWN);
  if (!found.length) return;
  const ts = new Date().toISOString();
  const session_id = input.session_id || "";
  const seen = new Set(
    hits.flatMap((l) => {
      try {
        const h = JSON.parse(l);
        return session_id && h.session_id === session_id ? [h.symptom] : [];
      } catch {
        return [];
      }
    }),
  );
  appendFileSync(
    hitsPath(log),
    found.map((e) => JSON.stringify({ ts, symptom: e.symptom, tool: input.tool_name, cwd: input.cwd, session_id })).join("\n") + "\n",
  );
  const fresh = found.filter((e) => !seen.has(e.symptom));
  const repeat = found.filter((e) => seen.has(e.symptom));
  emit(
    "PostToolUseFailure",
    (fresh.length
      ? `This failure matches mistakes already logged in ${log}. Apply the "Do" before retrying:\n${fresh.map((e) => e.line).join("\n")}\n`
      : "") +
      (repeat.length
        ? `These entries already matched earlier in this session, so their "Do" did not prevent the repeat. Do not apply it again: find the real cause, then rewrite the entry's cause and "Do" in ${log}:\n${repeat.map((e) => e.line).join("\n")}\n`
        : "") +
      `Run \`node <lessons skill>/lessons.mjs stats\` at the end and propose promoting entries hit in ${PROMOTE_AT}+ sessions.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (process.argv[2] === "stats") {
    const log = logPath();
    const { text, hits } = readLog(log);
    const s = stats(text, hits);
    console.log(`${log}: ${s.total} entries, ${hits.length} hits`);
    console.log(`\nReview (hit twice in one session: the "Do" did not prevent the repeat; rewrite cause and "Do"):`);
    for (const h of s.review) console.log(`  ${h.n}x  ${h.symptom}  (last ${h.last.slice(0, 10)})`);
    console.log(`\nPromote (hit in ${PROMOTE_AT}+ sessions):`);
    for (const h of s.promote) console.log(`  ${h.sessions.size} sessions  ${h.symptom}  (last ${h.last.slice(0, 10)})`);
    console.log("\nHit in one session:");
    for (const h of s.hit.filter((h) => h.sessions.size < PROMOTE_AT && !s.review.includes(h))) console.log(`  ${h.symptom}`);
    console.log(`\nStale (${STALE_DAYS}+ days, 0 hits; promote, add an error quote, or delete): ${s.stale.length}`);
    for (const u of s.stale) console.log(`  ${u}`);
    console.log(`\nNever matchable by the hook (no quoted error text of ${MIN_NEEDLE}+ chars): ${s.unmatchable.length}`);
    for (const u of s.unmatchable) console.log(`  ${u}`);
    const warning = sessionWarning(log, s);
    if (warning) console.log(`\n${warning}`);
  } else if (process.argv[2] === "check") {
    const log = logPath();
    const found = check(readLog(log).text, process.argv.slice(3).join(" "));
    console.log(found.length ? `Overlapping entries in ${log}; sharpen one of these instead of adding:\n${found.map((e) => e.line).join("\n")}` : "No overlapping entry.");
  } else {
    try {
      hook();
    } catch {}
  }
}
