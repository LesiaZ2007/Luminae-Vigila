/**
 * POST/DELETE /api/push/subscribe — and, in particular, the device's time zone: stored
 * when valid, dropped when not, and never erased by an older client that sends none.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createFakeSql } = await import('@/test/fakeSql')
  return { default: createFakeSql() }
})
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }))

/** A fresh route; the mocked modules survive resetModules, so they are emptied by hand. */
async function load({ session = { userId: 'u1' } } = {}) {
  vi.resetModules()
  const route            = await import('./route')
  const { default: sql } = await import('@/lib/db')
  const { getSession }   = await import('@/lib/session')
  sql.reset()
  getSession.mockReset()
  getSession.mockResolvedValue(session)
  return { ...route, sql }
}

const request = (method, body) => new Request('http://x/api/push/subscribe', {
  method, body: typeof body === 'string' ? body : JSON.stringify(body),
})

const subscription = (over = {}) => ({
  endpoint: 'https://push.example/abc', keys: { p256dh: 'p256', auth: 'auth' }, ...over,
})

/** The upsert's values, by column, in the INSERT's own column order. */
function upserted(sql) {
  const [call] = sql.callsMatching(/INSERT INTO push_subscriptions/)
  const [userId, endpoint, p256dh, auth, tzOffset, timeZone] = call.values
  return { userId, endpoint, p256dh, auth, tzOffset, timeZone, text: call.text }
}

describe('POST /api/push/subscribe', () => {
  it('rejects a caller with no session', async () => {
    const { POST, sql } = await load({ session: null })
    expect((await POST(request('POST', subscription()))).status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('rejects a subscription without its keys, or a body that is not JSON', async () => {
    const { POST } = await load()
    expect((await POST(request('POST', { endpoint: 'https://push.example/abc' }))).status).toBe(400)
    expect((await POST(request('POST', 'not json'))).status).toBe(400)
  })

  it('stores the device’s zone and offset alongside the subscription', async () => {
    const { POST, sql } = await load()
    const res = await POST(request('POST', subscription({ tzOffset: -540, timeZone: 'Asia/Tokyo' })))

    expect(await res.json()).toEqual({ ok: true })
    expect(upserted(sql)).toMatchObject({
      userId: 'u1', endpoint: 'https://push.example/abc', p256dh: 'p256', auth: 'auth',
      tzOffset: -540, timeZone: 'Asia/Tokyo',
    })
  })

  it('runs the migration that creates the zone column before writing to it', async () => {
    const { POST, sql } = await load()
    await POST(request('POST', subscription({ timeZone: 'Asia/Tokyo' })))
    const ddl    = sql.calls.findIndex(c => /ADD COLUMN IF NOT EXISTS time_zone TEXT/.test(c.text))
    const insert = sql.calls.findIndex(c => /INSERT INTO push_subscriptions/.test(c.text))
    expect(ddl).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(ddl)
  })

  it('stores no zone at all for one Intl does not recognise, or an absurdly long one', async () => {
    for (const timeZone of ['Mars/Olympus_Mons', 'A'.repeat(200), 42, '']) {
      const { POST, sql } = await load()
      await POST(request('POST', subscription({ timeZone })))
      expect(upserted(sql).timeZone).toBeNull()
    }
  })

  it('does not erase a stored zone when an older client re-subscribes without one', async () => {
    const { POST, sql } = await load()
    await POST(request('POST', subscription({ tzOffset: 240 })))

    const { timeZone, text } = upserted(sql)
    expect(timeZone).toBeNull()
    // The update keeps whatever was there when the new value is NULL.
    expect(text).toMatch(/time_zone = COALESCE\(EXCLUDED\.time_zone, push_subscriptions\.time_zone\)/)
  })

  it('clamps an out-of-range offset and defaults a missing one to 0', async () => {
    const { POST, sql } = await load()
    await POST(request('POST', subscription({ tzOffset: 99999 })))
    expect(upserted(sql).tzOffset).toBe(900)

    const second = await load()
    await second.POST(request('POST', subscription()))
    expect(upserted(second.sql).tzOffset).toBe(0)
  })
})

describe('DELETE /api/push/subscribe', () => {
  it('rejects a caller with no session', async () => {
    const { DELETE } = await load({ session: null })
    expect((await DELETE(request('DELETE', { endpoint: 'https://push.example/abc' }))).status).toBe(401)
  })

  it('needs an endpoint', async () => {
    const { DELETE } = await load()
    expect((await DELETE(request('DELETE', {}))).status).toBe(400)
  })

  it('removes only the caller’s own row for that endpoint', async () => {
    const { DELETE, sql } = await load()
    const res = await DELETE(request('DELETE', { endpoint: 'https://push.example/abc' }))
    expect(await res.json()).toEqual({ ok: true })
    const [call] = sql.callsMatching(/DELETE FROM push_subscriptions/)
    expect(call.values).toEqual(['u1', 'https://push.example/abc'])
  })
})
