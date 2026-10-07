import { describe, it, expect } from 'vitest'
import { parseIcsDate, parseIcs } from './ics.js'
import { serializeIcs }           from './icsExport.js'

// Vitest pins TZ=America/New_York, so "local"/"the viewer's zone" below means ET.

// ---------------------------------------------------------------------------
// parseIcsDate
// ---------------------------------------------------------------------------

describe('parseIcsDate', () => {
  describe('date-only values (VALUE=DATE) — a day, not an instant', () => {
    it('becomes a bare YYYY-MM-DD, allDay: true', () => {
      expect(parseIcsDate('20250315', { VALUE: 'DATE' })).toEqual({ value: '2025-03-15', allDay: true })
    })

    it('is also recognised without the VALUE=DATE param (an 8-digit value has no time part)', () => {
      expect(parseIcsDate('20250315', {})).toEqual({ value: '2025-03-15', allDay: true })
    })
  })

  describe('Zulu datetimes (trailing Z) — converted to local wall time', () => {
    it('converts using the summer offset', () => {
      // 13:00 UTC in March (EDT, UTC-4) is 09:00 in New York.
      expect(parseIcsDate('20250315T130000Z', {})).toEqual({ value: '2025-03-15T09:00:00', allDay: false })
    })

    it('converts using the winter offset', () => {
      // 13:00 UTC in January (EST, UTC-5) is 08:00 in New York.
      expect(parseIcsDate('20250115T130000Z', {})).toEqual({ value: '2025-01-15T08:00:00', allDay: false })
    })

    it('preserves hours, minutes and seconds across the conversion', () => {
      // 23:59:59 UTC on Dec 25 (EST, UTC-5) is 18:59:59 on Dec 25 in New York.
      expect(parseIcsDate('20261225T235959Z', {})).toEqual({ value: '2026-12-25T18:59:59', allDay: false })
    })
  })

  describe('floating datetimes (no Z, no TZID) — already local wall time', () => {
    it('is taken as-is, with no conversion at all', () => {
      expect(parseIcsDate('20250315T130000', {})).toEqual({ value: '2025-03-15T13:00:00', allDay: false })
    })
  })

  describe('TZID-qualified datetimes — converted from that zone to local wall time', () => {
    it('round-trips the same wall clock when TZID is already the viewer’s own zone', () => {
      expect(parseIcsDate('20240115T130000', { TZID: 'America/New_York' }))
        .toEqual({ value: '2024-01-15T13:00:00', allDay: false })
    })

    it('converts from another zone (Europe/London) to New York', () => {
      // 13:00 in London in January (GMT, UTC+0) is 08:00 in New York (EST, UTC-5).
      expect(parseIcsDate('20240115T130000', { TZID: 'Europe/London' }))
        .toEqual({ value: '2024-01-15T08:00:00', allDay: false })
    })

    it('accounts for the other zone’s own DST rules, not the viewer’s', () => {
      // US clocks sprang forward on March 10, 2024; UK clocks don't until March 31.
      // On March 15, New York is already EDT (UTC-4) while London is still GMT
      // (UTC+0) — a 4-hour gap, not the 5-hour one that holds once both are in DST.
      expect(parseIcsDate('20240315T130000', { TZID: 'Europe/London' }))
        .toEqual({ value: '2024-03-15T09:00:00', allDay: false })
    })

    it('falls back to floating for a TZID no Intl zone database recognises', () => {
      expect(parseIcsDate('20240115T130000', { TZID: 'Not/AZone' }))
        .toEqual({ value: '2024-01-15T13:00:00', allDay: false })
    })
  })

  describe('values outside the ICS shapes', () => {
    it('falls back to JS Date parsing rather than dropping the value outright', () => {
      const result = parseIcsDate('2025-03-15T13:00:00+02:00', {})
      expect(result?.allDay).toBe(false)
      expect(typeof result?.value).toBe('string')
    })

    it('returns null for something neither ICS nor Date can read', () => {
      expect(parseIcsDate('not-a-date', {})).toBeNull()
    })

    it('returns null for a malformed VALUE=DATE value', () => {
      expect(parseIcsDate('2025-03-15', { VALUE: 'DATE' })).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// parseIcs
// ---------------------------------------------------------------------------

describe('parseIcs', () => {
  const minimalVcalendar = (veventBody) => [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    veventBody,
    'END:VCALENDAR',
  ].join('\r\n')

  const makeVevent = (fields) => [
    'BEGIN:VEVENT',
    ...fields,
    'END:VEVENT',
  ].join('\r\n')

  it('returns an empty array for ICS with no VEVENT blocks', () => {
    const ics = minimalVcalendar('')
    expect(parseIcs(ics)).toEqual([])
  })

  it('parses a minimal VEVENT with DTSTART, DTEND, SUMMARY, and UID', () => {
    const vevent = makeVevent([
      'UID:test-uid-001',
      'DTSTART:20250610T090000Z',
      'DTEND:20250610T100000Z',
      'SUMMARY:Team meeting',
    ])
    const ics = minimalVcalendar(vevent)
    const result = parseIcs(ics)
    expect(result).toHaveLength(1)
    const ev = result[0]
    expect(ev.id).toBe('test-uid-001')
    expect(ev.title).toBe('Team meeting')
    // 09:00/10:00 UTC in June (EDT, UTC-4) is 05:00/06:00 in New York.
    expect(ev.start).toBe('2025-06-10T05:00:00')
    expect(ev.end).toBe('2025-06-10T06:00:00')
    expect(ev.allDay).toBe(false)
  })

  it('falls back to "Untitled event" when SUMMARY is missing', () => {
    const vevent = makeVevent([
      'UID:no-summary-uid',
      'DTSTART:20250610T090000Z',
      'DTEND:20250610T100000Z',
    ])
    const result = parseIcs(minimalVcalendar(vevent))
    expect(result[0].title).toBe('Untitled event')
  })

  it('skips VEVENT blocks that have no DTSTART', () => {
    const vevent = makeVevent([
      'UID:no-start-uid',
      'SUMMARY:No start event',
    ])
    const result = parseIcs(minimalVcalendar(vevent))
    expect(result).toHaveLength(0)
  })

  it('parses DESCRIPTION and LOCATION fields, unescaping \\n', () => {
    const vevent = makeVevent([
      'UID:desc-uid',
      'DTSTART:20250801T120000Z',
      'DTEND:20250801T130000Z',
      'SUMMARY:Lunch',
      'DESCRIPTION:Bring your laptop\\nSee you there',
      'LOCATION:Room 42',
    ])
    const result = parseIcs(minimalVcalendar(vevent))
    expect(result[0].description).toBe('Bring your laptop\nSee you there')
    expect(result[0].location).toBe('Room 42')
  })

  it('parses multiple VEVENT blocks', () => {
    const v1 = makeVevent([
      'UID:uid-a',
      'DTSTART:20250301T090000Z',
      'DTEND:20250301T100000Z',
      'SUMMARY:Event A',
    ])
    const v2 = makeVevent([
      'UID:uid-b',
      'DTSTART:20250302T090000Z',
      'DTEND:20250302T100000Z',
      'SUMMARY:Event B',
    ])
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      v1,
      v2,
      'END:VCALENDAR',
    ].join('\r\n')
    const result = parseIcs(ics)
    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toEqual(['uid-a', 'uid-b'])
  })

  it('handles line folding (wrapped long lines)', () => {
    // ICS allows long lines to be folded with CRLF + space/tab
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:fold-uid',
      'DTSTART:20250610T090000Z',
      'DTEND:20250610T100000Z',
      'SUMMARY:Folded summ',
      ' ary text',  // folded continuation
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const result = parseIcs(ics)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Folded summary text')
  })

  it('folds correctly even when the wrapped line splits a parametrised property', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:fold-params-uid',
      'DTSTART;TZID=America/New',
      ' _York:20240115T130000',
      'SUMMARY:Folded params',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const result = parseIcs(ics)
    expect(result[0]).toMatchObject({ start: '2024-01-15T13:00:00', allDay: false })
  })

  it('generates a fallback id when UID is missing', () => {
    const vevent = makeVevent([
      'DTSTART:20250610T090000Z',
      'DTEND:20250610T100000Z',
      'SUMMARY:No UID event',
    ])
    const result = parseIcs(minimalVcalendar(vevent))
    expect(result).toHaveLength(1)
    expect(typeof result[0].id).toBe('string')
    expect(result[0].id.startsWith('ics-')).toBe(true)
  })

  describe('all-day events (VALUE=DATE)', () => {
    it('a date-only DTSTART/DTEND becomes bare dates, allDay: true', () => {
      const vevent = makeVevent([
        'UID:allday-1',
        'DTSTART;VALUE=DATE:20240115',
        'DTEND;VALUE=DATE:20240116',
        'SUMMARY:Reading day',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15', end: '2024-01-16', allDay: true })
    })

    it('a multi-day all-day event keeps the exclusive end iCalendar (and this app) both use', () => {
      const vevent = makeVevent([
        'UID:allday-multi',
        'DTSTART;VALUE=DATE:20240115',
        'DTEND;VALUE=DATE:20240118',
        'SUMMARY:Reading week',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      // Covers the 15th, 16th and 17th — the 18th is the exclusive end, not a 4th day.
      expect(result[0]).toMatchObject({ start: '2024-01-15', end: '2024-01-18', allDay: true })
    })

    it('a date-only DTSTART with no DTEND is still all-day', () => {
      const vevent = makeVevent([
        'UID:allday-no-end',
        'DTSTART;VALUE=DATE:20240115',
        'SUMMARY:One day, no end given',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15', allDay: true })
      expect(result[0].end).toBeUndefined()
    })
  })

  describe('timed events and timezones', () => {
    it('a Zulu DTSTART/DTEND converts to local wall time and is not allDay', () => {
      const vevent = makeVevent([
        'UID:zulu-1',
        'DTSTART:20240115T190000Z',
        'DTEND:20240115T200000Z',
        'SUMMARY:Evening thing',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      // 19:00/20:00 UTC in January (EST, UTC-5) is 14:00/15:00 in New York.
      expect(result[0]).toMatchObject({ start: '2024-01-15T14:00:00', end: '2024-01-15T15:00:00', allDay: false })
    })

    it('a floating DTSTART (no Z, no TZID) is taken as local wall time as-is', () => {
      const vevent = makeVevent([
        'UID:floating-1',
        'DTSTART:20240115T130000',
        'SUMMARY:Floating thing',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15T13:00:00', allDay: false })
    })

    it('a TZID in another zone is converted to local wall time', () => {
      const vevent = makeVevent([
        'UID:tzid-london',
        'DTSTART;TZID=Europe/London:20240115T130000',
        'SUMMARY:London meeting',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      // 13:00 in London in January (GMT) is 08:00 in New York (EST).
      expect(result[0]).toMatchObject({ start: '2024-01-15T08:00:00', allDay: false })
    })

    it('an unrecognised TZID falls back to floating instead of dropping the event', () => {
      const vevent = makeVevent([
        'UID:tzid-unknown',
        'DTSTART;TZID=Mars/OlympusMons:20240115T130000',
        'SUMMARY:Unplaceable event',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15T13:00:00', allDay: false })
    })

    it('reads params correctly when VALUE=DATE-TIME and TZID both sit before the colon', () => {
      // The property line that broke the old parser: rawLine.split(':') kept this whole
      // prefix in the "key" half, which `key.startsWith('DTSTART')` then let straight
      // through without ever looking at it.
      const vevent = makeVevent([
        'UID:params-1',
        'DTSTART;TZID=America/New_York;VALUE=DATE-TIME:20240115T130000',
        'SUMMARY:Params order',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15T13:00:00', allDay: false })
    })

    it('unquotes a quoted TZID instead of silently treating the time as floating', () => {
      const vevent = makeVevent([
        'UID:tzid-quoted',
        'DTSTART;TZID="Europe/London":20240115T130000',
        'SUMMARY:Quoted zone',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15T08:00:00', allDay: false })
    })

    it('does not split on a colon or semicolon inside a quoted parameter value', () => {
      // RFC 5545 requires the quotes exactly when a parameter value holds : ; or ,
      const vevent = makeVevent([
        'UID:quoted-colon',
        'DTSTART;X-NOTE="a:b;c";TZID=Europe/London:20240115T130000',
        'SUMMARY:Quoted colon',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0]).toMatchObject({ start: '2024-01-15T08:00:00', allDay: false })
    })
  })

  describe('text escaping (RFC 5545 §3.3.11)', () => {
    it('unescapes \\, \\; and \\\\ in addition to \\n', () => {
      const vevent = makeVevent([
        'UID:escape-1',
        'DTSTART:20240115T130000Z',
        'SUMMARY:Lab\\; part 1\\, "notes"',
        'DESCRIPTION:Line one\\nLine two with a\\\\backslash',
        'LOCATION:Room 1\\, Building A',
      ])
      const result = parseIcs(minimalVcalendar(vevent))
      expect(result[0].title).toBe('Lab; part 1, "notes"')
      expect(result[0].description).toBe('Line one\nLine two with a\\backslash')
      expect(result[0].location).toBe('Room 1, Building A')
    })
  })

  describe('round trip through icsExport', () => {
    it('reads back a timed event at the same wall-clock time it was exported with', () => {
      const stored = {
        id: 'e1', title: 'Study group',
        start: '2026-03-04T14:00:00', end: '2026-03-04T15:00:00', allDay: false,
      }
      const parsed = parseIcs(serializeIcs([stored]))
      expect(parsed[0]).toMatchObject({ start: stored.start, end: stored.end, allDay: false })
    })

    it('reads back an all-day event on the same calendar day, exclusive end intact', () => {
      const stored = { id: 'a1', title: 'Reading week', start: '2026-03-04', end: '2026-03-07', allDay: true }
      const parsed = parseIcs(serializeIcs([stored]))
      expect(parsed[0]).toMatchObject({ start: '2026-03-04', end: '2026-03-07', allDay: true })
    })

    it('reads back a single-day all-day event, whose exclusive end is the next calendar day', () => {
      const stored = { id: 'a2', title: 'Holiday', start: '2026-03-04', allDay: true }
      const parsed = parseIcs(serializeIcs([stored]))
      expect(parsed[0]).toMatchObject({ start: '2026-03-04', end: '2026-03-05', allDay: true })
    })
  })
})
