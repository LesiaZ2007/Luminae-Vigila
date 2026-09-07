import { describe, it, expect } from 'vitest'
import { setEventPref, mergeEventPrefs, mergeEventPrefsCloudWins, stampAllPrefs } from './eventPrefs'

const T = {
  early: '2026-09-01T10:00:00.000Z',
  mid:   '2026-09-02T10:00:00.000Z',
  late:  '2026-09-03T10:00:00.000Z',
}

describe('setEventPref', () => {
  it('stamps the entry it writes', () => {
    const prefs = setEventPref({}, 'e1', { hidden: true }, T.mid)
    expect(prefs.e1).toEqual({ hidden: true, updatedAt: T.mid })
  })

  it('merges into an existing entry rather than replacing it', () => {
    const first  = setEventPref({}, 'e1', { hidden: true }, T.early)
    const second = setEventPref(first, 'e1', { color: '#f00' }, T.late)
    expect(second.e1).toEqual({ hidden: true, color: '#f00', updatedAt: T.late })
  })

  it('leaves other events alone', () => {
    const prefs = setEventPref(setEventPref({}, 'e1', { hidden: true }, T.early), 'e2', { important: true }, T.late)
    expect(prefs.e1).toEqual({ hidden: true, updatedAt: T.early })
  })

  it('survives a null prefs object', () => {
    expect(setEventPref(null, 'e1', { hidden: true }, T.mid).e1.hidden).toBe(true)
  })
})

describe('stampAllPrefs', () => {
  it('stamps every entry as of the restore', () => {
    const stamped = stampAllPrefs({ e1: { hidden: true }, e2: { color: '#f00', updatedAt: T.early } }, T.late)
    expect(stamped.e1.updatedAt).toBe(T.late)
    expect(stamped.e2.updatedAt).toBe(T.late)
  })

  it('keeps the values it stamps', () => {
    expect(stampAllPrefs({ e1: { hidden: true, color: '#f00' } }, T.mid).e1)
      .toEqual({ hidden: true, color: '#f00', updatedAt: T.mid })
  })

  /* Without this a restored pref carries the backup's old stamp and loses the very
     next merge to a fresher copy elsewhere — the restore silently undoes itself. */
  it('makes a restored pref win the next merge against a stale remote copy', () => {
    const restored = stampAllPrefs({ e1: { hidden: true } }, T.late)
    const cloud    = { e1: { hidden: false, updatedAt: T.mid } }
    expect(mergeEventPrefs(cloud, restored).e1.hidden).toBe(true)
  })

  it('survives null', () => {
    expect(stampAllPrefs(null, T.mid)).toEqual({})
  })
})

/* The bug: un-marking an event important on one device, then merging on another
   that never heard about it. The stale entry won as "local" and was pushed back
   over the un-mark. */
describe('mergeEventPrefs', () => {
  it('the newer entry wins — an un-mark beats a stale mark', () => {
    const cloud = { e1: { important: false, updatedAt: T.late } }
    const local = { e1: { important: true,  updatedAt: T.early } }
    expect(mergeEventPrefs(cloud, local).e1.important).toBe(false)
  })

  it('and wins in the other direction too', () => {
    const cloud = { e1: { important: true,  updatedAt: T.early } }
    const local = { e1: { important: false, updatedAt: T.late } }
    expect(mergeEventPrefs(cloud, local).e1.important).toBe(false)
  })

  /* The heart of it: two events are two decisions. Hiding one on the phone must
     not discard a colour set on the other on the laptop. */
  it('resolves each event separately', () => {
    const cloud = { e1: { hidden: true,   updatedAt: T.late } }
    const local = { e2: { color: '#f00',  updatedAt: T.mid } }
    const merged = mergeEventPrefs(cloud, local)
    expect(merged.e1.hidden).toBe(true)
    expect(merged.e2.color).toBe('#f00')
  })

  it('a stamped cloud entry beats an unstamped local one', () => {
    const merged = mergeEventPrefs({ e1: { hidden: true, updatedAt: T.mid } }, { e1: { hidden: false } })
    expect(merged.e1.hidden).toBe(true)
  })

  it('a stamped local entry beats an unstamped cloud one', () => {
    const merged = mergeEventPrefs({ e1: { hidden: false } }, { e1: { hidden: true, updatedAt: T.mid } })
    expect(merged.e1.hidden).toBe(true)
  })

  it('falls back to local when neither side is stamped', () => {
    const merged = mergeEventPrefs({ e1: { color: '#00f' } }, { e1: { color: '#f00' } })
    expect(merged.e1.color).toBe('#f00')
  })

  it('keeps entries only one side has', () => {
    const merged = mergeEventPrefs({ e1: { hidden: true } }, { e2: { hidden: true } })
    expect(Object.keys(merged).sort()).toEqual(['e1', 'e2'])
  })

  it('survives null on either side', () => {
    expect(mergeEventPrefs(null, { e1: { hidden: true } }).e1.hidden).toBe(true)
    expect(mergeEventPrefs({ e1: { hidden: true } }, null).e1.hidden).toBe(true)
    expect(mergeEventPrefs(null, null)).toEqual({})
  })

  /* The old code merged one direction at sign-in and the other on the refresh
     button, so the same two devices settled on different answers depending on how
     they synced. Both paths run the same resolution now. */
  it('gives the same answer whichever path runs it', () => {
    const cloud = { e1: { important: false, updatedAt: T.late } }
    const local = { e1: { important: true,  updatedAt: T.early } }
    expect(mergeEventPrefsCloudWins(cloud, local)).toEqual(mergeEventPrefs(cloud, local))
  })

  it('a pref set here seconds ago survives the refresh button', () => {
    const cloud = { e1: { hidden: true,  updatedAt: T.early } }
    const local = { e1: { hidden: false, updatedAt: T.late } }
    expect(mergeEventPrefsCloudWins(cloud, local).e1.hidden).toBe(false)
  })
})
