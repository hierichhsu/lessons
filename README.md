# lessons

A Claude Code skill that keeps a log of mistakes already made once, so the next session does not make them again.

Every time a bug, a failed command, a hang, a blocked action or a wrong assumption gets fixed, the agent appends one entry to `LESSONS.md`. Before writing code, debugging, running tests, deploying or driving a browser, it reads the log first.

## Install

```bash
npx skills add hierichhsu/lessons
```

Or copy by hand:

```bash
git clone https://github.com/hierichhsu/lessons.git
cp -r lessons/skills/lessons ~/.claude/skills/lessons
```

Then tell Claude Code to use it. Add to `~/.claude/CLAUDE.md` (global) or the project `CLAUDE.md`:

```markdown
# Lessons
- Before any coding, debugging, testing, deploying or browser work, load the `lessons` skill and read LESSONS.md.
- After fixing any mistake, add it to LESSONS.md before finishing.
```

## How it works

- `skills/lessons/SKILL.md` holds the rules: read before work, write after a fix, symptom first, one entry per mistake, sharpen instead of duplicate.
- `skills/lessons/LESSONS.md` is the log. It ships empty. Sections: **General**, **This machine**, and one per project.
- `/lessons` with no argument reviews the current conversation for unlogged mistakes. `/lessons <text>` logs that text as an entry.

Entry format:

```
- **<symptom, as you would notice it>** — <cause>. Do: <the rule that prevents it>. (<project or "all">, <YYYY-MM-DD>)
```

The log lives next to `SKILL.md`, so install into a skills directory you own (as above), not a plugin cache that gets replaced on update.

## License

MIT
