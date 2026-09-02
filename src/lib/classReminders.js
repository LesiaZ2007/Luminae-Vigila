/**
 * Reminder rules that belong to a class rather than to one item.
 *
 * "Remind me two days before anything due in Physics" is a fact about the class, not
 * about each task. Stating it once per class is the whole point — a rule set on
 * Physics covers the lab report you filed last month and the one you file tomorrow.
 *
 * ## Resolved, never stamped
 *
 * A rule is applied when a reminder is *evaluated*, not copied onto each task at
 * creation. This is the same argument `classCategories.js` makes for derived
 * categories, and it buys the same things: change "2 days" to "3 days" and every
 * existing task follows, clear the rule and every reminder it implied disappears —
 * with no writes, no sync traffic, and no second record of one fact to drift.
 *
 * Stamping would also have no answer for the awkward middle: a task created while the
 * rule said 2 days, edited after it said a week. Resolving has no such state.
 *
 * ## The item's own reminder wins
 *
 * A rule is a *default*. If a task carries a reminder someone set by hand, that is the
 * more specific statement of intent and it is the only one that fires — the class rule
 * neither overrides it nor stacks a second notification on top of it.
 *
 * ## Where the rules live
 *
 * On the class entry's own `reminders` field, alongside `exceptions` and for the same
 * reason: the class row is JSONB, so there is no migration.
 *
 *   reminders: {
 *     tasks: [{ ms, label }],   // before a task's due date (midnight)
 *     exams: [{ ms, label }],   // before an exam block's start time
 *   }
 *
 * Both lists are read back through `getClassRules`, which re-validates rather than
 * trusts — a malformed stored rule is dropped, not allowed to crash the cron.
 */

import { reminderLabelForMs }   from '@/lib/reminders'
import { classIdFromCategoryId } from '@/lib/classCategories'
import { getExceptions }         from '@/lib/classInstances'
import { classLinksFor, canonicalClassId, isLinkedSection, sectionIds } from '@/lib/classLinks'

const DAY  = 24 * 60 * 60_000
const WEEK = 7 * DAY

/**
 * What the editor offers.
 *
 * Tasks are due on a *date*, so anything under a day would fire at an arbitrary hour
 * of the night — the same reason `TASK_REMINDER_PRESETS` stops at one day. Exams get a
 * longer runway because they are the thing you want a week's warning about, and they
 * have a real start time to count back from.
 */
export const CLASS_REMINDER_PRESETS = {
  tasks: [1 * DAY, 2 * DAY, 3 * DAY, 1 * WEEK],
  exams: [1 * DAY, 2 * DAY, 1 * WEEK, 2 * WEEK],
}

/** The two things a class can carry rules for. */
export const CLASS_RULE_KINDS = ['tasks', 'exams']

/** Empty rules, shared so callers can compare against a stable shape. */
const NO_RULES = { tasks: [], exams: [] }

function normalizeList(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out  = []
  for (const entry of raw) {
    // A bare number is accepted as well as `{ ms }` — the editor writes objects, but
    // a hand-edited export or an older shape should not take the class's rules down.
    const ms = typeof entry === 'number' ? entry : Number(entry?.ms)
    if (!Number.isFinite(ms) || ms <= 0) continue
    const rounded = Math.round(ms)
    if (seen.has(rounded)) continue        // two chips for the same offset = one reminder
    seen.add(rounded)
    out.push({ ms: rounded, label: entry?.label || reminderLabelForMs(rounded, []) })
  }
  return out.sort((a, b) => b.ms - a.ms)   // longest lead first, which is how they read
}

/**
 * The rules a class contributes, validated.
 *
 * A disabled or deleted class contributes nothing. It is already hidden from the
 * calendar and out of the category picker, and a class you switched off notifying you
 * about its coursework is the clearest possible bug.
 */
export function getClassRules(cls) {
  if (!cls?.id || cls.enabled === false || cls.deletedAt) return NO_RULES
  const r = cls.reminders
  if (!r || typeof r !== 'object') return NO_RULES
  return { tasks: normalizeList(r.tasks), exams: normalizeList(r.exams) }
}

/** Does this class have any rule at all? Cheap gate before doing per-item work. */
export function hasClassRules(cls) {
  const r = getClassRules(cls)
  return r.tasks.length > 0 || r.exams.length > 0
}

/**
 * Class rules by class id, for the whole schedule at once.
 *
 * A section linked into another class contributes nothing, even if it has rules stored
 * from before it was linked. The merged class has one set of rules — the parent's —
 * because "remind me two days before anything due in Chemistry" is one sentence, and
 * honouring both halves would send two notifications for one deadline whenever the two
 * sections disagreed. The child's stored rules are left in place, untouched, so
 * unlinking restores them.
 */
export function classRulesById(classes = []) {
  const links = classLinksFor(classes)
  const map = new Map()
  for (const cls of classes ?? []) {
    if (!cls?.id || isLinkedSection(links, cls.id)) continue
    const rules = getClassRules(cls)
    if (rules.tasks.length || rules.exams.length) map.set(String(cls.id), rules)
  }
  return map
}

/**
 * Which class a task belongs to.
 *
 * `category` is the source of truth and `linkedClassId` is the denormalised cache of
 * it — see `classCategories.js`. Older tasks predate the category and only have the
 * link, so both are consulted, in that order.
 *
 * Pass the schedule as `classes` to have a linked section resolved onto the class it
 * merges into. That is what makes the lab's tasks and the lecture's tasks one list
 * everywhere they are grouped by class, with nothing rewritten — see `classLinks.js`.
 * Omitting it gives the raw stored id, which is what a caller wants when it is asking
 * "which entry did this actually name".
 */
export function classIdForTodo(todo, classes) {
  const fromCategory = classIdFromCategoryId(todo?.category)
  const raw = fromCategory ? String(fromCategory)
            : todo?.linkedClassId ? String(todo.linkedClassId)
            : null
  if (!raw || classes === undefined) return raw
  return canonicalClassId(classLinksFor(classes), raw)
}

/**
 * The reminders that should actually fire for an item.
 *
 * @param {object} item   A todo or a Canvas assignment — anything with a `reminder`.
 * @param {object} rules  From `getClassRules`, or null for a class with none.
 * @param {'tasks'|'exams'} kind
 * @returns {Array<{ms?:number, at?:string, label:string, fromClass?:boolean}>}
 */
export function effectiveReminders(item, rules, kind = 'tasks') {
  if (item?.reminder) return [item.reminder]
  const list = rules?.[kind]
  if (!Array.isArray(list) || list.length === 0) return []
  return list.map(r => ({ ...r, fromClass: true }))
}

/**
 * Every exam this class holds, as an instant.
 *
 * An exam block stores only the fields that differ from the class period, so a missing
 * `startTime` means "the usual hour" and is filled in from the class here — the same
 * inheritance the calendar does when it paints the block. An exam with no time to
 * inherit either is skipped rather than guessed at.
 *
 * Local-time ISO with no `Z`, matching what the modals store and what
 * `reminderFireTime` parses: an exam happens at 9am where you are.
 */
export function examOccurrences(cls) {
  if (!cls?.id || cls.enabled === false || cls.deletedAt) return []
  const { exams } = getExceptions(cls)
  const out = []
  for (const exam of exams) {
    const startTime = exam.startTime || cls.startTime
    if (!startTime || typeof startTime !== 'string' || startTime.length < 4) continue
    out.push({
      classId:   String(cls.id),
      className: cls.courseName || 'Class',
      date:      exam.date,
      title:     exam.title || `${cls.courseName || 'Class'} exam`,
      startIso:  `${exam.date}T${startTime}:00`,
      color:     cls.color || null,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The dedup key for one fired reminder.
 *
 * The offset is part of the key, not just the fire time: two rules on one class ("a
 * week before" and "the day before") are two distinct notifications, and keying only
 * on the instant would let a rescheduled item collide with itself. `at` is included
 * for the same reason the existing keys include it — move the due date and the
 * reminder is a new one that deserves to fire.
 */
export function classReminderKey(kind, id, ms, at) {
  return `${kind}-${id}-cls${ms}-${at}`
}

/**
 * Fire time for a class-derived reminder, or null.
 *
 * Mirrors `reminderFireTime` in the push cron — an absolute reminder ignores the
 * offset, a relative one counts back from the item's own time.
 */
export function fireTimeFor(reminder, dueIso) {
  if (!reminder) return null
  if (reminder.at) {
    const t = new Date(reminder.at).getTime()
    return Number.isNaN(t) ? null : t
  }
  if (!dueIso || typeof reminder.ms !== 'number') return null
  const due = new Date(dueIso).getTime()
  return Number.isNaN(due) ? null : due - reminder.ms
}

/** A task is due at midnight on its date — the same convention the cron uses. */
export function todoDueIso(todo) {
  return todo?.dueDate ? `${todo.dueDate}T00:00:00` : null
}

/**
 * Every reminder that should fire for one user, from their classes' rules alone.
 *
 * Shared by the client checker and the push cron so the two cannot disagree about
 * what a rule means. Items carrying their own reminder are skipped entirely: those are
 * already handled by the ordinary per-item path in both callers, and emitting them
 * here would double every hand-set reminder.
 *
 * @param {object[]} classes     Class schedule entries.
 * @param {object[]} todos       Tasks. Completed and deleted ones are skipped.
 * @param {object[]} assignments Canvas assignments (client only — the server never
 *                               stores them). Matched by the class's `canvasCourseId`.
 *
 * Linked sections are resolved throughout: a rule set on the lecture covers the lab's
 * tasks, the lab's Canvas course and the lab's exams, because they are one class. Only
 * the parent carries rules (see `classRulesById`), so nothing fires twice.
 */
export function classReminderCandidates({ classes = [], todos = [], assignments = [] } = {}) {
  const rulesById = classRulesById(classes)
  if (rulesById.size === 0) return []

  const links = classLinksFor(classes)
  const byId  = new Map((classes ?? []).filter(c => c?.id).map(c => [String(c.id), c]))
  const out   = []

  // ── Tasks ──
  for (const td of todos ?? []) {
    if (!td?.id || td.completed || td.deletedAt || td.reminder) continue
    const classId = classIdForTodo(td, classes)
    if (!classId) continue
    const rules = rulesById.get(classId)
    if (!rules?.tasks.length) continue
    const dueIso = todoDueIso(td)
    if (!dueIso) continue
    const className = byId.get(classId)?.courseName || 'Class'
    for (const rule of rules.tasks) {
      const at = fireTimeFor(rule, dueIso)
      if (at == null) continue
      out.push({
        key:   classReminderKey('td', td.id, rule.ms, at),
        at,
        title: `${className} — ${td.title || 'Task'}`,
        body:  rule.label,
      })
    }
  }

  // ── Canvas assignments, via the class's optional Canvas link ──
  // Every section's Canvas course points at the merged class's rules — a lab with its
  // own Canvas course is still the class the rule was written about.
  const byCanvasCourse = new Map()
  for (const [classId, rules] of rulesById) {
    for (const sectionId of sectionIds(links, classId)) {
      const canvasCourseId = byId.get(sectionId)?.canvasCourseId
      if (canvasCourseId == null) continue
      byCanvasCourse.set(String(canvasCourseId), { classId, rules })
    }
  }
  if (byCanvasCourse.size > 0) {
    for (const a of assignments ?? []) {
      if (!a?.id || a.reminder || a.done) continue
      if (a.submissionState === 'graded' || a.submissionState === 'submitted') continue
      if (!a.dueAt) continue
      const match = byCanvasCourse.get(String(a.courseId))
      if (!match?.rules.tasks.length) continue
      const className = byId.get(match.classId)?.courseName || a.courseName || 'Class'
      for (const rule of match.rules.tasks) {
        const at = fireTimeFor(rule, a.dueAt)
        if (at == null) continue
        out.push({
          key:   classReminderKey('cv', a.id, rule.ms, at),
          at,
          title: `${className} — ${a.title || 'Assignment'}`,
          body:  rule.label,
        })
      }
    }
  }

  // ── Exams, from every section of the class ──
  for (const [classId, rules] of rulesById) {
    if (!rules.exams.length) continue
    for (const sectionId of sectionIds(links, classId)) {
      for (const exam of examOccurrences(byId.get(sectionId))) {
        for (const rule of rules.exams) {
          const at = fireTimeFor(rule, exam.startIso)
          if (at == null) continue
          out.push({
            // Keyed on the *section* the exam sits on, not on the merged class: two
            // sections can hold an exam on one date, and collapsing the key would
            // silently drop the second one.
            key:   classReminderKey('ex', `${sectionId}-${exam.date}`, rule.ms, at),
            at,
            title: `${exam.className} — ${exam.title}`,
            body:  rule.label,
          })
        }
      }
    }
  }

  return out
}

/** "1 week and 2 days before" — the editor's summary line. */
export function describeRules(list = []) {
  const labels = list.map(r => (r.label || reminderLabelForMs(r.ms, [])).replace(/ before$/, ''))
  if (labels.length === 0) return ''
  if (labels.length === 1) return `${labels[0]} before`
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} before`
}
