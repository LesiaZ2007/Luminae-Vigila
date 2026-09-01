import { describe, it, expect } from 'vitest'
import {
  BACKUP_VERSION, BACKUP_COLLECTIONS, PREF_KEYS, NOT_BACKED_UP,
  readLocalPrefs, applyLocalPrefs, buildBackup, readBackup, looksLikeBackup,
} from '@/lib/backup'
import { SYNC_KEYS } from '@/lib/syncDelta'

/** A stand-in for localStorage that needs no jsdom. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    dump: () => Object.fromEntries(map),
  }
}

describe('what a backup covers', () => {
  /* The export lost the class schedule because the payload was a hand-written object
     literal that nobody thought to extend. This is the guard against a fourth round. */
  it('covers every synced collection', () => {
    const backed = new Set(BACKUP_COLLECTIONS.map(c => c.key))
    // eventPrefs is synced but is a settings blob, not a list — it rides separately.
    const expected = SYNC_KEYS.filter(k => k !== 'eventPrefs')
    for (const key of expected) expect(backed.has(key)).toBe(true)
  })

  it('gives every collection a label for the import summary', () => {
    for (const c of BACKUP_COLLECTIONS) expect(c.label).toBeTruthy()
  })

  it('names the things it deliberately leaves out', () => {
    expect(NOT_BACKED_UP).toContain('lv-canvas-assignments')
    expect(NOT_BACKED_UP).toContain('lv-canvas-seen-ids')
  })
})

describe('readLocalPrefs', () => {
  it('reads the settings blobs', () => {
    const storage = fakeStorage({
      [PREF_KEYS.canvas]: JSON.stringify({ courseColors: { 42: '#fff' } }),
      [PREF_KEYS.gpa]:    JSON.stringify({ credits: { 42: 4 } }),
    })
    const prefs = readLocalPrefs(storage)
    expect(prefs.canvas.courseColors).toEqual({ 42: '#fff' })
    expect(prefs.gpa.credits).toEqual({ 42: 4 })
  })

  /* A Canvas feed URL is a capability, not a preference: anyone holding it can read
     your calendar without being you, and backups get emailed around. */
  it('strips the Canvas feed URL', () => {
    const storage = fakeStorage({
      [PREF_KEYS.canvas]: JSON.stringify({ icsUrl: 'https://canvas.example/feeds/abc123.ics', showOnCalendar: true }),
    })
    const prefs = readLocalPrefs(storage)
    expect(prefs.canvas.icsUrl).toBeUndefined()
    expect(prefs.canvas.showOnCalendar).toBe(true)
  })

  it('never emits the feed URL anywhere in the file', () => {
    const storage = fakeStorage({
      [PREF_KEYS.canvas]: JSON.stringify({ icsUrl: 'https://canvas.example/feeds/SECRET.ics' }),
    })
    const json = JSON.stringify(buildBackup({ prefs: readLocalPrefs(storage) }))
    expect(json).not.toContain('SECRET')
  })

  it('omits a blob that is empty once stripped, rather than writing {}', () => {
    const storage = fakeStorage({ [PREF_KEYS.canvas]: JSON.stringify({ icsUrl: 'x' }) })
    expect(readLocalPrefs(storage).canvas).toBeUndefined()
  })

  it('survives absent and corrupt entries', () => {
    expect(readLocalPrefs(fakeStorage())).toEqual({})
    expect(readLocalPrefs(fakeStorage({ [PREF_KEYS.gpa]: 'not json' }))).toEqual({})
    expect(readLocalPrefs(undefined)).toEqual({})
  })
})

describe('applyLocalPrefs', () => {
  it('writes the blobs back', () => {
    const storage = fakeStorage()
    applyLocalPrefs({ gpa: { credits: { 1: 3 } } }, storage)
    expect(JSON.parse(storage.dump()[PREF_KEYS.gpa])).toEqual({ credits: { 1: 3 } })
  })

  /* Restoring must not wipe the feed URL on a device that has one, purely because
     the file was written without it. */
  it('merges over what is there, so a redacted field survives', () => {
    const storage = fakeStorage({
      [PREF_KEYS.canvas]: JSON.stringify({ icsUrl: 'https://keep.me/feed.ics', showOnCalendar: false }),
    })
    applyLocalPrefs({ canvas: { showOnCalendar: true } }, storage)
    const after = JSON.parse(storage.dump()[PREF_KEYS.canvas])
    expect(after.icsUrl).toBe('https://keep.me/feed.ics')
    expect(after.showOnCalendar).toBe(true)
  })

  it('ignores junk instead of throwing', () => {
    const storage = fakeStorage()
    expect(() => applyLocalPrefs(null, storage)).not.toThrow()
    expect(() => applyLocalPrefs({ gpa: 'nope' }, storage)).not.toThrow()
    expect(storage.dump()).toEqual({})
  })

  it('does not abandon the rest of a restore when storage refuses a write', () => {
    const storage = {
      getItem: () => null,
      setItem: k => { if (k === PREF_KEYS.canvas) throw new Error('QuotaExceeded') },
    }
    expect(() => applyLocalPrefs({ canvas: { a: 1 }, gpa: { b: 2 } }, storage)).not.toThrow()
  })
})

describe('buildBackup', () => {
  it('writes every collection, empty ones included', () => {
    const data = buildBackup({ collections: { events: [{ id: 'e1' }] } })
    for (const { key } of BACKUP_COLLECTIONS) expect(Array.isArray(data[key])).toBe(true)
    expect(data.events).toHaveLength(1)
    expect(data.notes).toEqual([])
  })

  it('stamps the current version', () => {
    expect(buildBackup({}).version).toBe(BACKUP_VERSION)
  })

  it('coerces junk to the right empty shape rather than writing it through', () => {
    const data = buildBackup({ collections: { events: 'nope' }, eventPrefs: 'nope', prefs: null })
    expect(data.events).toEqual([])
    expect(data.eventPrefs).toEqual({})
    expect(data.preferences).toEqual({})
  })
})

describe('readBackup', () => {
  it('round-trips what buildBackup wrote', () => {
    const data = buildBackup({
      collections: { classSchedule: [{ id: 'c1', courseName: 'Physics' }] },
      eventPrefs: { e1: { hidden: true } },
      prefs: { gpa: { credits: { 1: 3 } } },
    })
    const read = readBackup(JSON.parse(JSON.stringify(data)))
    expect(read.collections.classSchedule).toHaveLength(1)
    expect(read.eventPrefs).toEqual({ e1: { hidden: true } })
    expect(read.preferences.gpa.credits).toEqual({ 1: 3 })
  })

  // What lets a v1 file restore exactly as it always did.
  it('reads an old file, defaulting the keys it never had', () => {
    const read = readBackup({ version: 1, events: [{ id: 'e1' }], todos: [] })
    expect(read.version).toBe(1)
    expect(read.collections.events).toHaveLength(1)
    expect(read.collections.classSchedule).toEqual([])
    expect(read.collections.studySessions).toEqual([])
  })

  /* undefined, not {} — the difference between "you have no hidden events" and "this
     file has nothing to say about hidden events". Only the first should overwrite. */
  it('leaves absent settings undefined rather than empty', () => {
    const read = readBackup({ version: 1, events: [] })
    expect(read.eventPrefs).toBeUndefined()
    expect(read.preferences).toBeUndefined()
  })

  it('turns a malformed collection into an empty one', () => {
    expect(readBackup({ events: 'nope' }).collections.events).toEqual([])
    expect(readBackup(null).collections.events).toEqual([])
  })
})

describe('looksLikeBackup', () => {
  it('accepts a file carrying any single collection', () => {
    expect(looksLikeBackup({ classSchedule: [] })).toBe(true)
    expect(looksLikeBackup({ notes: [] })).toBe(true)
  })

  it('accepts a settings-only file', () => {
    expect(looksLikeBackup({ preferences: { gpa: {} } })).toBe(true)
  })

  it('rejects anything else', () => {
    expect(looksLikeBackup({ hello: 'world' })).toBe(false)
    expect(looksLikeBackup(null)).toBe(false)
    expect(looksLikeBackup('a string')).toBe(false)
  })
})

describe('applyLocalPrefs — replace', () => {
  it('drops fields the file does not mention', () => {
    const storage = fakeStorage({ [PREF_KEYS.gpa]: JSON.stringify({ credits: { 1: 3 }, overrides: { 1: 90 } }) })
    applyLocalPrefs({ gpa: { credits: { 2: 4 } } }, storage, { replace: true })
    expect(JSON.parse(storage.dump()[PREF_KEYS.gpa])).toEqual({ credits: { 2: 4 } })
  })

  /* The feed URL is absent because *we* stripped it on the way out, not because the
     user cleared it — deleting it as a side effect of protecting it would be the
     worst of both. */
  it('still keeps a redacted field, which the file was never allowed to carry', () => {
    const storage = fakeStorage({
      [PREF_KEYS.canvas]: JSON.stringify({ icsUrl: 'https://keep.me/f.ics', showOnCalendar: false, stale: true }),
    })
    applyLocalPrefs({ canvas: { showOnCalendar: true } }, storage, { replace: true })
    const after = JSON.parse(storage.dump()[PREF_KEYS.canvas])
    expect(after.icsUrl).toBe('https://keep.me/f.ics')
    expect(after.showOnCalendar).toBe(true)
    expect(after.stale).toBeUndefined()
  })

  it('leaves a blob alone when the file has nothing for it', () => {
    const storage = fakeStorage({ [PREF_KEYS.gpa]: JSON.stringify({ credits: { 1: 3 } }) })
    applyLocalPrefs({ canvas: { a: 1 } }, storage, { replace: true })
    expect(JSON.parse(storage.dump()[PREF_KEYS.gpa])).toEqual({ credits: { 1: 3 } })
  })
})

describe('readBackup — which collections the file actually carried', () => {
  it('lists every collection of a full backup', () => {
    const data = buildBackup({ collections: { events: [] } })
    expect(readBackup(data).present).toHaveLength(BACKUP_COLLECTIONS.length)
  })

  /* A full restore must only clear what the file has an opinion about; wiping
     classes because an old backup predates them would be data loss dressed up. */
  it('lists only what an older file has', () => {
    const read = readBackup({ version: 1, events: [{ id: 'e1' }], todos: [] })
    expect(read.present.sort()).toEqual(['events', 'todos'])
    expect(read.present).not.toContain('classSchedule')
  })

  it('is empty for a file with no collections at all', () => {
    expect(readBackup({ preferences: {} }).present).toEqual([])
  })
})
