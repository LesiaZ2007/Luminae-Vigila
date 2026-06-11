import { describe, it, expect } from 'vitest'
import { expandRecurring, expandRecurringTodo } from './recurrence.js'

// ---------------------------------------------------------------------------
// expandRecurring
// ---------------------------------------------------------------------------

describe('expandRecurring', () => {
  it('returns a single item when there is no recurrence', () => {
    const base = {
      id: 'evt-1',
      title: 'One-off',
      start: '2025-03-10T09:00:00.000Z',
      end:   '2025-03-10T10:00:00.000Z',
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('evt-1')
    expect(result[0].recurrenceGroupId).toBeUndefined()
  })

  it('expands a weekly recurrence to the correct occurrence count', () => {
    // Monday 2025-03-03 → every Monday until 2025-03-31  (Mon 3, 10, 17, 24, 31 = 5)
    const base = {
      id: 'evt-weekly',
      title: 'Weekly standup',
      start: '2025-03-03T09:00:00.000Z',
      end:   '2025-03-03T09:30:00.000Z',
      recurrence: { type: 'weekly', until: '2025-03-31' },
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(5)
    // All occurrences should be on Monday (day 1)
    result.forEach(ev => {
      expect(new Date(ev.start).getUTCDay()).toBe(1)
    })
  })

  it('expands a daily recurrence correctly', () => {
    // 2025-04-01 → 2025-04-05 inclusive = 5 days
    const base = {
      id: 'evt-daily',
      title: 'Daily reminder',
      start: '2025-04-01T08:00:00.000Z',
      end:   '2025-04-01T08:15:00.000Z',
      recurrence: { type: 'daily', until: '2025-04-05' },
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(5)
  })

  it('expands a biweekly recurrence to alternate weeks only', () => {
    // Monday 2025-03-03 biweekly until 2025-04-14 → Mon 3, 17, 31 = 3
    const base = {
      id: 'evt-biweekly',
      title: 'Biweekly sync',
      start: '2025-03-03T10:00:00.000Z',
      end:   '2025-03-03T11:00:00.000Z',
      recurrence: { type: 'biweekly', until: '2025-04-14' },
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(3)
    const dates = result.map(ev => ev.start.slice(0, 10))
    expect(dates).toEqual(['2025-03-03', '2025-03-17', '2025-03-31'])
  })

  it('expands a custom recurrence on specified days of week', () => {
    // Mon (1) and Wed (3) for one week: 2025-03-03 to 2025-03-07 → Mon 3, Wed 5 = 2
    const base = {
      id: 'evt-custom',
      title: 'MWF class',
      start: '2025-03-03T14:00:00.000Z',
      end:   '2025-03-03T15:00:00.000Z',
      recurrence: { type: 'custom', days: [1, 3], until: '2025-03-07' },
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(2)
    const days = result.map(ev => new Date(ev.start).getUTCDay())
    expect(days).toContain(1)
    expect(days).toContain(3)
  })

  it('preserves the event duration across all occurrences', () => {
    const base = {
      id: 'evt-dur',
      title: 'Duration test',
      start: '2025-05-05T09:00:00.000Z',
      end:   '2025-05-05T11:30:00.000Z',
      recurrence: { type: 'weekly', until: '2025-05-19' },
    }
    const result = expandRecurring(base)
    const expectedDurationMs = (2.5 * 60 * 60 * 1000)
    result.forEach(ev => {
      const dur = new Date(ev.end).getTime() - new Date(ev.start).getTime()
      expect(dur).toBe(expectedDurationMs)
    })
  })

  it('sets recurrenceGroupId and clears the recurrence field on each occurrence', () => {
    const base = {
      id: 'evt-grp',
      title: 'Group test',
      start: '2025-06-02T10:00:00.000Z',
      end:   '2025-06-02T10:30:00.000Z',
      recurrence: { type: 'weekly', until: '2025-06-09' },
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(2)
    result.forEach(ev => {
      expect(ev.recurrenceGroupId).toBe('evt-grp')
      expect(ev.recurrence).toBeUndefined()
    })
  })

  it('generates a stable id when no id is supplied', () => {
    const base = {
      title: 'No-id event',
      start: '2025-07-07T09:00:00.000Z',
      end:   '2025-07-07T09:30:00.000Z',
    }
    const result = expandRecurring(base)
    expect(result).toHaveLength(1)
    expect(typeof result[0].id).toBe('string')
    expect(result[0].id.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// expandRecurringTodo
// ---------------------------------------------------------------------------

describe('expandRecurringTodo', () => {
  it('returns empty array when there is no dueDate', () => {
    const t = { id: 'todo-1', title: 'No date', recurrence: { type: 'weekly' } }
    expect(expandRecurringTodo(t)).toEqual([])
  })

  it('returns the todo as-is when there is no recurrence', () => {
    const t = { id: 'todo-2', title: 'One-off task', dueDate: '2025-03-15' }
    const result = expandRecurringTodo(t)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(t) // same reference — no cloning
  })

  it('expands a weekly recurring todo within a bounded until window', () => {
    // Monday 2025-03-03 weekly until 2025-03-31 = Mon 3,10,17,24,31 = 5
    const t = {
      id: 'todo-3',
      title: 'Weekly task',
      dueDate: '2025-03-03',
      recurrence: { type: 'weekly', until: '2025-03-31' },
    }
    const result = expandRecurringTodo(t)
    expect(result).toHaveLength(5)
    result.forEach(inst => {
      expect(new Date(inst.dueDate + 'T12:00:00').getDay()).toBe(1) // Monday
    })
  })

  it('expands a daily recurring todo within a bounded until window', () => {
    // 2025-04-01 daily until 2025-04-07 = 7
    const t = {
      id: 'todo-daily',
      title: 'Daily task',
      dueDate: '2025-04-01',
      recurrence: { type: 'daily', until: '2025-04-07' },
    }
    const result = expandRecurringTodo(t)
    expect(result).toHaveLength(7)
  })

  it('expands a custom-days recurring todo', () => {
    // Mon (1) and Fri (5) in week of 2025-03-03 → 2025-03-07 = Mon 3, Fri 7 = 2
    const t = {
      id: 'todo-custom',
      title: 'Custom task',
      dueDate: '2025-03-03',
      recurrence: { type: 'custom', days: [1, 5], until: '2025-03-07' },
    }
    const result = expandRecurringTodo(t)
    expect(result).toHaveLength(2)
    const dueDates = result.map(r => r.dueDate)
    expect(dueDates).toContain('2025-03-03')
    expect(dueDates).toContain('2025-03-07')
  })

  it('skips dates listed in completedDates', () => {
    const t = {
      id: 'todo-skip',
      title: 'Skip completed',
      dueDate: '2025-03-03',
      recurrence: { type: 'weekly', until: '2025-03-31' },
      completedDates: ['2025-03-10', '2025-03-24'],
    }
    const result = expandRecurringTodo(t)
    // 5 total − 2 skipped = 3
    expect(result).toHaveLength(3)
    const dueDates = result.map(r => r.dueDate)
    expect(dueDates).not.toContain('2025-03-10')
    expect(dueDates).not.toContain('2025-03-24')
  })

  it('caps results at 60 items', () => {
    // Daily for 90 days — should be capped at 60
    const t = {
      id: 'todo-cap',
      title: 'Long running',
      dueDate: '2025-01-01',
      recurrence: { type: 'daily', until: '2025-03-31' },
    }
    const result = expandRecurringTodo(t)
    expect(result.length).toBeLessThanOrEqual(60)
    expect(result).toHaveLength(60)
  })

  it('uses an 8-week lookahead when no until date is given', () => {
    // Weekly from a fixed start with no until — should get at most 8+1 occurrences
    const t = {
      id: 'todo-lookahead',
      title: 'Open ended weekly',
      dueDate: '2025-03-03',
      recurrence: { type: 'weekly' },
    }
    const result = expandRecurringTodo(t)
    // 8 weeks = Mon 3,10,17,24,31 Apr-7,14,21 = 9 occurrences (startDt + 8 weeks inclusive)
    expect(result.length).toBeGreaterThanOrEqual(8)
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('assigns unique ids per instance and sets recurrenceGroupId', () => {
    const t = {
      id: 'todo-ids',
      title: 'ID check',
      dueDate: '2025-03-03',
      recurrence: { type: 'weekly', until: '2025-03-10' },
    }
    const result = expandRecurringTodo(t)
    expect(result).toHaveLength(2)
    const ids = result.map(r => r.id)
    expect(new Set(ids).size).toBe(2) // all unique
    result.forEach(r => {
      expect(r.recurrenceGroupId).toBe('todo-ids')
    })
  })
})
