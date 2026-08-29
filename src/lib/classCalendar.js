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
  const byId     = new Map(classes.filter(c => c?.id).map(c => [String(c.id), c]))
  const byCourse = new Map()
  for (const c of classes) {
    if (c?.canvasCourseId != null) byCourse.set(String(c.canvasCourseId), c)
  }

  const items = []

  // ── Tasks filed under a class ──
  for (const td of todos) {
    if (!td?.id || td.deletedAt || !td.dueDate) continue
    const classId = classIdForTodo(td)
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
    const classId = ev.extendedProps.classId != null ? String(ev.extendedProps.classId) : null
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

  return items.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.title.localeCompare(b.title),
  )
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
export function describeDay(dateStr, items = []) {
  if (items.length === 0) return dateStr
  const counts = { exam: 0, assignment: 0, task: 0 }
  for (const it of items) counts[it.kind]++
  const parts = []
  if (counts.exam)       parts.push(`${counts.exam} exam${counts.exam === 1 ? '' : 's'}`)
  if (counts.assignment) parts.push(`${counts.assignment} assignment${counts.assignment === 1 ? '' : 's'}`)
  if (counts.task)       parts.push(`${counts.task} task${counts.task === 1 ? '' : 's'}`)
  return `${dateStr}: ${parts.join(', ')}`
}
