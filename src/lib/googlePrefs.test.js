// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  toEmailKeyed, toAccountKeyed, mergePrefs,
  readLocalPrefs, writeLocalPrefs, hydrateGooglePrefs, persistGooglePrefs, LS_KEY,
} from '@/lib/googlePrefs'

const hidden = { enabled: true, calendars: { work: { enabled: false }, personal: { enabled: true } } }

beforeEach(() => localStorage.clear())

describe('key translation', () => {
  const accounts = [{ id: 'uuid-1', email: 'a@x.com' }, { id: 'uuid-2', email: 'b@x.com' }]

  it('maps account ids out to emails for storage', () => {
    expect(toEmailKeyed({ 'uuid-1': hidden }, accounts)).toEqual({ 'a@x.com': hidden })
  })

  it('drops entries for accounts that are no longer connected', () => {
    expect(toEmailKeyed({ 'uuid-gone': hidden }, accounts)).toEqual({})
  })

  it('maps emails back onto whatever account id this session has', () => {
    expect(toAccountKeyed({ 'a@x.com': hidden }, accounts)).toEqual({ 'uuid-1': hidden })
  })

  // The whole point: disconnecting deletes the row, so re-adding mints a new UUID.
  // Keyed by id, every hidden calendar came back. Keyed by email, they stay hidden.
  it('reattaches saved choices after a reconnect changes the account id', () => {
    const saved = toEmailKeyed({ 'uuid-1': hidden }, accounts)
    const afterReconnect = [{ id: 'uuid-BRAND-NEW', email: 'a@x.com' }]
    expect(toAccountKeyed(saved, afterReconnect)).toEqual({ 'uuid-BRAND-NEW': hidden })
  })

  it('survives a round trip', () => {
    const back = toAccountKeyed(toEmailKeyed({ 'uuid-1': hidden }, accounts), accounts)
    expect(back['uuid-1']).toEqual(hidden)
  })
})

describe('mergePrefs', () => {
  const accounts = [{ id: 'uuid-1', email: 'a@x.com' }]

  it('lets the server win — it is the copy that survived and that other devices agree on', () => {
    const local  = { 'uuid-1': { enabled: true, calendars: { work: { enabled: true } } } }
    const merged = mergePrefs(local, { 'a@x.com': hidden }, accounts)
    expect(merged['uuid-1'].calendars.work.enabled).toBe(false)
  })

  it('keeps a local-only account rather than discarding an offline change', () => {
    const local = { 'uuid-other': hidden }
    expect(mergePrefs(local, {}, accounts)['uuid-other']).toEqual(hidden)
  })
})

describe('hydrateGooglePrefs', () => {
  const accounts = [{ id: 'uuid-1', email: 'a@x.com' }]

  it('returns the cache untouched when no accounts are connected', async () => {
    writeLocalPrefs({ 'uuid-1': hidden })
    const fetchImpl = vi.fn()
    expect(await hydrateGooglePrefs([], { fetchImpl })).toEqual({ 'uuid-1': hidden })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('pulls the saved choices down and writes them to the cache', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ prefs: { 'a@x.com': hidden } }) })
    const out = await hydrateGooglePrefs(accounts, { fetchImpl })
    expect(out['uuid-1']).toEqual(hidden)
    expect(readLocalPrefs()['uuid-1']).toEqual(hidden)
  })

  // Offline must not look like "the user un-hid everything".
  it('falls back to the cache when the server is unreachable', async () => {
    writeLocalPrefs({ 'uuid-1': hidden })
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await hydrateGooglePrefs(accounts, { fetchImpl })).toEqual({ 'uuid-1': hidden })
  })

  it('uploads choices that only ever existed in this browser', async () => {
    writeLocalPrefs({ 'uuid-1': hidden })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prefs: {} }) })  // GET: server knows nothing
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })   // PUT: migration
    await hydrateGooglePrefs(accounts, { fetchImpl })
    const put = fetchImpl.mock.calls.find(c => c[1]?.method === 'PUT')
    expect(put).toBeTruthy()
    expect(JSON.parse(put[1].body).prefs).toEqual({ 'a@x.com': hidden })
  })

  it('does not re-upload once the two already agree', async () => {
    writeLocalPrefs({ 'uuid-1': hidden })
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ prefs: { 'a@x.com': hidden } }) })
    await hydrateGooglePrefs(accounts, { fetchImpl })
    expect(fetchImpl.mock.calls.filter(c => c[1]?.method === 'PUT')).toHaveLength(0)
  })
})

describe('persistGooglePrefs', () => {
  const accounts = [{ id: 'uuid-1', email: 'a@x.com' }]

  it('always writes the cache, even when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    await persistGooglePrefs({ 'uuid-1': hidden }, accounts, { fetchImpl })
    expect(readLocalPrefs()['uuid-1']).toEqual(hidden)
  })

  // Sending {} would be indistinguishable from "clear everything" on the server.
  it('sends nothing when no pref can be attributed to an email yet', async () => {
    const fetchImpl = vi.fn()
    await persistGooglePrefs({ 'unknown-id': hidden }, accounts, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(localStorage.getItem(LS_KEY)).toBeTruthy()
  })

  it('uploads keyed by email', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await persistGooglePrefs({ 'uuid-1': hidden }, accounts, { fetchImpl })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).prefs).toEqual({ 'a@x.com': hidden })
  })
})
