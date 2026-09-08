import { describe, it, expect } from 'vitest'
import {
  eventDays, coversDay, isMultiDay, lastDayOf, spanPosition, spanLabel, eventDaysWithin,
} from './eventSpan'

/** An all-day event as the editor writes it: end is the day *after* the last day. */
const allDay = (start, endExclusive) => ({ allDay: true, start, end: endExclusive })
/** A timed event. A timed end is inclusive of the day it lands on. */
const timed  = (start, end) => ({ allDay: false, start, end })

describe('eventDays — all-day', () => {
  /* The editor stores a single all-day event on the 4th as 04 → 05, so the exclusive
     end is the whole difficulty here. Reading it inclusively would put every all-day
     event on one day more than it occupies. */
  it('treats an exclusive end as one day', () => {
    expect(eventDays(allDay('2026-03-04', '2026-03-05'))).toEqual(['2026-03-04'])
  })

  it('spans the days between, end exclusive', () => {
    expect(eventDays(allDay('2026-03-02', '2026-03-05')))
      .toEqual(['2026-03-02', '2026-03-03', '2026-03-04'])
  })

  it('covers one day when there is no end at all', () => {
    expect(eventDays({ allDay: true, start: '2026-03-04' })).toEqual(['2026-03-04'])
  })

  it('treats an end equal to the start as a single day, not a negative span', () => {
    expect(eventDays(allDay('2026-03-04', '2026-03-04'))).toEqual(['2026-03-04'])
  })

  it('crosses a month boundary', () => {
    expect(eventDays(allDay('2026-03-30', '2026-04-02')))
      .toEqual(['2026-03-30', '2026-03-31', '2026-04-01'])
  })

  it('crosses a leap day', () => {
    expect(eventDays(allDay('2028-02-28', '2028-03-01')))
      .toEqual(['2028-02-28', '2028-02-29'])
  })
})

describe('eventDays — timed', () => {
  it('is one day for an ordinary event', () => {
    expect(eventDays(timed('2026-03-04T09:00:00', '2026-03-04T10:00:00'))).toEqual(['2026-03-04'])
  })

  /* A timed end is inclusive: 10pm Monday to 2am Tuesday really does happen on both
     days, which is the opposite of the all-day rule above. */
  it('covers both days when it runs past midnight', () => {
    expect(eventDays(timed('2026-03-04T22:00:00', '2026-03-05T02:00:00')))
      .toEqual(['2026-03-04', '2026-03-05'])
  })

  it('is one day when it has no end', () => {
    expect(eventDays({ start: '2026-03-04T09:00:00' })).toEqual(['2026-03-04'])
  })

  /* `new Date('2026-03-04')` is UTC midnight, which is the day before for anyone west
     of Greenwich. The date half is sliced, never parsed. */
  it('keeps the local day for a zoneless timestamp', () => {
    expect(eventDays(timed('2026-03-04T00:30:00', '2026-03-04T01:00:00'))).toEqual(['2026-03-04'])
  })
})

describe('eventDays — bad input', () => {
  it('is empty with no start', () => {
    expect(eventDays({})).toEqual([])
    expect(eventDays(null)).toEqual([])
  })

  it('falls back to one day when the end precedes the start', () => {
    expect(eventDays(timed('2026-03-04T09:00:00', '2026-03-01T09:00:00'))).toEqual(['2026-03-04'])
  })

  it('refuses to walk a decade for a corrupt end', () => {
    expect(eventDays(allDay('2026-03-04', '2099-03-04')).length).toBeLessThanOrEqual(366)
  })

  it('ignores an unparseable end', () => {
    expect(eventDays({ allDay: true, start: '2026-03-04', end: 'not a date' })).toEqual(['2026-03-04'])
  })
})

describe('coversDay', () => {
  const conference = allDay('2026-03-02', '2026-03-05')

  it('is true on the first, middle and last day', () => {
    expect(coversDay(conference, '2026-03-02')).toBe(true)
    expect(coversDay(conference, '2026-03-03')).toBe(true)
    expect(coversDay(conference, '2026-03-04')).toBe(true)
  })

  it('is false on the exclusive end day and before the start', () => {
    expect(coversDay(conference, '2026-03-05')).toBe(false)
    expect(coversDay(conference, '2026-03-01')).toBe(false)
  })

  it('is false without a date or an event', () => {
    expect(coversDay(conference, null)).toBe(false)
    expect(coversDay(null, '2026-03-03')).toBe(false)
  })
})

describe('isMultiDay / lastDayOf', () => {
  it('a single all-day event is not multi-day', () => {
    expect(isMultiDay(allDay('2026-03-04', '2026-03-05'))).toBe(false)
  })

  it('a three-day event is', () => {
    expect(isMultiDay(allDay('2026-03-02', '2026-03-05'))).toBe(true)
  })

  it('reports the last day an event actually covers', () => {
    expect(lastDayOf(allDay('2026-03-02', '2026-03-05'))).toBe('2026-03-04')
    expect(lastDayOf(timed('2026-03-04T22:00:00', '2026-03-05T02:00:00'))).toBe('2026-03-05')
    expect(lastDayOf({})).toBeNull()
  })
})

describe('spanPosition / spanLabel', () => {
  const conference = allDay('2026-03-02', '2026-03-05')

  it('says where a day falls in the span', () => {
    expect(spanPosition(conference, '2026-03-03')).toEqual({ day: 2, total: 3 })
    expect(spanLabel(conference, '2026-03-03')).toBe('Day 2 of 3')
  })

  /* Labelling every ordinary event "Day 1 of 1" would put noise on every agenda row
     to serve the few that span. */
  it('is null for a single-day event', () => {
    expect(spanPosition(allDay('2026-03-04', '2026-03-05'), '2026-03-04')).toBeNull()
    expect(spanLabel(allDay('2026-03-04', '2026-03-05'), '2026-03-04')).toBeNull()
  })

  it('is null for a day outside the span', () => {
    expect(spanLabel(conference, '2026-03-09')).toBeNull()
  })
})

describe('eventDaysWithin', () => {
  const conference = allDay('2026-03-02', '2026-03-06')

  /* The agenda's real question. Asking "does it start today" is what made an
     in-progress event disappear the moment it began. */
  it('keeps the remaining days of an event already under way', () => {
    expect(eventDaysWithin(conference, '2026-03-04', '2026-03-10'))
      .toEqual(['2026-03-04', '2026-03-05'])
  })

  it('clips to the far end of the window', () => {
    expect(eventDaysWithin(conference, '2026-03-01', '2026-03-03'))
      .toEqual(['2026-03-02', '2026-03-03'])
  })

  it('is empty when the event is wholly outside the window', () => {
    expect(eventDaysWithin(conference, '2026-04-01', '2026-04-07')).toEqual([])
  })

  it('is unbounded when a bound is omitted', () => {
    expect(eventDaysWithin(conference, null, '2026-03-03')).toEqual(['2026-03-02', '2026-03-03'])
  })
})
