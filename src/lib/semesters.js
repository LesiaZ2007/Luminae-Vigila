/**
 * Semesters, read off the classes that use them.
 *
 * There is no semester table. Every class already carries `semesterStart` and
 * `semesterEnd` — the calendar, the reminders and the agenda all read those — so a
 * semester is just a name on top of a date range several classes share. Deriving the
 * list from the classes means it can never disagree with them, and nothing new has to
 * sync. The cost is that a semester with no classes left in it is gone, which is fine:
 * there is nothing for it to hold.
 *
 * Classes from before semesters had names have only the dates; `semesterOf` names
 * those from the start month, so they still group with each other.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Spring 2026" for a January start, "Summer" for May–July, "Fall" for August on. */
export function defaultSemesterName(start) {
  if (!start) return ''
  const [y, m] = String(start).split('-').map(Number)
  if (!y || !m) return ''
  const season = m <= 4 ? 'Spring' : m <= 7 ? 'Summer' : 'Fall'
  return `${season} ${y}`
}

/** The semester a class belongs to, or null if it has no dates. */
export function semesterOf(cls) {
  if (!cls?.semesterStart || !cls?.semesterEnd) return null
  const start = cls.semesterStart
  const end   = cls.semesterEnd
  const name  = (cls.semesterName || '').trim() || defaultSemesterName(start)
  return { key: semesterKey({ name, start, end }), name, start, end }
}

/** Identity of a semester: same name and same dates. */
export function semesterKey({ name, start, end }) {
  return `${name}|${start}|${end}`
}

/** Every distinct semester among the classes, newest first. */
export function semestersFrom(classes = []) {
  const byKey = new Map()
  for (const cls of classes) {
    const sem = semesterOf(cls)
    if (sem && !byKey.has(sem.key)) byKey.set(sem.key, sem)
  }
  return [...byKey.values()].sort((a, b) => b.start.localeCompare(a.start) || a.name.localeCompare(b.name))
}

/** True once the last day of the class's semester is behind `today` ("YYYY-MM-DD"). */
export function isSemesterOver(cls, today) {
  return !!cls?.semesterEnd && cls.semesterEnd < today
}

/**
 * The semester a new class should start in: the one running today, else the next one
 * to start, else nothing. A finished semester is never the default, since the whole
 * point is not adding classes to it by accident.
 */
export function defaultSemester(semesters, today) {
  const live = semesters.filter(s => s.end >= today)
  const now  = live.find(s => s.start <= today)
  if (now) return now
  return [...live].sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
}

/** "Jan 12 – May 8, 2026", for telling two same-named semesters apart. */
export function semesterRangeLabel({ start, end }) {
  const fmt = d => { const [, m, day] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${day}` }
  return `${fmt(start)} – ${fmt(end)}, ${end.slice(0, 4)}`
}

/**
 * The classes that need rewriting when a semester is renamed or re-dated: every class
 * in `from`, carrying `to`'s name and dates. `exceptId` is the class being saved by the
 * form, which writes its own copy.
 */
export function moveSemester(classes, from, to, exceptId) {
  return classes
    .filter(c => String(c.id) !== String(exceptId) && semesterOf(c)?.key === from.key)
    .map(c => ({ ...c, semesterName: to.name, semesterStart: to.start, semesterEnd: to.end }))
}
