import { describe, it, expect } from 'vitest'
import {
  loadCalendarPrefs, saveCalendarPrefs, slotRange, toYMDLocal,
  DATE_TTL_MS, FOCUSED_RANGE, FULL_RANGE,
} from './calendarView'

/** Minimal localStorage stand-in — the node test environment has no DOM. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _dump:   () => Object.fromEntries(map),
  }
}

/** Storage that throws on every access, as it does in a locked-down webview. */
const hostileStorage = {
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
}

const NOW = 1_700_000_000_000

describe('saveCalendarPrefs / loadCalendarPrefs', () => {
  it('round-trips view, date and focus', () => {
    const s = fakeStorage()
    saveCalendarPrefs({ view: 'dayGridMonth', date: '2026-08-19', focused: true }, s, NOW)
    expect(loadCalendarPrefs(s, NOW)).toEqual({ view: 'dayGridMonth', date: '2026-08-19', focused: true })
  })

  it('reports no preference when nothing has been stored', () => {
    expect(loadCalendarPrefs(fakeStorage(), NOW)).toEqual({ view: null, date: null, focused: null })
  })

  it('keeps the view but drops a stale date', () => {
    // The view is a preference and never goes stale; the date is just where you were
    // looking, and restoring last week's on a fresh morning is noise.
    const s = fakeStorage()
    saveCalendarPrefs({ view: 'timeGridWeek', date: '2026-08-19', focused: false }, s, NOW)
    const later = loadCalendarPrefs(s, NOW + DATE_TTL_MS + 1)
    expect(later.view).toBe('timeGridWeek')
    expect(later.focused).toBe(false)
    expect(later.date).toBeNull()
  })

  it('keeps a date that is still inside the window', () => {
    const s = fakeStorage()
    saveCalendarPrefs({ view: 'timeGridDay', date: '2026-08-19', focused: false }, s, NOW)
    expect(loadCalendarPrefs(s, NOW + DATE_TTL_MS - 1).date).toBe('2026-08-19')
  })

  it('ignores a view name the toolbar cannot produce', () => {
    const s = fakeStorage({ 'lv-cal-view': JSON.stringify({ view: 'listYear', savedAt: NOW }) })
    expect(loadCalendarPrefs(s, NOW).view).toBeNull()
  })

  it('ignores a malformed date', () => {
    const s = fakeStorage({ 'lv-cal-view': JSON.stringify({ view: 'timeGridWeek', date: 'yesterday', savedAt: NOW }) })
    expect(loadCalendarPrefs(s, NOW).date).toBeNull()
  })

  it('survives malformed JSON rather than throwing at startup', () => {
    expect(loadCalendarPrefs(fakeStorage({ 'lv-cal-view': '{oh no' }), NOW))
      .toEqual({ view: null, date: null, focused: null })
  })

  it('survives storage that throws, in both directions', () => {
    expect(loadCalendarPrefs(hostileStorage, NOW)).toEqual({ view: null, date: null, focused: null })
    expect(() => saveCalendarPrefs({ view: 'timeGridDay', date: null, focused: true }, hostileStorage, NOW)).not.toThrow()
  })

  it('survives storage being absent entirely', () => {
    expect(loadCalendarPrefs(undefined, NOW)).toEqual({ view: null, date: null, focused: null })
    expect(() => saveCalendarPrefs({ view: 'timeGridDay' }, undefined, NOW)).not.toThrow()
  })

  it('treats a missing savedAt as stale rather than fresh', () => {
    const s = fakeStorage({ 'lv-cal-view': JSON.stringify({ view: 'timeGridWeek', date: '2026-08-19' }) })
    expect(loadCalendarPrefs(s, NOW).date).toBeNull()
  })

  it('reads focus back independently of the date expiring', () => {
    const s = fakeStorage()
    saveCalendarPrefs({ view: 'timeGridWeek', date: '2026-08-19', focused: true }, s, NOW)
    expect(loadCalendarPrefs(s, NOW + DATE_TTL_MS + 1).focused).toBe(true)
  })
})

describe('slotRange', () => {
  it('trims to a school day when focused', () => {
    expect(slotRange(true)).toEqual(FOCUSED_RANGE)
    expect(slotRange(true)).toEqual({ min: '07:00:00', max: '22:00:00' })
  })

  it('covers the whole day otherwise', () => {
    expect(slotRange(false)).toEqual(FULL_RANGE)
  })
})

describe('toYMDLocal', () => {
  it('reads the calendar day in local time, not UTC', () => {
    // 11pm on the 19th in America/New_York is already the 20th in UTC. toISOString()
    // would save the wrong day and reopen the calendar on it.
    expect(toYMDLocal(new Date(2026, 7, 19, 23, 30))).toBe('2026-08-19')
  })

  it('zero-pads month and day', () => {
    expect(toYMDLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('returns null for an unusable value', () => {
    expect(toYMDLocal('not a date')).toBeNull()
  })
})
