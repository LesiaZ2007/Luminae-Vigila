---
name: wave3-custom-lists-plan
description: Approved wave 3 feature plan — Custom Lists (lightweight checklists) for Luminae Vigila
metadata:
  type: project
---

Wave 3 for Luminae Vigila (approved by user 2026-06-11): **Custom Lists** — lightweight standalone checklists alongside the existing To-Do.

- **Structure:** main To-Do (tasks + Canvas) stays untouched. Add a list switcher in the Todo area: `[ My Tasks ] [ Groceries ] [ Amazon ] [ + ]`. Custom lists are NOT wired into calendar/GPA/Corvus planner — just clean checklists.
- **Items:** text + checkbox by default; optional per-item due date or note via a small "⋯". No priorities/subtasks/categories.
- **Sync & cleanup:** sync through Neon (new additive `custom_lists` table, same atomic pattern as todos); delete-whole-list and clear-checked-items affordances; localStorage for signed-out users.
- **Reuse from wave 1:** drag-to-reorder handle, swipe-to-complete/delete gestures. Per-list emoji/icon (🛒 / 📦).

**Sequencing (important):** do NOT branch wave 3 until wave 2 is merged into `integration/all-features`. Wave 3 heavily edits `TodoPanel.js` and `page.js`, which wave 2's quick-add omnibar + recap/badge features also touch. Branch wave 3 from the clean post-wave-2 base.

Orchestration approach used this project: parallel Sonnet agents in git worktrees under `%LOCALAPPDATA%\Temp\lv-wt\`, one feature branch each, merged sequentially into `integration/all-features`. See [[luminae-vigila-orchestration]].
