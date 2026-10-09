/**
 * The daily glance cron, end to end through the route — auth, the per-account and
 * per-device fault isolation, and which calendar day each device is told about.
 *
 * The database, web-push and the clock are all faked. Each test loads a fresh copy of
 * the route (`vi.resetModules`) so module state — the memoized DDL in lib/ddlOnce —
 * starts clean. Runs with TZ=America/New_York, so anything that silently used the
 * process's own zone would show up as a wrong day rather than a lucky right one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createFakeSql } = await import('@/test/fakeSql')
  return { default: createFakeSql() }
})
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({ statusCode: 201 })) },
}))

const SECRET = 'cron-test-secret'

function cronRequest(secret = SECRET) {
  const headers = secret === null ? {} : { authorization: `Bearer ${secret}` }
  return new Request('http://x/api/push/daily', { headers })
}

/**
 * A fresh copy of the route, so module state (the memoized DDL) starts clean. The
 * mocked modules survive `resetModules` — vitest caches a factory's result — so the
 * fakes are emptied by hand instead.
 */
async function load() {
  vi.resetModules()
  const { GET }               = await import('./route')
  const { default: sql }      = await import('@/lib/db')
  const { default: webpush }  = await import('web-push')
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

/** Payloads web-push was asked to deliver, keyed by endpoint. */
function sentTo(webpush) {
  return Object.fromEntries(webpush.sendNotification.mock.calls.map(([s, payload]) => [s.endpoint, JSON.parse(payload)]))
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T11:00:00Z')) // the cron's own slot
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('GET /api/push/daily — auth', () => {
  it('rejects a request with no bearer token, without touching the database', async () => {
    const { GET, sql } = await load()
    const res = await GET(cronRequest(null))
    expect(res.status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('rejects the wrong secret', async () => {
    const { GET, sql } = await load()
    const res = await GET(cronRequest('not-the-secret'))
    expect(res.status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('says so when CRON_SECRET itself is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const { GET } = await load()
    const res = await GET(cronRequest())
    expect(res.status).toBe(503)
  })

  it('answers 503 with a reason when the VAPID keys are missing, sending nothing', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { GET, sql, webpush } = await load()
    const res = await GET(cronRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'VAPID keys not configured' })
    expect(webpush.setVapidDetails).not.toHaveBeenCalled()
    expect(sql.callsMatching(/FROM push_subscriptions/)).toHaveLength(0)
  })
})

describe('GET /api/push/daily — sending', () => {
  it('keeps going when one account’s data cannot be read, and counts the failure', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [
        sub({ id: 's-a1', user_id: 'uA', endpoint: 'https://push.example/a1' }),
        sub({ id: 's-a2', user_id: 'uA', endpoint: 'https://push.example/a2' }),
        sub({ id: 's-b',  user_id: 'uB', endpoint: 'https://push.example/b' }),
      ])
      .on(/FROM todos/, (values) => {
        if (values[0] === 'uA') throw new Error('connection reset')
        return [{ data: { id: 't1', title: 'Essay', dueDate: '2026-10-08' } }]
      })
      .on(/FROM events/, [])

    const res = await GET(cronRequest())

    expect(res.status).toBe(200)
    // Both of uA's devices are failures — neither was tried — and uB still got theirs.
    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 2, skipped: 0 })
    expect(Object.keys(sentTo(webpush))).toEqual(['https://push.example/b'])
  })

  it('sends the glance with its summary and a link to /today', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [sub({ time_zone: 'America/New_York' })])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Essay', dueDate: '2026-10-08' } }])
      .on(/FROM events/, [{ data: { id: 'e1', title: 'Physics', start: '2026-10-08T09:00:00', end: '2026-10-08T09:50:00' } }])

    await GET(cronRequest())

    const payload = sentTo(webpush)['https://push.example/1']
    expect(payload.title).toBe('Today at a glance')
    expect(payload.url).toBe('/today')
    expect(payload.tag).toBe('lv-daily')
    expect(payload.body.replace(/\s/g, ' ')).toBe('1 due today · 1 event — first up: Physics at 9:00 AM')
  })

  it('skips a device whose day is empty, rather than pushing "nothing today"', async () => {
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [sub()])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Done already', dueDate: '2026-10-08', completed: true } }])
      .on(/FROM events/, [])

    const res = await GET(cronRequest())

    expect(await res.json()).toEqual({ ok: true, sent: 0, failed: 0, skipped: 1 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('deletes a subscription the push service says is gone', async () => {
    const { GET, sql, webpush } = await load()
    webpush.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
    sql
      .on(/FROM push_subscriptions/, [sub({ id: 'dead-sub' })])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Essay', dueDate: '2026-10-08' } }])
      .on(/FROM events/, [])

    const res = await GET(cronRequest())

    expect(await res.json()).toEqual({ ok: true, sent: 0, failed: 1, skipped: 0 })
    const deletes = sql.callsMatching(/DELETE FROM push_subscriptions/)
    expect(deletes).toHaveLength(1)
    expect(deletes[0].values).toEqual(['dead-sub'])
  })
})

describe('GET /api/push/daily — whose "today"', () => {
  it('summarises each device’s own calendar day, from its recorded zone', async () => {
    // 20:00Z on the 8th: still the 8th in New York, already the 9th in Tokyo.
    vi.setSystemTime(new Date('2026-10-08T20:00:00Z'))
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [
        sub({ id: 's-ny', endpoint: 'https://push.example/ny', time_zone: 'America/New_York', tz_offset: 240 }),
        sub({ id: 's-tk', endpoint: 'https://push.example/tk', time_zone: 'Asia/Tokyo', tz_offset: -540 }),
      ])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Due on the 9th', dueDate: '2026-10-09' } }])
      .on(/FROM events/, [])

    const res = await GET(cronRequest())

    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 0, skipped: 1 })
    expect(Object.keys(sentTo(webpush))).toEqual(['https://push.example/tk'])
  })

  it('falls back to tz_offset for a device that never reported a zone name', async () => {
    // 02:00Z on the 9th is 22:00 on the 8th at UTC-4.
    vi.setSystemTime(new Date('2026-10-09T02:00:00Z'))
    const { GET, sql, webpush } = await load()
    sql
      .on(/FROM push_subscriptions/, [sub({ time_zone: null, tz_offset: 240 })])
      .on(/FROM todos/, [{ data: { id: 't1', title: 'Due on the 8th', dueDate: '2026-10-08' } }])
      .on(/FROM events/, [])

    await GET(cronRequest())

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('reads the zone column it selects', async () => {
    const { GET, sql } = await load()
    sql.on(/FROM push_subscriptions/, [])
    await GET(cronRequest())
    expect(sql.callsMatching(/SELECT .*time_zone.* FROM push_subscriptions/)).toHaveLength(1)
    // …and the migration that guarantees it exists ran first.
    expect(sql.callsMatching(/ADD COLUMN IF NOT EXISTS time_zone TEXT/)).toHaveLength(1)
  })
})
