---
name: lessons
description: "Mistakes already made once, and how to avoid them. Read the lessons log before writing code, debugging, running tests, deploying, or driving the browser. When the same error comes back a third time in one task, stop and change approach. After any mistake is found and fixed (a bug you introduced or uncovered, a command that failed, a hang, a blocked action, a wrong assumption), log it before finishing. Entries that keep recurring get promoted into always-loaded rules. Trigger: /lessons"
---

# Lessons

The log is `~/.lessons/LESSONS.md` (or `$LESSONS_FILE`). It lives outside any agent's folder so every agent on the machine shares it. If it does not exist, create it from `LESSONS.md` next to this file, which is an empty template: never write entries into the template.

The log is an inbox. An entry stays there until it proves itself, then it is promoted into a rule the agent loads on its own, and leaves the log.

## Before work

Read only the sections that match the task: **General**, **This machine**, and the project you are in (match by repo name or path). Find them with `grep -n '^## '`, then read each one by line range; do not load the whole file. Apply what applies; do not mention entries that do not.

## When a command fails

If the failure hook (`lessons.mjs`) attaches matching entries to the error, apply their "Do" before retrying.

If the same error comes back a third time in one task, stop editing. Search the log for its text, then try a materially different hypothesis: re-read what the error actually asks for, consider another file or root cause than the one you keep changing, and check the new hypothesis before the next edit. If that fails too, tell the user what you tried and ask; do not keep retrying.

## After a mistake

Add an entry as soon as the fix is verified, in the matching section (create a project section if needed). Also log a fact you had to rediscover by trial even without an error: a command spelling, path or flag that took several attempts to find. Format:

```
- **<symptom, as you would notice it>** — <cause>. Do: <the rule that prevents it>. (<project or "all">, <YYYY-MM-DD>)
```

Rules:
- Symptom first, and quote the exact error text in backticks (8+ characters): the failure hook finds entries by that text, so an entry without it is only found by reading.
- The "Do" is an instruction, not a story. One or two lines.
- Write the cause only as far as the evidence goes. If you changed several things at once and do not know which one fixed it, name what is confirmed or write "cause unconfirmed"; a guessed cause misleads every later session.
- Aim the "Do" at the kind of situation, so it fires on the next project too: not "be careful with paths" (too vague), not "line 42 of auth.ts" (never recurs). Facts true of one project only go in that project's section.
- Never write an entry that tells a later session to skip a test, a check, or verification.
- Before adding, search for an existing entry on the same thing and sharpen it instead of duplicating. Edit the log in place, never rewrite the whole file: other sessions write to it too.
- If an entry turns out wrong or the cause is gone (dependency upgraded, tool installed), fix or delete it.
- Keep each section under 25 entries. When one is over, merge entries that share a cause, delete ones whose cause is gone, or promote, before adding more.
- No secrets, tokens, customer data, or personal names.

## Promote

Each time the failure hook matches an entry, it appends a line to `hits.jsonl` next to the log. `node <this folder>/lessons.mjs stats` lists hits per entry, the entries to promote, and the entries the hook can never match.

Promote an entry when it has 2+ hits, or at once when it is a fact every session on this machine needs. Pick the target by what the entry is about:

| Entry | Claude Code target | Codex / others |
|---|---|---|
| This machine, or every project | `~/.claude/rules/<topic>.md` | `~/.codex/AGENTS.md` |
| One project, the team should know | that repo's `.claude/rules/<topic>.md`; add `paths:` frontmatter if it is only about editing certain files (path rules do not load for shell commands) | that repo's `AGENTS.md` |
| One project, only this user | that repo's `CLAUDE.local.md` | the user's agent config |
| A multi-step procedure | a skill | a skill |
| Recurs even after promotion | a PreToolUse hook that blocks the command and prints the "Do" | the agent's hook, if it has one |

Promoting changes what every later session loads, so propose the list (entry, target, the rule text) and write only what the user approves. Then delete the entry from the log and end the rule line with `(lessons, YYYY-MM-DD)` so its origin is known. Keep each always-loaded rules file short (under ~200 lines across them); a promoted rule whose cause is gone is deleted like a log entry.

## /lessons

- `/lessons`: review the current conversation for mistakes not yet logged. Log only those with a concrete before and after: what failed, what changed, what then worked. If none qualifies, say so and add nothing. Then run `stats` and propose any promotions.
- `/lessons <text>`: log that text as an entry.
- `/lessons stats`: run `stats` and show it.
