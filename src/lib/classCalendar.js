/**
 * Everything with a due date, from every class, on one calendar.
 *
 * The class cards answer "what is the state of Physics?". They are the wrong shape for
 * the other question a student actually asks — *"what is coming at me, and when?"* —
 * because that one crosses classes. Answering it from the cards means opening five of
 * them and holding five lists in your head to notice that three things land on
 * Thursday.
 *
 * So this flattens the three kinds of coursework into one dated stream:
 *
 *   'exam'        a class period marked as an exam, from `exceptions.exams`
 *   'assignment'  a Canvas assignment
 *   'task'        a task filed under a class
 *
 * Ordinary class meetings are deliberately absent. A calendar showing every lecture is
 * the *calendar tab*, and it drowns the four things that actually have deadlines under
 * forty that recur every week.
 *
 * Dates are local `YYYY-MM-DD` throughout, for the same reason they are everywhere else
 * here: a deadline lands on a calendar day, and anchoring to an instant moves that day
 * across a timezone boundary. Note that `toISOString().slice(0, 10)` — which is how the
 * mini month navigator does it — is exactly the bug this avoids: it yields the *UTC*
 * day, so anything after 7pm in New York is filed on tomorrow.
 */

import { toYMDLocal }      from '@/lib/calendarView'
import { isDateStr }       from '@/lib/classInstances'
import { classIdForTodo }  from '@/lib/classReminders'
import { getCourseColor }  from '@/lib/courseColors'
import { classLinksFor, canonicalClassId } from '@/lib/classLinks'
import { isCompleted }     from '@/components/AssignmentRow'

const DEFAULT_COLOR = '#3a6fa8'

/** Exams read first on a day, then Canvas work, then your own tasks. */
const KIND_ORDER = { exam: 0, assignment: 1, task: 2 }

/** The local calendar day something falls on, whatever shape its date arrived in. */
export function localDayOf(value) {
  if (!value) return null
  if (typeof value === 'string' && !value.endsWith('Z') && !/[+-]\d\d:\d\d$/.test(value)) {
    // A plain date, or a local-ISO carrying no zone — the day is the prefix, and
    // parsing it would only risk handing it back shifted. Validated rather than
    // trusted, so junk falls through to the parser instead of being returned as a date.
    const prefix = value.slice(0, 10)
    if (isDateStr(prefix)) return prefix
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : toYMDLocal(d)
}

/**
 * Flatten a term's coursework into dated items.
 *
 * Undated work is left out rather than bucketed somewhere arbitrary — a task with no
 * due date is not urgent, it is unscheduled, and it belongs on the class card.
 */
export function buildCourseworkItems({
  classes = [], todos = [], assignments = [], classEvents = [], courseColors = {},
} = {}) {
  const byId  = new Map(classes.filter(c => c?.id).map(c => [String(c.id), c]))
  const links = classLinksFor(classes)

  /* A linked section's work is filed under the class it merges into — same name, same
     colour, one entry in the legend. The meeting *times* stay separate, which is the
     calendar tab's business; this calendar only ever showed things with deadlines. */
  const merged = id => byId.get(canonicalClassId(links, id))

  const byCourse = new Map()
  for (const c of classes) {
    if (c?.canvasCourseId != null) byCourse.set(String(c.canvasCourseId), merged(c.id) ?? c)
  }

  const items = []

  // ── Tasks filed under a class ──
  for (const td of todos) {
    if (!td?.id || td.deletedAt || !td.dueDate) continue
    const classId = classIdForTodo(td, classes)
    if (!classId) continue
    const cls = byId.get(classId)
    // A task pointing at a class that was deleted keeps its own colour rather than
    // vanishing — the same forgiving read the task rows do.
    items.push({
      id:        `task:${td.id}`,
      kind:      'task',
      date:      td.dueDate,
      title:     td.title || 'Task',
      className: cls?.courseName ?? null,
      classId,
      color:     cls?.color || DEFAULT_COLOR,
      done:      !!td.completed,
      ref:       td,
    })
  }

  // ── Canvas assignments ──
  for (const a of assignments) {
    if (!a?.id || !a.dueAt) continue
    const date = localDayOf(a.dueAt)
    if (!date) continue
    const cls = byCourse.get(String(a.courseId))
    items.push({
      id:        `assignment:${a.id}`,
      kind:      'assignment',
      date,
      title:     a.title || 'Assignment',
      className: cls?.courseName ?? a.courseName ?? null,
      classId:   cls ? String(cls.id) : null,
      color:     cls?.color || getCourseColor(a.courseId, courseColors),
      done:      isCompleted(a),
      ref:       a,
    })
  }

  // ── Exams, which are class meetings wearing a different hat ──
  for (const ev of classEvents) {
    if (!ev?.extendedProps?.isExam) continue
    const date = localDayOf(ev.start)
    if (!date) continue
    const classId = ev.extendedProps.classId != null
      ? canonicalClassId(links, ev.extendedProps.classId)
      : null
    items.push({
      id:        `exam:${ev.id}`,
      kind:      'exam',
      date,
      title:     ev.title || 'Exam',
      className: byId.get(classId)?.courseName ?? ev.extendedProps.courseName ?? null,
      classId,
      color:     ev.color || DEFAULT_COLOR,
      done:      false,
      ref:       ev,
    })
  }

  /* Within a day: what is still outstanding, then what is finished.
     Ahead of the kind order, deliberately. A day cell shows the first few items and
     hides the rest behind "+3 more", so with finished work sorted in among the rest a
     day where you had already done the reading could show three ticked-off chips and
     hide the essay. What is left to do is the question the grid is being asked.
     Exams are never done, so they keep their place at the front of the outstanding
     ones rather than being displaced by this. */
  return items.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    Number(!!a.done) - Number(!!b.done) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.title.localeCompare(b.title),
  )
}

/**
 * How much of a day's work is behind you: `{ done, total }`.
 *
 * Exams are counted in the total but can never be done — you do not tick off an exam,
 * it happens to you — so a day holding one never reads 3/3. That is honest rather than
 * annoying: the exam is still ahead of you, and a day that claims to be finished while
 * an exam sits on it would be the wrong kind of reassurance.
 */
export function dayProgress(items = []) {
  let done = 0
  for (const it of items) if (it?.done) done++
  return { done, total: (items ?? []).length }
}

/** The same items keyed by day, which is how a month grid wants them. */
export function groupByDate(items = []) {
  const map = new Map()
  for (const it of items) {
    if (!map.has(it.date)) map.set(it.date, [])
    map.get(it.date).push(it)
  }
  return map
}

/**
 * The cells of a month grid: whole weeks, Sunday-first, covering the month.
 *
 * Six rows when the month needs them and five when it does not, so February does not
 * leave a blank row — and always whole weeks, so the columns stay under their headers.
 */
export function monthGrid(year, month) {
  const first    = new Date(year, month, 1)
  const startDay = first.getDay()
  const daysIn   = new Date(year, month + 1, 0).getDate()
  const weeks    = Math.ceil((startDay + daysIn) / 7)

  const cells = []
  const cur   = new Date(year, month, 1 - startDay)
  for (let i = 0; i < weeks * 7; i++) {
    cells.push({
      date:      toYMDLocal(cur),
      dayOfMonth: cur.getDate(),
      inMonth:   cur.getMonth() === month,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return cells
}

/**
 * How much a single item weighs on the day it lands.
 *
 * A day showing four chips tells you *that* Thursday is busy, not that it is four big
 * things. This is the crude correction for that.
 *
 * An exam is worth three: it is the thing you reorganise a week around, and it carries
 * the revision that does not appear anywhere on the calendar as work of its own.
 *
 * An assignment counts double when it is in the **top third of its own course** by
 * points. Relative to the course rather than to an absolute number on purpose — a
 * 40-point essay is a big deal in a 200-point seminar and a rounding error in a
 * 2,000-point lecture course, and any fixed threshold would be wrong for one of them.
 * Courses that never publish points simply never get the boost, which is the right
 * failure: no data, no claim.
 */
export function itemWeight(item, bigAssignmentCutoffs = new Map()) {
  if (item.kind === 'exam') return 3
  if (item.kind === 'assignment') {
    const cutoff = bigAssignmentCutoffs.get(String(item.ref?.courseId))
    const points = Number(item.ref?.pointsPossible)
    if (cutoff != null && Number.isFinite(points) && points >= cutoff) return 2
  }
  return 1
}

/**
 * The points value at which an assignment counts as "big", per course.
 *
 * The 67th percentile of that course's *pointed* assignments. A course with fewer than
 * three of them gets no cutoff at all — two data points cannot establish what large
 * looks like, and calling the bigger of two "big" would be noise dressed as signal.
 */
export function bigAssignmentCutoffs(assignments = []) {
  const byCourse = new Map()
  for (const a of assignments ?? []) {
    const points = Number(a?.pointsPossible)
    if (!Number.isFinite(points) || points <= 0) continue
    const key = String(a.courseId)
    if (!byCourse.has(key)) byCourse.set(key, [])
    byCourse.get(key).push(points)
  }

  const cutoffs = new Map()
  for (const [courseId, points] of byCourse) {
    if (points.length < 3) continue
    points.sort((a, b) => a - b)
    cutoffs.set(courseId, points[Math.floor(points.length * 0.67)])
  }
  return cutoffs
}

/** Everything still outstanding on a day, weighed. Finished work weighs nothing. */
export function dayLoad(items = [], cutoffs) {
  return items.reduce((sum, it) => (it.done ? sum : sum + itemWeight(it, cutoffs)), 0)
}

/**
 * Load as a band the grid can paint.
 *
 * Absolute thresholds rather than percentiles of the term. A relative scale would
 * repaint every cell as you page between months — a Tuesday going from "heavy" to
 * "light" because a worse month came into view — and a calendar whose colours mean
 * something different each screen is worse than one whose colours are only roughly
 * calibrated. These are fixed, so a heavy day looks heavy in every month.
 *
 * An exam alone reaches 'medium'; an exam plus a big assignment reaches 'heavy'.
 */
export function loadLevel(load) {
  if (load <= 0) return 'none'
  if (load <= 2) return 'light'
  if (load <= 4) return 'medium'
  return 'heavy'
}

export const LOAD_LABELS = { none: '', light: 'Light day', medium: 'Busy day', heavy: 'Heavy day' }

/** `n` days after a local `YYYY-MM-DD`, still local and still a plain date. */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toYMDLocal(new Date(y, m - 1, d + n))
}

/**
 * What is already late, soonest-overdue last.
 *
 * Surfaced above the upcoming days rather than mixed into them, because overdue work
 * has no day left to belong to — filing it under the date it was due would put it
 * behind you on a list about what is ahead, which is exactly where it gets forgotten.
 */
export function overdueItems(items = [], todayStr) {
  return items
    .filter(it => isOverdue(it, todayStr))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The next `days` calendar days that actually have something on them.
 *
 * Days are dropped when empty rather than rendered as blanks: a week with work on two
 * days should be two rows, not seven with five apologies.
 */
export function upcomingDays(items = [], todayStr, days = 7) {
  const end    = addDays(todayStr, days)
  const byDate = groupByDate(items.filter(it => it.date >= todayStr && it.date < end))
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: dayItems }))
}

/**
 * The first day beyond the window that still has outstanding work.
 *
 * So an empty week can say "nothing until the 20th" instead of just "nothing", which
 * reads as *no work exists* when the truth is that it is a fortnight out.
 */
export function nextDateAfter(items = [], fromDateStr) {
  const later = items
    .filter(it => !it.done && it.date >= fromDateStr)
    .map(it => it.date)
    .sort()
  return later[0] ?? null
}

/** Outstanding and past its date. Completed work is never overdue. */
export function isOverdue(item, todayStr) {
  return !item.done && item.date < todayStr
}

/**
 * A short summary of a day, for the cell's tooltip and for screen readers.
 *
 * The chips are colour and truncated text; without this, a busy day reads as three
 * coloured smudges to anyone not looking closely at it.
 */
export function describeDay(dateStr, items = [], cutoffs) {
  if (items.length === 0) return dateStr
  const counts = { exam: 0, assignment: 0, task: 0 }
  for (const it of items) counts[it.kind]++
  const parts = []
  if (counts.exam)       parts.push(`${counts.exam} exam${counts.exam === 1 ? '' : 's'}`)
  if (counts.assignment) parts.push(`${counts.assignment} assignment${counts.assignment === 1 ? '' : 's'}`)
  if (counts.task)       parts.push(`${counts.task} task${counts.task === 1 ? '' : 's'}`)

  // The load word carries the shading in words, so the heat is not colour-only —
  // it reaches a screen reader and anyone who cannot separate the tints.
  const level = loadLevel(dayLoad(items, cutoffs))
  const load  = LOAD_LABELS[level]
  return `${dateStr}: ${parts.join(', ')}${load ? ` · ${load}` : ''}`
}

/**
 * Can this be dragged to another day?
 *
 * Only your own tasks. A Canvas assignment's due date belongs to Canvas — moving it
 * here would either be a lie the next sync overwrites, or a silent local fork of
 * someone else's record.
 *
 * An exam is excluded for a subtler reason: an exam block is a *transform of a class
 * period*, so its date has to be a day the class actually meets. Dropping one on a
 * Sunday would file an exam against a meeting that does not exist — which the model
 * carries, so it would vanish from the calendar rather than error. Moving an exam is
 * the class form's job, where the meeting days are visible.
 */
export function canReschedule(item) {
  return item?.kind === 'task'
}
