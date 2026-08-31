import { describe, it, expect } from 'vitest'
import {
  localDayOf, buildCourseworkItems, groupByDate, monthGrid, isOverdue, describeDay,
  itemWeight, bigAssignmentCutoffs, dayLoad, loadLevel, canReschedule,
  addDays, overdueItems, upcomingDays, nextDateAfter,
} from '@/lib/classCalendar'

const CLASSES = [
  { id: 'c1', courseName: 'Physics 101', color: '#3a6fa8', enabled: true, canvasCourseId: 42 },
  { id: 'c2', courseName: 'Chem 210',    color: '#10b981', enabled: true },
]

describe('localDayOf', () => {
  it('passes a plain date straight through', () => {
    expect(localDayOf('2026-03-04')).toBe('2026-03-04')
  })

  // The bug this exists to avoid: `toISOString().slice(0, 10)` yields the *UTC* day,
  // so an 11pm deadline in New York files itself on tomorrow.
  it('keeps the local day for a zoneless timestamp, whatever the host offset', () => {
    expect(localDayOf('2026-03-04T23:59:00')).toBe('2026-03-04')
    expect(localDayOf('2026-03-04T00:30:00')).toBe('2026-03-04')
  })

  it('converts a zoned instant to the local day it lands on', () => {
    const iso = '2026-03-04T12:00:00Z'
    const expected = new Date(iso)
    const pad = n => String(n).padStart(2, '0')
    expect(localDayOf(iso)).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
    )
  })

  it('is null for nothing and for junk', () => {
    expect(localDayOf(null)).toBeNull()
    expect(localDayOf('')).toBeNull()
    expect(localDayOf('someday')).toBeNull()
  })
})

describe('buildCourseworkItems', () => {
  it('is empty when there is nothing dated', () => {
    expect(buildCourseworkItems()).toEqual([])
    expect(buildCourseworkItems({ classes: CLASSES })).toEqual([])
  })

  it('takes a task filed under a class, with the class name and colour', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      todos: [{ id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-03-04' }],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'task', date: '2026-03-04', title: 'Lab report',
      className: 'Physics 101', classId: 'c1', color: '#3a6fa8', done: false,
    })
  })

  // A task with no due date is not urgent, it is unscheduled — there is no honest
  // square to put it in.
  it('leaves undated and deleted tasks off the calendar', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      todos: [
        { id: 't1', title: 'Someday', category: 'class:c1' },
        { id: 't2', title: 'Gone', category: 'class:c1', dueDate: '2026-03-04', deletedAt: '2026-02-01' },
      ],
    })
    expect(items).toEqual([])
  })

  it('ignores tasks that belong to no class', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      todos: [{ id: 't1', title: 'Buy milk', category: 'personal', dueDate: '2026-03-04' }],
    })
    expect(items).toEqual([])
  })

  it('keeps a completed task, marked done rather than dropped', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      todos: [{ id: 't1', title: 'Done', category: 'class:c1', dueDate: '2026-03-04', completed: true }],
    })
    expect(items[0].done).toBe(true)
  })

  it('colours a Canvas assignment with its class when one claims the course', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      assignments: [{ id: 'a1', title: 'Problem set', courseId: 42, courseName: 'PHYS-101', dueAt: '2026-03-05T23:59:00' }],
    })
    expect(items[0]).toMatchObject({
      kind: 'assignment', date: '2026-03-05', className: 'Physics 101', color: '#3a6fa8',
    })
  })

  it('still places an assignment whose course no class claims', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      assignments: [{ id: 'a1', title: 'Essay', courseId: 7, courseName: 'History 100', dueAt: '2026-03-05T23:59:00' }],
    })
    expect(items[0]).toMatchObject({ className: 'History 100', classId: null })
    expect(items[0].color).toBeTruthy()
  })

  it('reads submitted and graded work as done', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      assignments: [
        { id: 'a1', title: 'Graded',    courseId: 42, dueAt: '2026-03-05T23:59:00', submissionState: 'graded' },
        { id: 'a2', title: 'Submitted', courseId: 42, dueAt: '2026-03-05T23:59:00', submissionState: 'submitted' },
        { id: 'a3', title: 'Open',      courseId: 42, dueAt: '2026-03-05T23:59:00' },
      ],
    })
    expect(items.filter(i => i.done)).toHaveLength(2)
  })

  it('takes exams from the expanded class meetings', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      classEvents: [
        { id: 'e1', title: 'Midterm', start: '2026-03-04T09:00:00', color: '#ef4444',
          extendedProps: { classId: 'c1', isExam: true } },
      ],
    })
    expect(items[0]).toMatchObject({ kind: 'exam', date: '2026-03-04', title: 'Midterm', className: 'Physics 101' })
  })

  // A calendar showing every lecture is the calendar tab. Here it would bury four
  // deadlines under forty recurring meetings.
  it('leaves ordinary class meetings off entirely', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      classEvents: [
        { id: 'e1', title: 'Physics 101', start: '2026-03-04T09:00:00', extendedProps: { classId: 'c1' } },
      ],
    })
    expect(items).toEqual([])
  })

  it('orders by day, then exam before assignment before task', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      todos: [{ id: 't1', title: 'Task', category: 'class:c1', dueDate: '2026-03-04' }],
      assignments: [{ id: 'a1', title: 'Assignment', courseId: 42, dueAt: '2026-03-04T23:59:00' }],
      classEvents: [{ id: 'e1', title: 'Exam', start: '2026-03-04T09:00:00', extendedProps: { classId: 'c1', isExam: true } }],
    })
    expect(items.map(i => i.kind)).toEqual(['exam', 'assignment', 'task'])
  })

  it('gives every item a unique id across the three kinds', () => {
    const items = buildCourseworkItems({
      classes: CLASSES,
      todos: [{ id: 'x', title: 'Task', category: 'class:c1', dueDate: '2026-03-04' }],
      assignments: [{ id: 'x', title: 'Assignment', courseId: 42, dueAt: '2026-03-04T23:59:00' }],
      classEvents: [{ id: 'x', title: 'Exam', start: '2026-03-04T09:00:00', extendedProps: { classId: 'c1', isExam: true } }],
    })
    expect(new Set(items.map(i => i.id)).size).toBe(3)
  })
})

describe('groupByDate', () => {
  it('buckets items by their day', () => {
    const map = groupByDate([
      { id: 'a', date: '2026-03-04' }, { id: 'b', date: '2026-03-04' }, { id: 'c', date: '2026-03-05' },
    ])
    expect(map.get('2026-03-04')).toHaveLength(2)
    expect(map.get('2026-03-05')).toHaveLength(1)
    expect(map.get('2026-03-06')).toBeUndefined()
  })
})

describe('monthGrid', () => {
  it('always returns whole weeks, so columns stay under their headers', () => {
    for (let m = 0; m < 12; m++) {
      expect(monthGrid(2026, m).length % 7).toBe(0)
    }
  })

  it('starts on the Sunday on or before the 1st', () => {
    // 1 March 2026 is a Sunday, so the grid starts exactly there.
    expect(monthGrid(2026, 2)[0]).toMatchObject({ date: '2026-03-01', inMonth: true })
    // 1 April 2026 is a Wednesday — the grid opens on 29 March.
    expect(monthGrid(2026, 3)[0]).toMatchObject({ date: '2026-03-29', inMonth: false })
  })

  it('covers every day of the month', () => {
    const cells = monthGrid(2026, 1) // February
    const inMonth = cells.filter(c => c.inMonth)
    expect(inMonth).toHaveLength(28)
    expect(inMonth[0].date).toBe('2026-02-01')
    expect(inMonth[27].date).toBe('2026-02-28')
  })

  it('does not leave a trailing blank week', () => {
    // Feb 2026 starts on a Sunday and has 28 days — exactly four weeks.
    expect(monthGrid(2026, 1)).toHaveLength(28)
  })

  it('uses six rows for a month that needs them', () => {
    // Aug 2026 starts on a Saturday, so 31 days spill into a sixth row.
    expect(monthGrid(2026, 7)).toHaveLength(42)
  })

  it('handles a year boundary', () => {
    const cells = monthGrid(2026, 11) // December
    expect(cells.some(c => c.date.startsWith('2027-01'))).toBe(true)
  })
})

describe('isOverdue', () => {
  it('is true for outstanding work whose day has passed', () => {
    expect(isOverdue({ date: '2026-03-01', done: false }, '2026-03-04')).toBe(true)
  })

  it('is false on the day itself — it is not late until the day is over', () => {
    expect(isOverdue({ date: '2026-03-04', done: false }, '2026-03-04')).toBe(false)
  })

  it('is never true for something already done', () => {
    expect(isOverdue({ date: '2026-03-01', done: true }, '2026-03-04')).toBe(false)
  })
})

describe('describeDay', () => {
  it('counts each kind, and says how heavy the day is', () => {
    expect(describeDay('2026-03-04', [
      { kind: 'exam' }, { kind: 'assignment' }, { kind: 'assignment' }, { kind: 'task' },
    ])).toBe('2026-03-04: 1 exam, 2 assignments, 1 task · Heavy day')
  })

  it('names only the kinds actually present', () => {
    expect(describeDay('2026-03-04', [{ kind: 'task' }])).toBe('2026-03-04: 1 task · Light day')
  })

  it('is just the date on an empty day', () => {
    expect(describeDay('2026-03-04', [])).toBe('2026-03-04')
  })

  // The shading must not be the only carrier of "this day is brutal".
  it('drops the load word when everything on the day is done', () => {
    expect(describeDay('2026-03-04', [{ kind: 'task', done: true }])).toBe('2026-03-04: 1 task')
  })
})

describe('bigAssignmentCutoffs', () => {
  const a = (courseId, pointsPossible) => ({ id: String(Math.random()), courseId, pointsPossible })

  it('sets a cutoff from the course’s own distribution', () => {
    const cutoffs = bigAssignmentCutoffs([a(1, 10), a(1, 20), a(1, 100)])
    expect(cutoffs.get('1')).toBe(100)
  })

  // Two data points cannot establish what "large" looks like; calling the bigger of
  // two big would be noise dressed as signal.
  it('refuses to guess from fewer than three pointed assignments', () => {
    expect(bigAssignmentCutoffs([a(1, 10), a(1, 500)]).has('1')).toBe(false)
  })

  it('ignores assignments with no points, and courses that publish none', () => {
    const cutoffs = bigAssignmentCutoffs([
      a(1, 10), a(1, 20), a(1, 100), { id: 'x', courseId: 1 },
      { id: 'y', courseId: 2 }, { id: 'z', courseId: 2 }, { id: 'w', courseId: 2 },
    ])
    expect(cutoffs.has('1')).toBe(true)
    expect(cutoffs.has('2')).toBe(false)
  })

  it('scores each course on its own scale', () => {
    const cutoffs = bigAssignmentCutoffs([
      a(1, 10), a(1, 20), a(1, 40),
      a(2, 400), a(2, 800), a(2, 2000),
    ])
    expect(cutoffs.get('1')).toBeLessThan(cutoffs.get('2'))
  })
})

describe('itemWeight', () => {
  it('weighs an exam heaviest — it is what you reorganise a week around', () => {
    expect(itemWeight({ kind: 'exam' })).toBe(3)
  })

  it('weighs an ordinary task and a small assignment the same', () => {
    const cutoffs = new Map([['1', 100]])
    expect(itemWeight({ kind: 'task' }, cutoffs)).toBe(1)
    expect(itemWeight({ kind: 'assignment', ref: { courseId: 1, pointsPossible: 10 } }, cutoffs)).toBe(1)
  })

  it('doubles an assignment in the top third of its course', () => {
    const cutoffs = new Map([['1', 100]])
    expect(itemWeight({ kind: 'assignment', ref: { courseId: 1, pointsPossible: 100 } }, cutoffs)).toBe(2)
  })

  // No data, no claim.
  it('gives no boost when the course publishes no points', () => {
    expect(itemWeight({ kind: 'assignment', ref: { courseId: 9, pointsPossible: 5000 } }, new Map())).toBe(1)
  })
})

describe('dayLoad and loadLevel', () => {
  it('adds up what is outstanding', () => {
    expect(dayLoad([{ kind: 'exam' }, { kind: 'task' }])).toBe(4)
  })

  it('counts finished work as no burden at all', () => {
    expect(dayLoad([{ kind: 'exam', done: true }, { kind: 'task' }])).toBe(1)
  })

  it('bands an empty day as none', () => {
    expect(loadLevel(0)).toBe('none')
    expect(loadLevel(dayLoad([{ kind: 'task', done: true }]))).toBe('none')
  })

  it('reaches medium for an exam alone and heavy once work piles on it', () => {
    expect(loadLevel(dayLoad([{ kind: 'exam' }]))).toBe('medium')
    expect(loadLevel(dayLoad([{ kind: 'exam' }, { kind: 'task' }, { kind: 'task' }]))).toBe('heavy')
  })

  it('bands a couple of small things as light', () => {
    expect(loadLevel(dayLoad([{ kind: 'task' }, { kind: 'task' }]))).toBe('light')
  })
})

describe('canReschedule', () => {
  // Moving a Canvas assignment here is either a lie the next sync overwrites, or a
  // silent local fork of someone else's record.
  it('allows your own tasks and nothing else', () => {
    expect(canReschedule({ kind: 'task' })).toBe(true)
    expect(canReschedule({ kind: 'assignment' })).toBe(false)
    expect(canReschedule({ kind: 'exam' })).toBe(false)
    expect(canReschedule(null)).toBe(false)
  })
})

describe('addDays', () => {
  it('walks forward and back within a month', () => {
    expect(addDays('2026-03-04', 3)).toBe('2026-03-07')
    expect(addDays('2026-03-04', -3)).toBe('2026-03-01')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-03-30', 3)).toBe('2026-04-02')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('knows February 2028 has 29 days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

const item = (date, over = {}) => ({ id: date + Math.random(), date, kind: 'task', done: false, ...over })

describe('overdueItems', () => {
  it('collects what is late, oldest first', () => {
    const out = overdueItems([item('2026-03-01'), item('2026-02-20'), item('2026-03-10')], '2026-03-04')
    expect(out.map(i => i.date)).toEqual(['2026-02-20', '2026-03-01'])
  })

  it('leaves finished work out however old it is', () => {
    expect(overdueItems([item('2026-01-01', { done: true })], '2026-03-04')).toEqual([])
  })

  it('does not count today as late — the day is not over', () => {
    expect(overdueItems([item('2026-03-04')], '2026-03-04')).toEqual([])
  })
})

describe('upcomingDays', () => {
  it('groups the next week by day, soonest first', () => {
    const out = upcomingDays([item('2026-03-06'), item('2026-03-04'), item('2026-03-04')], '2026-03-04', 7)
    expect(out.map(d => d.date)).toEqual(['2026-03-04', '2026-03-06'])
    expect(out[0].items).toHaveLength(2)
  })

  // A week with work on two days should be two rows, not seven with five apologies.
  it('omits days with nothing on them', () => {
    expect(upcomingDays([item('2026-03-04')], '2026-03-04', 7)).toHaveLength(1)
  })

  it('stops at the window and never looks backwards', () => {
    const out = upcomingDays([item('2026-03-01'), item('2026-03-04'), item('2026-03-11')], '2026-03-04', 7)
    expect(out.map(d => d.date)).toEqual(['2026-03-04'])
  })

  it('keeps completed work visible on its day rather than hiding it', () => {
    const out = upcomingDays([item('2026-03-04', { done: true })], '2026-03-04', 7)
    expect(out[0].items).toHaveLength(1)
  })
})

describe('nextDateAfter', () => {
  it('names the soonest outstanding day from a point onwards', () => {
    expect(nextDateAfter([item('2026-03-25'), item('2026-03-20')], '2026-03-11')).toBe('2026-03-20')
  })

  it('skips work that is already done', () => {
    expect(nextDateAfter([item('2026-03-20', { done: true }), item('2026-03-25')], '2026-03-11')).toBe('2026-03-25')
  })

  it('is null when there is genuinely nothing left', () => {
    expect(nextDateAfter([item('2026-03-01')], '2026-03-11')).toBeNull()
  })
})
