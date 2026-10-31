# lessons

A skill that keeps a log of mistakes your coding agent has already made once, hands the fix back the moment the same error shows up again, and promotes the entries that keep recurring into rules the agent loads on its own.

The log starts empty and grows with your own work. The point is not to solve everything up front, but to make each mistake happen fewer times than the last.

## How it works

1. **Log.** After a mistake is fixed, the agent adds one entry to `~/.lessons/LESSONS.md`: the symptom (with the exact error text), the cause as far as the evidence goes, and a "Do" rule.
2. **Match.** A failure hook reads every failed tool call. If the error contains text quoted in an entry's symptom, the entry is attached to the error before the agent retries, and the hit is recorded in `~/.lessons/hits.jsonl`.
3. **Promote.** An entry with 2+ hits keeps happening, so a log is not enough. `/lessons` proposes moving it into an always-loaded rule (`~/.claude/rules/`, a repo's `.claude/rules/`, `AGENTS.md`), a skill, or, if it still recurs, a blocking hook. You approve each one; the entry then leaves the log.
4. **Retire.** Entries and rules whose cause is gone (tool upgraded, dependency fixed) are deleted, and each log section stays under 25 entries.

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

Then add the failure hook to `~/.claude/settings.json` (needs Node.js):

```json
"hooks": {
  "PostToolUseFailure": [
    { "matcher": "*", "hooks": [{ "type": "command", "command": "node ~/.claude/skills/lessons/lessons.mjs", "timeout": 10 }] }
  ]
}
```

On Windows, write the full path, for example `node \"C:/Users/<you>/.claude/skills/lessons/lessons.mjs\"`.

Codex has no failure event, so on Codex only the skill and the log work for now.

## Commands

- `/lessons`: review the conversation for unlogged mistakes, then propose promotions.
- `/lessons <text>`: log that text.
- `/lessons stats` (or `node ~/.claude/skills/lessons/lessons.mjs stats`): hits per entry, promotion candidates, and entries the hook can never match.

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
