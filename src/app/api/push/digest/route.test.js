/**
 * The Sunday week-ahead digest, end to end through the route: auth, per-account and
 * per-device fault isolation, and a 7-day window cut on each reader's own calendar.
 *
 * The database, web-push and the clock are faked; each test loads a fresh route so the
 * memoized DDL starts clean. Runs in America/New_York, which is neither the server's
 * zone (UTC) nor most of the readers' below — a window computed in the wrong one shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createFakeSql } = await import('@/test/fakeSql')
  return { default: createFakeSql() }
})
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))

const SECRET = 'cron-test-secret'

function cronRequest(secret = SECRET) {
  const headers = secret === null ? {} : { authorization: `Bearer ${secret}` }
  return new Request('http://x/api/push/digest', { headers })
}

/** A fresh route; the mocked modules survive resetModules, so they are emptied by hand. */
async function load() {
  vi.resetModules()
  const { GET }              = await import('./route')
  const { default: sql }     = await import('@/lib/db')
  const { default: webpush } = await import('web-push')
  sql.reset()
  webpush.setVapidDetails.mockReset()
  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 })
  return { GET, sql, webpush }
}

const sub = (over = {}) => ({
  id: 'sub-1', user_id: 'u1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a',
  tz_offset: 0, time_zone: null, ...over,
})

const bodies = webpush => Object.fromEntries(
  webpush.sendNotification.mock.calls.map(([s, payload]) => [s.endpoint, JSON.parse(payload).body.replace(/\s/g, ' ')]),
)

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
  vi.useFakeTimers({ toFake: ['Date'] })
  // The cron's own slot: Sunday 18:00 UTC — 14:00 in New York, 03:00 Monday in Tokyo.
  vi.setSystemTime(new Date('2026-10-11T18:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('GET /api/push/digest — auth', () => {
  it('rejects a missing or wrong bearer token without touching the database', async () => {
    const { GET, sql } = await load()
    expect((await GET(cronRequest(null))).status).toBe(401)
    expect((await GET(cronRequest('nope'))).status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('answers 503 when the VAPID keys are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    const { GET, sql } = await load()
    const res = await GET(cronRequest())
    expect(res.status).toBe(503)
    expect(sql.callsMatching(/FROM push_subscriptions/)).toHaveLength(0)
  })
})

describe('GET /api/push/digest — sending', () => {
  it('keeps going when one account’s data cannot be read, and counts its devices as failed', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [
        sub({ id: 's-a1', user_id: 'uA', endpoint: 'https://push.example/a1' }),
        sub({ id: 's-a2', user_id: 'uA', endpoint: 'https://push.example/a2' }),
        sub({ id: 's-b',  user_id: 'uB', endpoint: 'https://push.example/b', time_zone: 'America/New_York' }),
      ])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Essay', dueDate: '2026-10-13' } }])
      .on(/FROM events/, values => {
        if (values[0] === 'uA') throw new Error('connection reset')
        return []
      })

    const res = await GET(cronRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 2, skipped: 0 })
    expect(Object.keys(bodies(webpush))).toEqual(['https://push.example/b'])
  })

  it('skips a reader whose week is empty', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [sub()])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Next month', dueDate: '2026-11-20' } }])
      .on(/FROM events/, [])

    expect(await (await GET(cronRequest())).json()).toEqual({ ok: true, sent: 0, failed: 0, skipped: 1 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('deletes a subscription the push service says is gone', async () => {
    const { GET, sql, webpush } = await load()
    webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
    sql
      .on(/FROM push_subscriptions/, [sub({ id: 'dead-sub', time_zone: 'America/New_York' })])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Essay', dueDate: '2026-10-13' } }])
      .on(/FROM events/, [])

    expect(await (await GET(cronRequest())).json()).toEqual({ ok: true, sent: 0, failed: 1, skipped: 0 })
    expect(sql.callsMatching(/DELETE FROM push_subscriptions/).map(c => c.values)).toEqual([['dead-sub']])
  })

  it('reads only accounts that opted in, with each device’s zone', async () => {
    const { GET, sql } = await load()
    await GET(cronRequest())
    const [query] = sql.callsMatching(/FROM push_subscriptions/)
    expect(query.text).toMatch(/digest_enabled = true/)
    expect(query.text).toMatch(/time_zone/)
    expect(query.text).toMatch(/tz_offset/)
  })
})

describe('GET /api/push/digest — the window is the reader’s week', () => {
  const todos = [
    { id: 't1', title: 'Sunday',            dueDate: '2026-10-11' },
    { id: 't2', title: 'Monday week',       dueDate: '2026-10-19' },
    { id: 't3', title: 'Also Monday week',  dueDate: '2026-10-19' },
    { id: 't4', title: 'Deleted',           dueDate: '2026-10-14', deletedAt: '2026-10-10T12:00:00Z' },
    { id: 't5', title: 'Done',              dueDate: '2026-10-14', completed: true },
  ]
  const events = [
    // 09:00 New York is 13:00Z, already past at 18:00Z — behind the reader, not ahead.
    { id: 'e0', title: 'This morning', start: '2026-10-11T09:00:00' },
    // 20:00 New York, still ahead.
    { id: 'e1', title: 'Tonight',      start: '2026-10-11T20:00:00' },
    { id: 'e2', title: 'Deleted',      start: '2026-10-13T10:00:00', deletedAt: '2026-10-10T12:00:00Z' },
  ]

  it('gives each device the seven days ahead on its own calendar', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [
        sub({ id: 's-ny', endpoint: 'https://push.example/ny', time_zone: 'America/New_York' }),
        sub({ id: 's-tk', endpoint: 'https://push.example/tk', time_zone: 'Asia/Tokyo' }),
      ])
      .on(/FROM todos/, todos.map(data => ({ data })))
      .on(/FROM events/, events.map(data => ({ data })))

    const res = await GET(cronRequest())

    expect(await res.json()).toEqual({ ok: true, sent: 2, failed: 0, skipped: 0 })
    // New York: Sun 11th – Sun 18th. Tokyo is already on Monday the 12th, so its week
    // runs to Monday the 19th and Sunday's task and evening event are behind it.
    expect(bodies(webpush)).toEqual({
      'https://push.example/ny': '1 task, 1 event — busiest day: Sunday',
      'https://push.example/tk': '2 tasks, 0 events — busiest day: Monday',
    })
  })

  it('falls back to tz_offset for a device that never reported a zone name', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [sub({ time_zone: null, tz_offset: -540 })]) // UTC+9
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Sunday', dueDate: '2026-10-11' } }])
      .on(/FROM events/, [])

    // Already Monday at UTC+9, so Sunday's task is outside the window.
    expect(await (await GET(cronRequest())).json()).toEqual({ ok: true, sent: 0, failed: 0, skipped: 1 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('leaves out the busiest-day clause rather than a dangling comma when there is none', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [sub({ time_zone: 'America/New_York' })])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Tuesday', dueDate: '2026-10-13' } }])
      .on(/FROM events/, [])

    await GET(cronRequest())
    const [body] = Object.values(bodies(webpush))
    expect(body).toBe('1 task, 0 events — busiest day: Tuesday')
    expect(body).not.toMatch(/, —/)
  })
})
