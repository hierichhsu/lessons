---
name: lessons
description: "Mistakes already made once, and how to avoid them. Read LESSONS.md before writing code, debugging, running tests, deploying, or driving the browser on this machine. After any mistake is found and fixed (a bug you introduced or uncovered, a command that failed, a hang, a blocked action, a wrong assumption), add it to LESSONS.md before finishing. Trigger: /lessons"
---

# Lessons

`LESSONS.md` (next to this file) is the log. One entry per mistake, written so the next session avoids it without rediscovering it.

## Before work

Read `LESSONS.md`. Check the sections that match the task: **General**, **This machine**, and the project you are in (match by repo name or path). Apply what applies; do not mention entries that do not.

## After a mistake

Add an entry as soon as the fix is verified, in the matching section (create a project section if needed). Format:

```
- **<symptom, as you would notice it>** — <cause>. Do: <the rule that prevents it>. (<project or "all">, <YYYY-MM-DD>)
```

Rules:
- Symptom first, so it is found by what you see, not by what you already know.
- The "Do" is an instruction, not a story. One or two lines.
- Before adding, search for an existing entry on the same thing and sharpen it instead of duplicating.
- If an entry turns out wrong or the cause is gone (dependency upgraded, tool installed), fix or delete it.
- If a logged mistake happens again, the entry failed: its symptom was not recognisable or its "Do" was not specific enough. Rewrite that entry; never add a second one.
- No secrets, tokens, customer data, or personal names.

## /lessons

When the user runs `/lessons` with no argument, review the current conversation for mistakes not yet logged and add them. With an argument, log that as an entry.
