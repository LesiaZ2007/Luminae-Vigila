import { describe, it, expect } from 'vitest'
import { buildGlance, glanceSummaryLine, glanceNotificationBody, displayTime } from './glance'

const DATE = '2026-08-03'

const todo = (over = {}) => ({ id: 't1', title: 'Read chapter 4', dueDate: DATE, completed: false, ...over })
const event = (over = {}) => ({ id: 'e1', title: 'Physics', start: `${DATE}T09:30:00`, end: `${DATE}T10:20:00`, ...over })

describe('buildGlance', () => {
  it('splits tasks into due-today and overdue', () => {
    const g = buildGlance({
      todos: [
        todo({ id: 'a', dueDate: DATE }),
        todo({ id: 'b', dueDate: '2026-08-01' }),
        todo({ id: 'c', dueDate: '2026-08-09' }), // future — neither
      ],
      dateStr: DATE,
    })
    expect(g.dueToday.map(t => t.id)).toEqual(['a'])
    expect(g.overdue.map(t => t.id)).toEqual(['b'])
  })

  it('ignores completed and deleted tasks', () => {
    const g = buildGlance({
      todos: [todo({ id: 'a', completed: true }), todo({ id: 'b', deletedAt: '2026-08-02T00:00:00Z' })],
      dateStr: DATE,
    })
    expect(g.counts.dueToday).toBe(0)
  })

  it('sorts overdue oldest-first so truncation keeps the worst', () => {
    const g = buildGlance({
      todos: [todo({ id: 'recent', dueDate: '2026-08-02' }), todo({ id: 'ancient', dueDate: '2026-01-01' })],
      dateStr: DATE,
    })
    expect(g.overdue.map(t => t.id)).toEqual(['ancient', 'recent'])
  })

  it('puts all-day events first, then chronological', () => {
    const g = buildGlance({
      events: [
        event({ id: 'late',  start: `${DATE}T15:00:00` }),
        event({ id: 'early', start: `${DATE}T08:00:00` }),
        event({ id: 'allday', start: DATE, allDay: true }),
      ],
      dateStr: DATE,
    })
    expect(g.events.map(e => e.id)).toEqual(['allday', 'early', 'late'])
  })

  it('counts Canvas assignments alongside tasks, and skips hidden/done ones', () => {
    const g = buildGlance({
      todos: [todo()],
      assignments: [
        { id: 'a1', name: 'Lab report', dueAt: `${DATE}T23:59:00` },
        { id: 'a2', name: 'Done one',   dueAt: `${DATE}T23:59:00`, done: true },
        { id: 'a3', name: 'Hidden one', dueAt: `${DATE}T23:59:00`, hidden: true },
      ],
      dateStr: DATE,
    })
    expect(g.assignments.map(a => a.id)).toEqual(['a1'])
    expect(g.counts.dueToday).toBe(2) // one task + one assignment
  })

  it('reports empty when there is genuinely nothing', () => {
    expect(buildGlance({ dateStr: DATE }).isEmpty).toBe(true)
    expect(buildGlance({ todos: [todo()], dateStr: DATE }).isEmpty).toBe(false)
  })

  it('does not shift a bare due date across the date line', () => {
    // new Date('2026-08-03') is UTC midnight — Aug 2 in New York. A naive
    // implementation drops this task out of "today" entirely.
    const g = buildGlance({ todos: [todo({ dueDate: '2026-08-03' })], dateStr: '2026-08-03' })
    expect(g.counts.dueToday).toBe(1)
  })

  it('tolerates missing arrays', () => {
    expect(() => buildGlance()).not.toThrow()
    expect(buildGlance({ todos: null, events: undefined }).isEmpty).toBe(true)
  })
})

describe('glanceSummaryLine', () => {
  it('lists only the non-zero parts', () => {
    const g = buildGlance({ todos: [todo()], dateStr: DATE })
    expect(glanceSummaryLine(g)).toBe('1 due today')
  })

  it('combines all three', () => {
    const g = buildGlance({
      todos:  [todo({ id: 'a' }), todo({ id: 'b', dueDate: '2026-07-01' })],
      events: [event()],
      dateStr: DATE,
    })
    expect(glanceSummaryLine(g)).toBe('1 overdue · 1 due today · 1 event')
  })

  it('has something friendly to say when the day is clear', () => {
    expect(glanceSummaryLine(buildGlance({ dateStr: DATE }))).toBe('Nothing scheduled — enjoy it.')
  })
})

describe('glanceNotificationBody', () => {
  it('names the first timed event', () => {
    const g = buildGlance({ events: [event({ start: `${DATE}T09:30:00` })], dateStr: DATE })
    expect(glanceNotificationBody(g)).toBe('1 event — first up: Physics at 9:30 AM')
  })

  it('skips the all-day event when picking "first up"', () => {
    const g = buildGlance({
      events: [event({ id: 'ad', title: 'Holiday', start: DATE, allDay: true }), event({ title: 'Physics' })],
      dateStr: DATE,
    })
    expect(glanceNotificationBody(g)).toContain('first up: Physics')
  })

  it('falls back to the summary when nothing is timed', () => {
    const g = buildGlance({ todos: [todo()], dateStr: DATE })
    expect(glanceNotificationBody(g)).toBe('1 due today')
  })
})

describe('displayTime', () => {
  it('converts to 12-hour with midnight and noon correct', () => {
    expect(displayTime('00:05')).toBe('12:05 AM')
    expect(displayTime('12:00')).toBe('12:00 PM')
    expect(displayTime('13:45')).toBe('1:45 PM')
    expect(displayTime('')).toBe('')
  })
})
