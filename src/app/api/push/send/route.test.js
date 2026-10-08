/**
 * POST /api/push/send — session-authed, and scoped to the caller's own devices.
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
  const { POST }               = await import('./route')
  const { default: sql }       = await import('@/lib/db')
  const { default: webpush }   = await import('web-push')
  const { getSession }         = await import('@/lib/session')
  sql.reset()
  webpush.setVapidDetails.mockReset()
  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 })
  getSession.mockReset()
  getSession.mockResolvedValue(session)
  return { POST, sql, webpush }
}

const post = body => new Request('http://x/api/push/send', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/push/send', () => {
  it('rejects a caller with no session, before any query', async () => {
    const { POST, sql, webpush } = await load({ session: null })
    const res = await POST(post({ title: 'hi' }))
    expect(res.status).toBe(401)
    expect(sql.calls).toHaveLength(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('answers 503 when the VAPID keys are missing', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { POST } = await load()
    expect((await POST(post({ title: 'hi' }))).status).toBe(503)
  })

  it('sends to every device on the caller’s account, with their email as the VAPID contact', async () => {
    const { POST, sql, webpush } = await load()
    sql
      .on(/FROM users/, [{ email: 'me@example.com' }])
      .on(/FROM push_subscriptions/, [
        { id: 's1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' },
        { id: 's2', endpoint: 'https://push.example/2', p256dh: 'p', auth: 'a' },
      ])

    const res = await POST(post({ title: 'Hello', body: 'World' }))

    expect(await res.json()).toEqual({ ok: true, sent: 2, failed: 0 })
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:me@example.com', 'test-public-key', 'test-private-key')
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toEqual({ title: 'Hello', body: 'World' })
  })

  it('takes the account from the session, never from the request body', async () => {
    const { POST, sql } = await load()
    await POST(post({ title: 'x', userId: 'someone-else' }))
    const [subsQuery] = sql.callsMatching(/FROM push_subscriptions/)
    expect(subsQuery.values).toEqual(['u1'])
  })

  it('counts a failed delivery without failing the request', async () => {
    const { POST, sql, webpush } = await load()
    webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('nope'), { statusCode: 403 }))
    sql.on(/FROM push_subscriptions/, [
      { id: 's1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' },
      { id: 's2', endpoint: 'https://push.example/2', p256dh: 'p', auth: 'a' },
    ])

    const res = await POST(post({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 1 })
  })
})
