# lessons

A skill that keeps a log of mistakes your coding agent has already made once, hands the fix back the moment the same error shows up again, and promotes the entries that keep recurring into rules the agent loads on its own.

The log starts empty and grows with your own work. The point is not to solve everything up front, but to make each mistake happen fewer times than the last.

## How it works

1. **Log.** After a mistake is fixed, the agent adds one entry to `~/.lessons/LESSONS.md`: the symptom (with the exact error text), the cause as far as the evidence goes, and a "Do" rule.
2. **Match.** A failure hook reads every failed tool call. If the error contains text quoted in an entry's symptom, the entry is attached to the error before the agent retries, and the hit is recorded in `~/.lessons/hits.jsonl`.
3. **Review.** An entry hit twice in the same session means its "Do" was applied and did not prevent the repeat. The hook says so instead of repeating the "Do", and `stats` lists the entry for rewriting. Before adding an entry, `lessons.mjs check "<draft>"` lists the old entries that quote the same text, so a finding sharpens or corrects an entry instead of duplicating it.
4. **Promote.** An entry hit in 2+ different sessions keeps happening, so a log is not enough. `/lessons` proposes moving it into an always-loaded rule (`~/.claude/rules/`, a repo's `.claude/rules/`, `AGENTS.md`), a skill, or, if it still recurs, a blocking hook. You approve each one; the entry then leaves the log.
5. **Retire.** Entries and rules whose cause is gone (tool upgraded, dependency fixed) are deleted. An entry 30+ days old with no hit, or one with no error text the hook could match, is promoted, rewritten, or deleted at the next `/lessons` review. Each log section stays under 25 entries; a session-start hook warns when one is over.

The log sits outside any agent's folder, so Claude Code, Codex and others on the same machine share one log.

## Install

```bash
npx skills add hierichhsu/lessons
```

Or copy by hand:

```bash
git clone https://github.com/hierichhsu/lessons.git
cp -r lessons/skills/lessons ~/.claude/skills/lessons
```

Tell the agent to use it. Add to `~/.claude/CLAUDE.md` (or `AGENTS.md` for Codex):

```markdown
# Lessons
- Before any coding, debugging, testing, deploying or browser work, load the `lessons` skill and read the matching sections of the log.
- After fixing any mistake, log it before finishing.
```

Then add the hooks to `~/.claude/settings.json` (needs Node.js). The same script serves both events: on a failed tool call it attaches matching entries; at session start it warns when the log needs compaction.

```json
"hooks": {
  "PostToolUseFailure": [
    { "matcher": "*", "hooks": [{ "type": "command", "command": "node ~/.claude/skills/lessons/lessons.mjs", "timeout": 10 }] }
  ],
  "SessionStart": [
    { "hooks": [{ "type": "command", "command": "node ~/.claude/skills/lessons/lessons.mjs", "timeout": 10 }] }
  ]
}
```

On Windows, write the full path, for example `node \"C:/Users/<you>/.claude/skills/lessons/lessons.mjs\"`.

Codex has no failure event, so on Codex only the skill and the log work for now.

## Commands

- `/lessons`: review the conversation for unlogged mistakes, then propose promotions.
- `/lessons <text>`: log that text.
- `/lessons stats` (or `node ~/.claude/skills/lessons/lessons.mjs stats`): hits per entry, entries to review, promotion candidates, stale entries, entries the hook can never match, and sections over the cap.
- `node ~/.claude/skills/lessons/lessons.mjs check "<draft entry>"`: existing entries that overlap the draft.

Entry format:

```
- **<symptom, with the exact error text in backticks>** — <cause>. Do: <the rule that prevents it>. (<project or "all">, <YYYY-MM-DD>)
```

## Tests

```bash
node --test test/
```

## License

MIT
