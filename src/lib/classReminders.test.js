import { describe, it, expect } from 'vitest'
import {
  getClassRules, hasClassRules, classRulesById, classIdForTodo, effectiveReminders,
  examOccurrences, classReminderKey, fireTimeFor, todoDueIso, classReminderCandidates,
  describeRules, CLASS_REMINDER_PRESETS,
} from '@/lib/classReminders'

const DAY  = 24 * 60 * 60_000
const WEEK = 7 * DAY

/** A class with rules, in the shape ClassScheduleModal writes. */
function makeClass(over = {}) {
  return {
    id: 'c1', courseName: 'Physics 101', color: '#3a6fa8', enabled: true,
    days: [1, 3, 5], startTime: '09:00', endTime: '09:50',
    semesterStart: '2026-01-12', semesterEnd: '2026-05-08',
    ...over,
  }
}

describe('getClassRules — validating what was stored', () => {
  it('returns empty lists for a class that has never been given a rule', () => {
    expect(getClassRules(makeClass())).toEqual({ tasks: [], exams: [] })
  })

  it('keeps well-formed rules and carries their labels through', () => {
    const cls = makeClass({ reminders: { tasks: [{ ms: 2 * DAY, label: '2 days before' }] } })
    expect(getClassRules(cls)).toEqual({
      tasks: [{ ms: 2 * DAY, label: '2 days before' }],
      exams: [],
    })
  })

  // The editor writes objects, but an older export or a hand-edited file may hold
  // bare numbers. Dropping the whole class's rules over that would be the worse of
  // the two outcomes.
  it('accepts a bare offset and labels it itself', () => {
    expect(getClassRules(makeClass({ reminders: { tasks: [DAY] } })).tasks)
      .toEqual([{ ms: DAY, label: '1 day before' }])
  })

  it('drops malformed entries rather than letting them reach the cron', () => {
    const cls = makeClass({ reminders: { tasks: [{ ms: 0 }, { ms: -DAY }, { ms: 'soon' }, null, { ms: DAY }] } })
    expect(getClassRules(cls).tasks).toEqual([{ ms: DAY, label: '1 day before' }])
  })

  it('collapses two chips for the same offset into one reminder', () => {
    const cls = makeClass({ reminders: { exams: [{ ms: WEEK }, { ms: WEEK, label: 'again' }] } })
    expect(getClassRules(cls).exams).toHaveLength(1)
  })

  it('orders longest lead first, which is the order they read in', () => {
    const cls = makeClass({ reminders: { exams: [{ ms: DAY }, { ms: 2 * WEEK }, { ms: WEEK }] } })
    expect(getClassRules(cls).exams.map(r => r.ms)).toEqual([2 * WEEK, WEEK, DAY])
  })

  it('ignores a reminders field that is not an object', () => {
    expect(getClassRules(makeClass({ reminders: 'daily' }))).toEqual({ tasks: [], exams: [] })
  })

  // A class you switched off is already hidden from the calendar and the category
  // picker. Still being notified about its coursework is the clearest possible bug.
  it('contributes nothing from a disabled or deleted class', () => {
    const rules = { tasks: [{ ms: DAY }] }
    expect(hasClassRules(makeClass({ enabled: false, reminders: rules }))).toBe(false)
    expect(hasClassRules(makeClass({ deletedAt: '2026-02-01T00:00:00Z', reminders: rules }))).toBe(false)
    expect(hasClassRules(makeClass({ reminders: rules }))).toBe(true)
  })
})

describe('classRulesById', () => {
  it('indexes only the classes that actually carry a rule', () => {
    const map = classRulesById([
      makeClass({ id: 'a', reminders: { tasks: [{ ms: DAY }] } }),
      makeClass({ id: 'b' }),
      makeClass({ id: 'c', enabled: false, reminders: { tasks: [{ ms: DAY }] } }),
    ])
    expect([...map.keys()]).toEqual(['a'])
  })

  it('keys by string, so a numeric class id still matches a task category', () => {
    const map = classRulesById([makeClass({ id: 7, reminders: { tasks: [{ ms: DAY }] } })])
    expect(map.has('7')).toBe(true)
  })
})

describe('classIdForTodo', () => {
  it('reads the category, which is the source of truth', () => {
    expect(classIdForTodo({ category: 'class:c1' })).toBe('c1')
  })

  it('falls back to linkedClassId for tasks that predate class categories', () => {
    expect(classIdForTodo({ category: 'academic', linkedClassId: 'c9' })).toBe('c9')
  })

  it('prefers the category when the two disagree', () => {
    expect(classIdForTodo({ category: 'class:c1', linkedClassId: 'c9' })).toBe('c1')
  })

  it('is null for a task filed under no class at all', () => {
    expect(classIdForTodo({ category: 'personal' })).toBeNull()
    expect(classIdForTodo({})).toBeNull()
  })
})

describe('effectiveReminders — the item wins', () => {
  const rules = { tasks: [{ ms: DAY, label: '1 day before' }], exams: [] }

  it('uses the class rule when the item has none of its own', () => {
    expect(effectiveReminders({ id: 't' }, rules)).toEqual([{ ms: DAY, label: '1 day before', fromClass: true }])
  })

  // The hand-set reminder is the more specific statement of intent, and stacking the
  // class default on top of it would mean two notifications for one task.
  it('drops the class rule entirely when the item carries a reminder', () => {
    const own = { ms: 2 * DAY, label: '2 days before' }
    expect(effectiveReminders({ id: 't', reminder: own }, rules)).toEqual([own])
  })

  it('returns nothing when neither the item nor the class says anything', () => {
    expect(effectiveReminders({ id: 't' }, null)).toEqual([])
    expect(effectiveReminders({ id: 't' }, { tasks: [], exams: [] })).toEqual([])
  })

  it('reads the exam list when asked for exams', () => {
    const r = { tasks: [{ ms: DAY }], exams: [{ ms: WEEK, label: '1 week before' }] }
    expect(effectiveReminders({ id: 'e' }, r, 'exams')[0].ms).toBe(WEEK)
  })
})

describe('examOccurrences', () => {
  it('resolves an exam to a local instant', () => {
    const cls = makeClass({ exceptions: { exams: [{ date: '2026-03-04', title: 'Midterm', startTime: '13:00' }] } })
    expect(examOccurrences(cls)).toEqual([{
      classId: 'c1', className: 'Physics 101', date: '2026-03-04',
      title: 'Midterm', startIso: '2026-03-04T13:00:00', color: '#3a6fa8',
    }])
  })

  // An exam block stores only what differs from the class period, so an omitted time
  // means "the usual hour" — and it keeps following the class if that hour moves.
  it('inherits the class period start when the exam names no time', () => {
    const cls = makeClass({ exceptions: { exams: [{ date: '2026-03-04' }] } })
    expect(examOccurrences(cls)[0].startIso).toBe('2026-03-04T09:00:00')
  })

  it('names an untitled exam after its class', () => {
    const cls = makeClass({ exceptions: { exams: [{ date: '2026-03-04' }] } })
    expect(examOccurrences(cls)[0].title).toBe('Physics 101 exam')
  })

  // Local time with no Z, matching what the modals store: an exam is at 9am where
  // you are, not 9am UTC.
  it('produces a local ISO with no timezone suffix', () => {
    const cls = makeClass({ exceptions: { exams: [{ date: '2026-03-04' }] } })
    expect(examOccurrences(cls)[0].startIso.endsWith('Z')).toBe(false)
  })

  it('skips an exam with no time to inherit rather than guessing one', () => {
    const cls = makeClass({ startTime: undefined, exceptions: { exams: [{ date: '2026-03-04' }] } })
    expect(examOccurrences(cls)).toEqual([])
  })

  it('ignores a malformed date, as getExceptions already does', () => {
    const cls = makeClass({ exceptions: { exams: [{ date: 'next friday' }] } })
    expect(examOccurrences(cls)).toEqual([])
  })

  it('returns nothing for a disabled class', () => {
    const cls = makeClass({ enabled: false, exceptions: { exams: [{ date: '2026-03-04' }] } })
    expect(examOccurrences(cls)).toEqual([])
  })
})

describe('fireTimeFor', () => {
  it('counts an offset back from the item time', () => {
    const at = fireTimeFor({ ms: DAY }, '2026-03-04T00:00:00')
    expect(at).toBe(new Date('2026-03-04T00:00:00').getTime() - DAY)
  })

  it('honours an absolute reminder and ignores any offset on it', () => {
    const at = fireTimeFor({ at: '2026-03-01T08:00:00', ms: 0 }, '2026-03-04T00:00:00')
    expect(at).toBe(new Date('2026-03-01T08:00:00').getTime())
  })

  it('is null when there is nothing to count back from', () => {
    expect(fireTimeFor({ ms: DAY }, null)).toBeNull()
    expect(fireTimeFor(null, '2026-03-04T00:00:00')).toBeNull()
    expect(fireTimeFor({ at: 'whenever' }, null)).toBeNull()
  })
})

describe('todoDueIso', () => {
  it('puts a task at midnight on its date, matching the push cron', () => {
    expect(todoDueIso({ dueDate: '2026-03-04' })).toBe('2026-03-04T00:00:00')
  })

  it('is null for a task with no due date — nothing to count back from', () => {
    expect(todoDueIso({})).toBeNull()
  })
})

describe('classReminderKey', () => {
  // Two rules on one class are two distinct notifications. Keying only on the fire
  // time would let a rescheduled item collide with itself.
  it('separates two offsets on the same item', () => {
    const a = classReminderKey('td', 't1', DAY, 1000)
    const b = classReminderKey('td', 't1', 2 * DAY, 1000)
    expect(a).not.toBe(b)
  })

  it('changes when the item is rescheduled, so the reminder fires again', () => {
    expect(classReminderKey('td', 't1', DAY, 1000)).not.toBe(classReminderKey('td', 't1', DAY, 2000))
  })

  it('never collides with the per-item keys the cron already writes', () => {
    expect(classReminderKey('td', 't1', DAY, 1000)).not.toBe('td-t1-1000')
  })
})

describe('classReminderCandidates', () => {
  const cls = makeClass({ reminders: { tasks: [{ ms: DAY, label: '1 day before' }] } })

  it('is empty when no class carries a rule, without touching the tasks', () => {
    expect(classReminderCandidates({ classes: [makeClass()], todos: [{ id: 't', category: 'class:c1', dueDate: '2026-03-04' }] }))
      .toEqual([])
  })

  it('emits one candidate per rule for a task filed under the class', () => {
    const out = classReminderCandidates({
      classes: [cls],
      todos:   [{ id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-03-04' }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Physics 101 — Lab report')
    expect(out[0].body).toBe('1 day before')
    expect(out[0].at).toBe(new Date('2026-03-04T00:00:00').getTime() - DAY)
  })

  it('emits one per offset when a class carries several rules', () => {
    const many = makeClass({ reminders: { tasks: [{ ms: DAY }, { ms: WEEK }] } })
    const out = classReminderCandidates({
      classes: [many],
      todos:   [{ id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-03-04' }],
    })
    expect(out).toHaveLength(2)
    expect(new Set(out.map(c => c.key)).size).toBe(2)
  })

  // The per-item path in both callers already handles these; emitting them here
  // would double every hand-set reminder.
  it('skips a task that carries its own reminder', () => {
    const out = classReminderCandidates({
      classes: [cls],
      todos:   [{ id: 't1', category: 'class:c1', dueDate: '2026-03-04', reminder: { ms: DAY, label: '1 day before' } }],
    })
    expect(out).toEqual([])
  })

  it('skips completed, deleted, and undated tasks', () => {
    const out = classReminderCandidates({
      classes: [cls],
      todos: [
        { id: 'a', category: 'class:c1', dueDate: '2026-03-04', completed: true },
        { id: 'b', category: 'class:c1', dueDate: '2026-03-04', deletedAt: '2026-02-01T00:00:00Z' },
        { id: 'c', category: 'class:c1' },
      ],
    })
    expect(out).toEqual([])
  })

  it('ignores tasks filed under a different class', () => {
    const out = classReminderCandidates({
      classes: [cls],
      todos:   [{ id: 't', category: 'class:other', dueDate: '2026-03-04' }],
    })
    expect(out).toEqual([])
  })

  it('reaches Canvas assignments through the class’s Canvas link', () => {
    const linked = makeClass({ canvasCourseId: 42, reminders: { tasks: [{ ms: DAY, label: '1 day before' }] } })
    const out = classReminderCandidates({
      classes:     [linked],
      assignments: [{ id: 'a1', title: 'Problem set', courseId: 42, dueAt: '2026-03-04T23:59:00' }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Physics 101 — Problem set')
  })

  it('leaves Canvas assignments alone for a class with no Canvas link', () => {
    const out = classReminderCandidates({
      classes:     [cls],
      assignments: [{ id: 'a1', title: 'Problem set', courseId: 42, dueAt: '2026-03-04T23:59:00' }],
    })
    expect(out).toEqual([])
  })

  it('skips assignments already submitted or graded', () => {
    const linked = makeClass({ canvasCourseId: 42, reminders: { tasks: [{ ms: DAY }] } })
    const out = classReminderCandidates({
      classes: [linked],
      assignments: [
        { id: 'a1', courseId: 42, dueAt: '2026-03-04T23:59:00', submissionState: 'graded' },
        { id: 'a2', courseId: 42, dueAt: '2026-03-04T23:59:00', done: true },
      ],
    })
    expect(out).toEqual([])
  })

  it('emits exam candidates from the class’s own exception list', () => {
    const withExam = makeClass({
      reminders:  { exams: [{ ms: WEEK, label: '1 week before' }] },
      exceptions: { exams: [{ date: '2026-03-04', title: 'Midterm' }] },
    })
    const out = classReminderCandidates({ classes: [withExam] })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Physics 101 — Midterm')
    expect(out[0].at).toBe(new Date('2026-03-04T09:00:00').getTime() - WEEK)
  })

  it('does not fire the task rule for an exam, or the exam rule for a task', () => {
    const both = makeClass({
      reminders:  { tasks: [{ ms: DAY }] },
      exceptions: { exams: [{ date: '2026-03-04' }] },
    })
    expect(classReminderCandidates({ classes: [both] })).toEqual([])
  })

  it('produces a unique key for every candidate it emits', () => {
    const rich = makeClass({
      canvasCourseId: 42,
      reminders:  { tasks: [{ ms: DAY }, { ms: WEEK }], exams: [{ ms: DAY }, { ms: WEEK }] },
      exceptions: { exams: [{ date: '2026-03-04' }, { date: '2026-04-04' }] },
    })
    const out = classReminderCandidates({
      classes:     [rich],
      todos:       [{ id: 't1', category: 'class:c1', dueDate: '2026-03-01' }],
      assignments: [{ id: 'a1', courseId: 42, dueAt: '2026-03-02T23:59:00' }],
    })
    expect(out).toHaveLength(8)
    expect(new Set(out.map(c => c.key)).size).toBe(8)
  })
})

describe('describeRules', () => {
  it('reads as one sentence fragment for several offsets', () => {
    expect(describeRules([{ ms: WEEK, label: '1 week before' }, { ms: DAY, label: '1 day before' }]))
      .toBe('1 week and 1 day before')
  })

  it('serialises three with commas', () => {
    expect(describeRules([
      { ms: 2 * WEEK, label: '2 weeks before' }, { ms: WEEK, label: '1 week before' }, { ms: DAY, label: '1 day before' },
    ])).toBe('2 weeks, 1 week and 1 day before')
  })

  it('is empty when there are no rules, so the caller can hide the line', () => {
    expect(describeRules([])).toBe('')
  })
})

describe('CLASS_REMINDER_PRESETS', () => {
  // Tasks are due on a date, so a sub-day offset would fire at an arbitrary hour of
  // the night — the same reason TASK_REMINDER_PRESETS stops at one day.
  it('offers nothing shorter than a day, for either kind', () => {
    for (const kind of ['tasks', 'exams']) {
      expect(Math.min(...CLASS_REMINDER_PRESETS[kind])).toBeGreaterThanOrEqual(DAY)
    }
  })

  it('gives exams a longer runway than tasks', () => {
    expect(Math.max(...CLASS_REMINDER_PRESETS.exams)).toBeGreaterThan(Math.max(...CLASS_REMINDER_PRESETS.tasks))
  })
})
