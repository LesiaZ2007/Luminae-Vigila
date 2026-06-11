import { describe, it, expect } from 'vitest'
import { parseIcsDate, parseIcs } from './ics.js'

// ---------------------------------------------------------------------------
// parseIcsDate
// ---------------------------------------------------------------------------

describe('parseIcsDate', () => {
  it('parses a Zulu datetime string into a valid ISO-8601 string', () => {
    const result = parseIcsDate('20250315T130000Z')
    expect(result).toBe('2025-03-15T13:00:00.000Z')
  })

  it('parses a datetime string without trailing Z', () => {
    const result = parseIcsDate('20250315T130000')
    // Without Z the function treats it as UTC (appends Z internally)
    expect(result).toBe('2025-03-15T13:00:00.000Z')
  })

  it('parses a date-only ICS value (no T separator)', () => {
    // Date-only: 20250315 — hour/min/sec default to '00'
    const result = parseIcsDate('20250315')
    expect(result).toBe('2025-03-15T00:00:00.000Z')
  })

  it('preserves hours, minutes, and seconds correctly', () => {
    const result = parseIcsDate('20261225T235959Z')
    expect(result).toBe('2026-12-25T23:59:59.000Z')
  })

  it('returns a string (ISO format)', () => {
    const result = parseIcsDate('20250101T000000Z')
    expect(typeof result).toBe('string')
    // Basic ISO shape: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
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
    expect(ev.start).toBe('2025-06-10T09:00:00.000Z')
    expect(ev.end).toBe('2025-06-10T10:00:00.000Z')
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

  it('parses DESCRIPTION and LOCATION fields', () => {
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
})
