import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requireCron, requireVapid } from './cronAuth'

const ORIGINAL_ENV = { ...process.env }

function request(authHeader) {
  const headers = {}
  if (authHeader !== undefined) headers.authorization = authHeader
  return new Request('http://localhost/api/push/reminders', { headers })
}

beforeEach(() => {
  process.env.CRON_SECRET = 'correct-horse-battery-staple'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('requireCron', () => {
  // heartbeat: false throughout — the point of these tests is the bearer-token
  // comparison, not the database, and the default heartbeat write would need a
  // real DATABASE_URL.

  it('accepts the exact secret', async () => {
    const denied = await requireCron(request('Bearer correct-horse-battery-staple'), 'x', { heartbeat: false })
    expect(denied).toBe(null)
  })

  it('rejects a missing Authorization header', async () => {
    const denied = await requireCron(request(undefined), 'x', { heartbeat: false })
    expect(denied?.status).toBe(401)
  })

  it('rejects the right secret without the Bearer prefix', async () => {
    const denied = await requireCron(request('correct-horse-battery-staple'), 'x', { heartbeat: false })
    expect(denied?.status).toBe(401)
  })

  it('rejects a same-length wrong guess', async () => {
    // Same length as the real secret — this is exactly the case a non-constant-time
    // `!==` and a constant-time compare must agree on functionally, even though the
    // point of the fix is that they no longer take different amounts of time to say no.
    const wrong = 'x'.repeat('correct-horse-battery-staple'.length)
    const denied = await requireCron(request(`Bearer ${wrong}`), 'x', { heartbeat: false })
    expect(denied?.status).toBe(401)
  })

  it('rejects a shorter guess without throwing', async () => {
    const denied = await requireCron(request('Bearer short'), 'x', { heartbeat: false })
    expect(denied?.status).toBe(401)
  })

  it('rejects a longer guess without throwing', async () => {
    const denied = await requireCron(request('Bearer correct-horse-battery-staple-and-then-some'), 'x', { heartbeat: false })
    expect(denied?.status).toBe(401)
  })

  it('rejects an empty bearer token', async () => {
    const denied = await requireCron(request('Bearer '), 'x', { heartbeat: false })
    expect(denied?.status).toBe(401)
  })

  it('reports a clear 503 when CRON_SECRET is not configured, rather than rejecting every token', async () => {
    delete process.env.CRON_SECRET
    const denied = await requireCron(request('Bearer anything'), 'x', { heartbeat: false })
    expect(denied?.status).toBe(503)
  })
})

describe('requireVapid', () => {
  const ORIGINAL_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const ORIGINAL_PRIVATE = process.env.VAPID_PRIVATE_KEY

  afterEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL_PUBLIC
    process.env.VAPID_PRIVATE_KEY = ORIGINAL_PRIVATE
  })

  it('returns a 503 when either VAPID key is missing', () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    expect(requireVapid()?.status).toBe(503)
  })

  it('returns null when both keys are present', () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    expect(requireVapid()).toBe(null)
  })
})
