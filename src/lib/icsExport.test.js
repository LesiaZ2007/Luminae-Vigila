import { describe, it, expect } from 'vitest'
import { serializeIcs, serializeEvent } from '@/lib/icsExport'
import { parseIcs } from '@/lib/ics'

/** A stored local event, in the shape EventModal saves. */
function timed(over = {}) {
  return {
    id: 'e1', title: 'Study group',
    start: '2026-03-04T14:00:00', end: '2026-03-04T15:00:00',
    allDay: false,
    extendedProps: { category: 'class', notes: 'Bring the lab book', location: 'Room 204' },
    ...over,
  }
}

/** A class meeting, in the shape page.js's canvasClassEvents memo produces. */
function meeting(over = {}) {
  return {
    id: 'canvascls_c1_3', title: 'Physics 101 (002)',
    start: '2026-03-04T09:00:00', end: '2026-03-04T09:50:00',
    color: '#3a6fa8',
    extendedProps: { source: 'canvas-class', classId: 'c1', location: 'Tech Hall', professor: 'Dr. Vane' },
    ...over,
  }
}

function lines(ics) { return ics.split('\r\n') }

describe('serializeIcs — envelope', () => {
  it('wraps the events in a calendar', () => {
    const out = lines(serializeIcs([timed()]))
    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out).toContain('VERSION:2.0')
    expect(out[out.length - 1]).toBe('END:VCALENDAR')
  })

  it('uses CRLF, which the spec requires and some clients enforce', () => {
    expect(serializeIcs([timed()])).toContain('\r\n')
  })

  it('produces a valid empty calendar rather than throwing', () => {
    const out = lines(serializeIcs([]))
    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out[out.length - 1]).toBe('END:VCALENDAR')
  })
})

describe('serializeIcs — a timed event', () => {
  it('writes start and end as UTC timestamps', () => {
    const out = lines(serializeIcs([timed()]))
    expect(out.some(l => /^DTSTART:\d{8}T\d{6}Z$/.test(l))).toBe(true)
    expect(out.some(l => /^DTEND:\d{8}T\d{6}Z$/.test(l))).toBe(true)
  })

  /* The bug: these were read as `event.location` and `event.description`, but an
     event stores them under extendedProps — so every VEVENT went out bare. */
  it('carries the location and notes from extendedProps', () => {
    const out = lines(serializeIcs([timed()]))
    expect(out).toContain('LOCATION:Room 204')
    expect(out).toContain('DESCRIPTION:Bring the lab book')
  })

  it('still reads a flat location, for older shapes', () => {
    const out = lines(serializeIcs([{ id: 'x', title: 'T', start: '2026-03-04T14:00:00', location: 'Hall A' }]))
    expect(out).toContain('LOCATION:Hall A')
  })

  it('omits fields it has nothing for rather than writing empties', () => {
    const out = lines(serializeIcs([{ id: 'x', title: 'Bare', start: '2026-03-04T14:00:00' }]))
    expect(out.some(l => l.startsWith('LOCATION'))).toBe(false)
    expect(out.some(l => l.startsWith('DESCRIPTION'))).toBe(false)
  })
})

describe('serializeIcs — an all-day event', () => {
  /* `new Date('2026-03-04')` is UTC midnight; formatting that as a UTC timestamp
     puts the event on 3 March for anyone west of Greenwich. */
  it('writes a DATE value, not a timestamp, so the day cannot shift', () => {
    const out = lines(serializeIcs([{ id: 'a', title: 'Reading week', start: '2026-03-04', allDay: true }]))
    expect(out).toContain('DTSTART;VALUE=DATE:20260304')
    expect(out.some(l => l.startsWith('DTSTART:'))).toBe(false)
  })

  it('ends on the following day, because an all-day DTEND is exclusive', () => {
    const out = lines(serializeIcs([{ id: 'a', title: 'One day', start: '2026-03-04', allDay: true }]))
    expect(out).toContain('DTEND;VALUE=DATE:20260305')
  })

  it('rolls the exclusive end across a month boundary', () => {
    const out = lines(serializeIcs([{ id: 'a', title: 'Last of March', start: '2026-03-31', allDay: true }]))
    expect(out).toContain('DTEND;VALUE=DATE:20260401')
  })

  it('treats a bare date as all-day even without the flag', () => {
    const out = lines(serializeIcs([{ id: 'a', title: 'Holiday', start: '2026-03-04' }]))
    expect(out).toContain('DTSTART;VALUE=DATE:20260304')
  })
})

describe('serializeIcs — class meetings', () => {
  /* The reported bug: class meetings are expanded from the schedule rather than
     stored, so an export of `events` alone contained none of them. */
  it('writes an expanded class meeting like any other event', () => {
    const out = lines(serializeIcs([meeting()]))
    expect(out).toContain('SUMMARY:Physics 101 (002)')
    expect(out).toContain('LOCATION:Tech Hall')
    expect(out.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(1)
  })

  it('writes every occurrence of a term, each with its own UID', () => {
    const term = ['2026-03-02', '2026-03-04', '2026-03-06'].map((d, i) => meeting({
      id: `canvascls_c1_${i}`, start: `${d}T09:00:00`, end: `${d}T09:50:00`,
    }))
    const out = lines(serializeIcs(term))
    expect(out.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(3)
    expect(new Set(out.filter(l => l.startsWith('UID:'))).size).toBe(3)
  })

  it('exports an exam block, which is a meeting wearing a different title', () => {
    const exam = meeting({ id: 'canvascls_c1_9', title: 'Midterm', extendedProps: { classId: 'c1', isExam: true } })
    expect(lines(serializeIcs([exam]))).toContain('SUMMARY:Midterm')
  })
})

describe('serializeIcs — escaping and folding', () => {
  it('escapes the characters that would otherwise break a line', () => {
    const out = serializeIcs([timed({ title: 'Lab; part 1, "notes"', extendedProps: { notes: 'a\nb' } })])
    expect(out).toContain('SUMMARY:Lab\\; part 1\\, "notes"')
    expect(out).toContain('DESCRIPTION:a\\nb')
  })

  it('escapes a backslash without escaping its own output', () => {
    expect(serializeIcs([timed({ title: 'a\\b' })])).toContain('SUMMARY:a\\\\b')
  })

  it('folds a long line, since some clients reject over-long ones', () => {
    const out = lines(serializeIcs([timed({ title: 'x'.repeat(200) })]))
    expect(out.every(l => l.length <= 75)).toBe(true)
    // A folded continuation is marked by a leading space.
    expect(out.some(l => l.startsWith(' '))).toBe(true)
  })
})

describe('serializeEvent — refusing to emit something broken', () => {
  /* One malformed VEVENT can make a client reject the whole file, taking the valid
     events with it. Dropping the bad one is the lesser loss. */
  it('drops an event with no start', () => {
    expect(serializeEvent({ id: 'x', title: 'When?' })).toBeNull()
  })

  it('drops an event whose start cannot be parsed', () => {
    expect(serializeEvent({ id: 'x', title: 'Bad', start: 'next tuesday' })).toBeNull()
  })

  it('keeps the good events either side of a bad one', () => {
    const out = lines(serializeIcs([timed(), { id: 'bad', title: 'Bad' }, meeting()]))
    expect(out.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(2)
  })
})

describe('round trip', () => {
  /* The export is only useful if the app can read it back — and the ICS importer is
     the same one used for Canvas feeds, so this pins both ends at once. */
  it('reads back its own file through parseIcs', () => {
    const parsed = parseIcs(serializeIcs([timed(), meeting()]))
    expect(parsed).toHaveLength(2)
    expect(parsed.map(e => e.title).sort()).toEqual(['Physics 101 (002)', 'Study group'])
  })

  it('round-trips an all-day event onto the same calendar day', () => {
    const parsed = parseIcs(serializeIcs([{ id: 'a', title: 'Reading week', start: '2026-03-04', allDay: true }]))
    expect(parsed).toHaveLength(1)
    expect(String(parsed[0].start).slice(0, 10)).toBe('2026-03-04')
  })
})
