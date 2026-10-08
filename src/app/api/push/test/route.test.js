/**
 * POST /api/push/test — send to the caller's own devices now, and say per device what
 * the push service answered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createFakeSql } = await import('@/test/fakeSql')
  return { default: createFakeSql() }
})
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }))

/** A fresh route; the mocked modules survive resetModules, so they are emptied by hand. */
async function load({ session = { userId: 'u1' } } = {}) {
  vi.resetModules()
  const { POST }             = await import('./route')
  const { default: sql }     = await import('@/lib/db')
  const { default: webpush } = await import('web-push')
  const { getSession }       = await import('@/lib/session')
  sql.reset()
  webpush.setVapidDetails.mockReset()
  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 })
  getSession.mockReset()
  getSession.mockResolvedValue(session)
  return { POST, sql, webpush }
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/push/test', () => {
  it('rejects a caller with no session', async () => {
    const { POST, sql } = await load({ session: null })
    expect((await POST()).status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('explains a deployment with no VAPID keys rather than failing opaquely', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    const { POST } = await load()
    const res = await POST()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false, results: [], error: expect.stringMatching(/VAPID/) })
  })

  it('says so when the account has no devices', async () => {
    const { POST, sql } = await load()
    sql.on(/FROM push_subscriptions/, [])
    const body = await (await POST()).json()
    expect(body).toMatchObject({ ok: false, results: [] })
    expect(body.error).toMatch(/No devices are subscribed/)
  })

  it('reports each device by push-service host, and what went wrong with each', async () => {
    const { POST, sql, webpush } = await load()
    webpush.sendNotification.mockImplementation(async s => {
      if (s.endpoint.includes('mozilla')) throw Object.assign(new Error('gone'), { statusCode: 410, body: 'Gone' })
      if (s.endpoint.includes('apple'))   throw Object.assign(new Error('forbidden'), { statusCode: 403, body: 'BadJwtToken' })
      return { statusCode: 201 }
    })
    sql
      .on(/FROM users/, [{ email: 'me@example.com' }])
      .on(/FROM push_subscriptions/, [
        { id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' },
        { id: 's2', endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/def', p256dh: 'p', auth: 'a' },
        { id: 's3', endpoint: 'https://web.push.apple.com/ghi', p256dh: 'p', auth: 'a' },
      ])

    const body = await (await POST()).json()

    expect(body).toMatchObject({ ok: true, sent: 1, failed: 2 })
    expect(body.results).toEqual([
      { host: 'fcm.googleapis.com', ok: true },
      { host: 'updates.push.services.mozilla.com', ok: false, status: 410, error: expect.stringMatching(/expired — removed/) },
      { host: 'web.push.apple.com', ok: false, status: 403, error: 'BadJwtToken' },
    ])
    // The expired one was cleaned up; the rejected one was left alone.
    expect(sql.callsMatching(/DELETE FROM push_subscriptions/).map(c => c.values)).toEqual([['s2']])
  })
})
