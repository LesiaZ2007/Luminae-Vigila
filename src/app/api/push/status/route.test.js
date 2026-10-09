/**
 * GET /api/push/status — the "why aren't notifications arriving" report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createFakeSql } = await import('@/test/fakeSql')
  return { default: createFakeSql() }
})
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }))

const NOW = new Date('2026-10-08T12:00:00Z')
const minutesAgo = n => new Date(NOW.getTime() - n * 60_000).toISOString()

/** A fresh route; the mocked modules survive resetModules, so they are emptied by hand. */
async function load({ session = { userId: 'u1' } } = {}) {
  vi.resetModules()
  const { GET }          = await import('./route')
  const { default: sql } = await import('@/lib/db')
  const { getSession }   = await import('@/lib/session')
  sql.reset()
  getSession.mockReset()
  getSession.mockResolvedValue(session)
  return { GET, sql }
}

/** Everything healthy: fresh heartbeats, one device, one recent send. */
function seedHealthy(sql) {
  sql
    .on(/SELECT endpoint FROM push_subscriptions/, [{ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }])
    .on(/SELECT digest_enabled FROM users/, [{ digest_enabled: true }])
    .on(/FROM cron_pings/, [
      { path: 'reminders', last_success: minutesAgo(10),  success_count: '42' },
      { path: 'daily',     last_success: minutesAgo(60),  success_count: '3' },
      { path: 'digest',    last_success: minutesAgo(600), success_count: '1' },
    ])
    .on(/FROM sent_reminders/, [{ reminder_key: 'ev-e1-1', sent_at: minutesAgo(5) }])
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
  vi.stubEnv('CRON_SECRET', 'cron-test-secret')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('GET /api/push/status', () => {
  it('rejects a caller with no session', async () => {
    const { GET, sql } = await load({ session: null })
    expect((await GET()).status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('reports a healthy chain as healthy, by host and by count', async () => {
    const { GET, sql } = await load()
    seedHealthy(sql)

    const body = await (await GET()).json()

    expect(body).toMatchObject({
      healthy: true, problems: [], dbError: null, digestEnabled: true, cronSecret: true,
      vapid: { publicKey: true, privateKey: true },
      subscriptions: { count: 1, endpoints: [{ host: 'fcm.googleapis.com' }] },
      recentSends: [{ key: 'ev-e1-1', sentAt: minutesAgo(5) }],
    })
    expect(body.crons.find(c => c.path === 'reminders')).toMatchObject({ minutesAgo: 10, successCount: 42, stale: false })
  })

  it('never echoes key material or the cron secret', async () => {
    const { GET, sql } = await load()
    seedHealthy(sql)
    const text = JSON.stringify(await (await GET()).json())
    expect(text).not.toContain('test-private-key')
    expect(text).not.toContain('cron-test-secret')
  })

  it('treats a missing sent_reminders table as "never sent", not as an outage', async () => {
    const { GET, sql } = await load()
    seedHealthy(sql)
    sql.on(/FROM sent_reminders/, new Error('relation "sent_reminders" does not exist'))

    const body = await (await GET()).json()

    expect(body.dbError).toBeNull()
    expect(body.recentSends).toEqual([])
    expect(body.problems.some(p => /no reminder has ever been sent/.test(p))).toBe(true)
  })

  it('flags a cron that has stopped, and one that never ran', async () => {
    const { GET, sql } = await load()
    seedHealthy(sql)
    sql.on(/FROM cron_pings/, [{ path: 'reminders', last_success: minutesAgo(180), success_count: '9' }])

    const body = await (await GET()).json()

    expect(body.healthy).toBe(false)
    expect(body.problems.some(p => /reminders last succeeded 3h ago/.test(p))).toBe(true)
    expect(body.problems.some(p => /daily has no successful ping on record/.test(p))).toBe(true)
  })

  it('reports a database failure instead of throwing, without blaming the subscriptions', async () => {
    const { GET, sql } = await load()
    sql.on(/SELECT endpoint FROM push_subscriptions/, new Error('connection refused'))

    const res  = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dbError).toBe('connection refused')
    expect(body.problems.some(p => /No push subscriptions recorded/.test(p))).toBe(false)
  })

  it('names each missing piece of configuration', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('CRON_SECRET', '')
    const { GET, sql } = await load()
    seedHealthy(sql)

    const body = await (await GET()).json()

    expect(body.vapid).toEqual({ publicKey: true, privateKey: false })
    expect(body.cronSecret).toBe(false)
    expect(body.problems.some(p => /VAPID_PRIVATE_KEY is not set/.test(p))).toBe(true)
    expect(body.problems.some(p => /CRON_SECRET is not set/.test(p))).toBe(true)
  })
})
