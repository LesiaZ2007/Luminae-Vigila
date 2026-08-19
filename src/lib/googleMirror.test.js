import { describe, it, expect } from 'vitest'
import {
  buildDesiredEvents, diffMirror, googleEventId, contentHash,
  MIRROR_CALENDAR_NAME, LV_PROP,
} from '@/lib/googleMirror'

// Fixed clock so the mirror window is deterministic.
const NOW = new Date('2026-08-18T12:00:00').getTime()
const opts = extra => ({ timeZone: 'America/New_York', now: NOW, ...extra })

const ev = o => ({ id: 'e1', title: 'Dentist', start: '2026-08-20T15:00:00', ...o })
const td = o => ({ id: 't1', title: 'Lab report', dueDate: '2026-08-20', ...o })

describe('googleEventId', () => {
  // Google rejects ids outside base32hex with a 400, and app ids contain '-'.
  it('produces only characters Google accepts', () => {
    const id = googleEventId('ev', 'note-1786154181355-abc12')
    expect(id).toMatch(/^lv[a-v0-9]+$/)
    expect(id.length).toBeGreaterThanOrEqual(5)
  })

  it('is stable, which is what makes the write an upsert', () => {
    expect(googleEventId('ev', 'e1')).toBe(googleEventId('ev', 'e1'))
  })

  it('does not collide between a task and an event sharing an id', () => {
    expect(googleEventId('ev', '123')).not.toBe(googleEventId('td', '123'))
  })
})

describe('buildDesiredEvents — events', () => {
  it('maps a timed event with an explicit zone', () => {
    const [g] = buildDesiredEvents(opts({ events: [ev()] }))
    expect(g.summary).toBe('Dentist')
    expect(g.start).toEqual({ dateTime: '2026-08-20T15:00:00', timeZone: 'America/New_York' })
    expect(g.extendedProperties.private[LV_PROP]).toBe('ev:e1')
  })

  // Google rejects a zero-length timed event.
  it('gives an event with no end a one-hour duration', () => {
    const [g] = buildDesiredEvents(opts({ events: [ev({ end: undefined })] }))
    expect(g.end.dateTime).toBe('2026-08-20T16:00:00')
  })

  it('maps an all-day event with an exclusive end date', () => {
    const [g] = buildDesiredEvents(opts({ events: [ev({ start: '2026-08-20', allDay: true, end: undefined })] }))
    expect(g.start).toEqual({ date: '2026-08-20' })
    expect(g.end).toEqual({ date: '2026-08-21' })
  })

  it('skips events with no title or no start rather than writing blanks', () => {
    expect(buildDesiredEvents(opts({ events: [ev({ title: '' }), ev({ id: 'e2', start: null })] }))).toHaveLength(0)
  })

  it('bounds the window — At a Glance only looks forward, so old history is not worth API calls', () => {
    const far  = ev({ id: 'far',  start: '2027-06-01T09:00:00' })
    const old  = ev({ id: 'old',  start: '2020-01-01T09:00:00' })
    const near = ev({ id: 'near', start: '2026-08-19T09:00:00' })
    const ids  = buildDesiredEvents(opts({ events: [far, old, near] })).map(g => g.extendedProperties.private[LV_PROP])
    expect(ids).toEqual(['ev:near'])
  })
})

describe('buildDesiredEvents — tasks', () => {
  it('maps a due-dated task to an all-day event, marked so a glance can tell them apart', () => {
    const [g] = buildDesiredEvents(opts({ todos: [td()] }))
    expect(g.summary).toBe('☑ Lab report')
    expect(g.start).toEqual({ date: '2026-08-20' })
    expect(g.end).toEqual({ date: '2026-08-21' })
    expect(g.extendedProperties.private[LV_PROP]).toBe('td:t1')
  })

  it('skips a task with no due date — there is nowhere on a calendar to put it', () => {
    expect(buildDesiredEvents(opts({ todos: [td({ dueDate: '' })] }))).toHaveLength(0)
  })

  it('skips completed tasks, which are noise on a glance surface', () => {
    expect(buildDesiredEvents(opts({ todos: [td({ completed: true })] }))).toHaveLength(0)
  })
})

describe('diffMirror', () => {
  const desired = buildDesiredEvents(opts({ events: [ev()], todos: [td()] }))

  it('inserts everything when Google is empty', () => {
    const d = diffMirror(desired, [])
    expect(d.inserts).toHaveLength(2)
    expect(d.updates).toHaveLength(0)
    expect(d.deletes).toHaveLength(0)
  })

  // Without hashing, every reconcile would PATCH every event forever.
  it('writes nothing when Google already matches', () => {
    const existing = desired.map(g => ({ id: g.id, extendedProperties: g.extendedProperties }))
    const d = diffMirror(desired, existing)
    expect(d.inserts).toHaveLength(0)
    expect(d.updates).toHaveLength(0)
    expect(d.deletes).toHaveLength(0)
    expect(d.unchanged).toBe(2)
  })

  it('updates only the item whose content changed', () => {
    const existing = desired.map(g => ({ id: g.id, extendedProperties: g.extendedProperties }))
    const moved = buildDesiredEvents(opts({ events: [ev({ start: '2026-08-21T15:00:00' })], todos: [td()] }))
    const d = diffMirror(moved, existing)
    expect(d.updates).toHaveLength(1)
    expect(d.updates[0].extendedProperties.private[LV_PROP]).toBe('ev:e1')
    expect(d.inserts).toHaveLength(0)
    expect(d.deletes).toHaveLength(0)
  })

  it('deletes ours that the app no longer wants', () => {
    const existing = desired.map(g => ({ id: g.id, extendedProperties: g.extendedProperties }))
    const d = diffMirror(buildDesiredEvents(opts({ events: [ev()] })), existing)
    expect(d.deletes).toEqual([googleEventId('td', 't1')])
  })

  // Anything without our marker is the user's own; deleting it would be destroying
  // data we never created.
  it('never touches events that are not ours', () => {
    const foreign = { id: 'someGoogleEvent', summary: 'Birthday' }
    const d = diffMirror(desired, [foreign])
    expect(d.deletes).not.toContain('someGoogleEvent')
    expect(d.deletes).toHaveLength(0)
  })

  it('reconciles a copy the user duplicated by hand, which keeps the marker but gets a new id', () => {
    const [first] = desired
    const dupe = { id: 'userMadeCopy', extendedProperties: { private: { [LV_PROP]: first.extendedProperties.private[LV_PROP], lvHash: 'stale' } } }
    const d = diffMirror([first], [dupe])
    expect(d.updates).toHaveLength(1)
    expect(d.updates[0].googleId).toBe('userMadeCopy')
  })
})

describe('contentHash', () => {
  it('changes when a time changes', () => {
    const a = { summary: 'X', start: { date: '2026-08-20' }, end: { date: '2026-08-21' } }
    const b = { summary: 'X', start: { date: '2026-08-21' }, end: { date: '2026-08-22' } }
    expect(contentHash(a)).not.toBe(contentHash(b))
  })

  it('changes when a title changes', () => {
    const a = { summary: 'X', start: { date: '2026-08-20' }, end: { date: '2026-08-21' } }
    expect(contentHash(a)).not.toBe(contentHash({ ...a, summary: 'Y' }))
  })

  it('is stable across calls, or every reconcile would rewrite everything', () => {
    const a = { summary: 'X', start: { date: '2026-08-20' }, end: { date: '2026-08-21' } }
    expect(contentHash(a)).toBe(contentHash(a))
  })
})

describe('MIRROR_CALENDAR_NAME', () => {
  it('is a non-empty constant, used both to create and to filter the calendar', () => {
    expect(MIRROR_CALENDAR_NAME).toBeTruthy()
  })
})
