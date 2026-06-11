---
name: luminae-vigila-orchestration
description: How parallel feature work is orchestrated for Luminae Vigila (worktrees + agents + integration branch)
metadata:
  type: project
---

Luminae Vigila multi-feature workflow that worked well:

- Spawn parallel **Sonnet** subagents, one per feature, each in its own **git worktree** created under `%LOCALAPPDATA%\Temp\lv-wt\<name>` (NOT under `.claude/worktrees` — that path is a read-only OneDrive reparse point and `git worktree add` there fails with EEXIST/permission errors).
- Each agent works on its own `feature/*` branch; orchestrator merges them one at a time into `integration/all-features`, resolving README/page.js/FocusTimer.js conflicts by hand (those are the common collision files).
- After merging, run `npm run build` to verify, then restart dev server (`npm run dev`). If dev server dies citing a stale `instrumentation.js` (leftover from dropped Sentry branch), delete `.next` and restart.
- Worktree cleanup on Windows: `git worktree remove` can hit "Permission denied" — run `attrib -r .git\worktrees\* /s /d` then `git worktree prune`.

Known Rules-of-Hooks trap: FocusTimer.js has an `if (!open) return` early return — any new hook (useMemo etc.) MUST go above it, or opening/closing the timer crashes with "Rendered more hooks than during the previous render."

Wave 1 (merged + pushed) and wave 2 (built) features, wave 3 plan: see [[wave3-custom-lists-plan]].
