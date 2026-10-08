/**
 * The per-minute reminder cron, end to end through the route.
 *
 * What is pinned here: the cheap exit really touches no database; a due reminder is
 * claimed and sent exactly once; the notes-table fallback and class rules work through
 * the real route; and — the bug this route had — a reminder fires at the reader's own
 * wall-clock time, read in the zone their subscription recorded, not at that time in
 * UTC (the server) or in America/New_York (this test process).
 *
 * The database, web-push and the clock are faked. Each test loads a fresh copy of the
 * route, so module state — lib/reminderWindow's cache, lib/ddlOnce's memo and the
 * route's own `lastCleanupAt` — starts clean.
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
const MIN    = 60_000
const DAY    = 24 * 60 * MIN

function cronRequest(secret = SECRET) {
  const headers = secret === null ? {} : { authorization: `Bearer ${secret}` }
  return new Request('http://x/api/push/reminders', { headers })
}

/** A fresh route; the mocked modules survive resetModules, so they are emptied by hand. */
async function load() {
  vi.resetModules()
  const { GET }                      = await import('./route')
  const { default: sql }             = await import('@/lib/db')
  const { default: webpush }         = await import('web-push')
  const { invalidateReminderWindow } = await import('@/lib/reminderWindow')
  sql.reset()
  webpush.setVapidDetails.mockReset()
  webpush.sendNotification.mockReset()
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 })
  return { GET, sql, webpush, invalidateReminderWindow }
}

const sub = (over = {}) => ({
  id: 'sub-1', user_id: 'u1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a',
  tz_offset: 0, time_zone: null, ...over,
})

/**
 * Answer the scan's queries. `items` are `{kind, user_id, data}` candidate rows; the
 * claim behaves like the real `ON CONFLICT DO NOTHING RETURNING` — a row the first
 * time a key is inserted, nothing after.
 */
function seed(sql, { items = [], subs = [sub()], classRows = [], classTodos = [] } = {}) {
  const claimed = new Set()
  sql
    .on(/SELECT 'ev' AS kind/, items)
    .on(/^SELECT user_id, data FROM class_schedule/, classRows)
    .on(/FROM todos WHERE NOT \(data \? 'reminder'\)/, classTodos)
    .on(/^SELECT id, user_id, endpoint, p256dh, auth, time_zone, tz_offset FROM push_subscriptions$/, subs)
    .on(/INSERT INTO sent_reminders/, ([userId, key]) => {
      const k = `${userId}|${key}`
      if (claimed.has(k)) return []
      claimed.add(k)
      return [{ reminder_key: key }]
    })
  return claimed
}

const tags = webpush => webpush.sendNotification.mock.calls.map(([, payload]) => JSON.parse(payload).tag)

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T00:00:30Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('GET /api/push/reminders — auth', () => {
  it('rejects a missing or wrong bearer token without a single query', async () => {
    const { GET, sql } = await load()
    expect((await GET(cronRequest(null))).status).toBe(401)
    expect((await GET(cronRequest('nope'))).status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('answers 503 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const { GET } = await load()
    expect((await GET(cronRequest())).status).toBe(503)
  })

  it('answers 503 when the VAPID keys are missing, still without a query', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { GET, sql } = await load()
    const res = await GET(cronRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'VAPID keys not configured' })
    expect(sql.calls).toHaveLength(0)
  })
})

describe('GET /api/push/reminders — whose 9am', () => {
  const at9 = (id, ms, label) => ({
    kind: 'ev', user_id: 'u1',
    data: { id, title: `Event ${id}`, start: '2026-10-08T09:00:00', reminder: { ms, label } },
  })

  it('fires at 9am Tokyo time for a Tokyo subscriber, though the process runs in New York', async () => {
    const { GET, sql, webpush } = await load()
    seed(sql, {
      items: [at9('e1', 0, 'At start'), at9('e2', 15 * MIN, '15 min before')],
      subs:  [sub({ time_zone: 'Asia/Tokyo', tz_offset: -540 })],
    })

    const res  = await GET(cronRequest())
    const body = await res.json()

    // 09:00 JST is 00:00Z on the 8th; fifteen minutes before is 23:45Z on the 7th.
    // Read in the process's zone instead, these would be 13:00Z — eleven hours away.
    const atStart  = Date.UTC(2026, 9, 8, 0, 0)
    const atLeadIn = Date.UTC(2026, 9, 7, 23, 45)
    expect(body).toMatchObject({ ok: true, scanned: true, due: 2, sent: 2, failed: 0 })
    expect(tags(webpush).sort()).toEqual([`ev-e1-${atStart}`, `ev-e2-${atLeadIn}`].sort())
    expect(sql.callsMatching(/INSERT INTO sent_reminders/).map(c => c.values))
      .toEqual(expect.arrayContaining([['u1', `ev-e1-${atStart}`], ['u1', `ev-e2-${atLeadIn}`]]))
  })

  it('reads the same event as 9am UTC for a subscriber with no zone at all', async () => {
    const { GET, sql, webpush } = await load()
    seed(sql, { items: [at9('e1', 0, 'At start')], subs: [sub({ time_zone: null, tz_offset: 0 })] })

    const body = await (await GET(cronRequest())).json()

    expect(body).toMatchObject({ scanned: true, due: 0, sent: 0, nextDueAt: '2026-10-08T09:00:00.000Z' })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('falls back to tz_offset when the zone name is missing', async () => {
    const { GET, sql } = await load()
    seed(sql, { items: [at9('e1', 0, 'At start')], subs: [sub({ time_zone: null, tz_offset: -540 })] })
    const body = await (await GET(cronRequest())).json()
    expect(body).toMatchObject({ due: 1, sent: 1 })
  })

  it('fires a note’s absolute reminder on the reader’s clock, led by the note’s own text', async () => {
    const { GET, sql, webpush } = await load()
    seed(sql, {
      items: [{
        kind: 'nt', user_id: 'u1',
        data: { id: 'n1', html: '<p>Bring the lab goggles</p>', reminder: { at: '2026-10-08T09:00:00', ms: 0, label: 'Custom' } },
      }],
      subs: [sub({ time_zone: 'Asia/Tokyo' })],
    })

    await GET(cronRequest())

    const [[, payload]] = webpush.sendNotification.mock.calls
    expect(JSON.parse(payload)).toMatchObject({ body: 'Bring the lab goggles', tag: `nt-n1-${Date.UTC(2026, 9, 8)}` })
  })

  it('reads the zone column, after the migration that guarantees it exists', async () => {
    const { GET, sql } = await load()
    seed(sql)
    await GET(cronRequest())
    const ddl  = sql.calls.findIndex(c => /ADD COLUMN IF NOT EXISTS time_zone TEXT/.test(c.text))
    const read = sql.calls.findIndex(c => /time_zone, tz_offset FROM push_subscriptions$/.test(c.text))
    expect(ddl).toBeGreaterThanOrEqual(0)
    expect(read).toBeGreaterThan(ddl)
  })
})

describe('GET /api/push/reminders — scanning and sending', () => {
  it('returns without touching the database while nothing can be due', async () => {
    const { GET, sql } = await load()
    seed(sql, {
      items: [{ kind: 'ev', user_id: 'u1', data: { id: 'e1', title: 'Next week', start: '2026-10-15T09:00:00', reminder: { ms: 0 } } }],
      subs:  [sub({ time_zone: 'UTC' })],
    })

    const first = await (await GET(cronRequest())).json()
    expect(first).toMatchObject({ scanned: true, nextDueAt: '2026-10-15T09:00:00.000Z' })
    const callsAfterScan = sql.calls.length

    vi.setSystemTime(new Date('2026-10-08T00:01:30Z')) // the next tick
    const second = await (await GET(cronRequest())).json()

    expect(second).toEqual({ ok: true, scanned: false, nextDueAt: '2026-10-15T09:00:00.000Z' })
    expect(sql.calls).toHaveLength(callsAfterScan) // not one query — not even the heartbeat
  })

  it('claims a due reminder and sends it once, and a later scan does not resend it', async () => {
    const { GET, sql, webpush, invalidateReminderWindow } = await load()
    seed(sql, {
      items: [{ kind: 'td', user_id: 'u1', data: { id: 't1', title: 'Essay', dueDate: '2026-10-08', reminder: { ms: 0, label: 'Due' } } }],
      subs:  [sub({ time_zone: 'UTC' })],
    })

    expect(await (await GET(cronRequest())).json()).toMatchObject({ due: 1, sent: 1 })

    // A sync is what invalidates the window in real life; it forces the next tick to scan.
    invalidateReminderWindow()
    vi.setSystemTime(new Date('2026-10-08T00:01:30Z'))
    expect(await (await GET(cronRequest())).json()).toMatchObject({ scanned: true, due: 1, sent: 0 })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(sql.callsMatching(/INSERT INTO sent_reminders/)).toHaveLength(2)
  })

  it('sends to every device the user has, and deletes one the push service says is gone', async () => {
    const { GET, sql, webpush } = await load()
    webpush.sendNotification.mockImplementation(async s => {
      if (s.endpoint.endsWith('/dead')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      return { statusCode: 201 }
    })
    seed(sql, {
      items: [{ kind: 'td', user_id: 'u1', data: { id: 't1', title: 'Essay', dueDate: '2026-10-08', reminder: { ms: 0 } } }],
      subs:  [
        sub({ id: 'live', endpoint: 'https://push.example/live', time_zone: 'UTC' }),
        sub({ id: 'gone', endpoint: 'https://push.example/dead', time_zone: 'UTC' }),
      ],
    })

    expect(await (await GET(cronRequest())).json()).toMatchObject({ due: 1, sent: 1, failed: 1 })
    expect(sql.callsMatching(/DELETE FROM push_subscriptions/).map(c => c.values)).toEqual([['gone']])
  })

  it('skips deleted items, whose tombstones are still rows in the table', async () => {
    const { GET, sql, webpush } = await load()
    seed(sql, {
      items: [
        { kind: 'ev', user_id: 'u1', data: { id: 'e1', start: '2026-10-08T00:00:00', reminder: { ms: 0 }, deletedAt: '2026-10-07T12:00:00Z' } },
        { kind: 'td', user_id: 'u1', data: { id: 't1', dueDate: '2026-10-08', reminder: { ms: 0 }, deletedAt: '2026-10-07T12:00:00Z' } },
      ],
      subs: [sub({ time_zone: 'UTC' })],
    })

    expect(await (await GET(cronRequest())).json()).toMatchObject({ due: 0, sent: 0 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('sends nothing for a user with no subscription left', async () => {
    const { GET, sql, webpush } = await load()
    seed(sql, {
      items: [{ kind: 'td', user_id: 'gone-user', data: { id: 't1', dueDate: '2026-10-08', reminder: { ms: 0 } } }],
      subs:  [sub({ user_id: 'someone-else' })],
    })

    expect(await (await GET(cronRequest())).json()).toMatchObject({ due: 0, sent: 0 })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('retries without the notes table when it does not exist yet', async () => {
    const { GET, sql, webpush } = await load()
    seed(sql, {
      items: [{ kind: 'td', user_id: 'u1', data: { id: 't1', title: 'Essay', dueDate: '2026-10-08', reminder: { ms: 0 } } }],
      subs:  [sub({ time_zone: 'UTC' })],
    })
    // Registered last, so it wins for the query that names the notes table.
    sql.on(/FROM notes WHERE/, new Error('relation "notes" does not exist'))

    const body = await (await GET(cronRequest())).json()

    const candidateQueries = sql.callsMatching(/SELECT 'ev' AS kind/)
    expect(candidateQueries).toHaveLength(2)
    expect(candidateQueries[0].text).toMatch(/FROM notes/)
    expect(candidateQueries[1].text).not.toMatch(/FROM notes/)
    expect(body).toMatchObject({ due: 1, sent: 1 })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('stamps the heartbeat and purges old dedup rows on a scan, the purge at most every 6 hours', async () => {
    const { GET, sql, invalidateReminderWindow } = await load()
    seed(sql)

    await GET(cronRequest())
    expect(sql.callsMatching(/INSERT INTO cron_pings/)).toHaveLength(1)
    expect(sql.callsMatching(/DELETE FROM sent_reminders/)).toHaveLength(1)

    invalidateReminderWindow()
    vi.setSystemTime(new Date('2026-10-08T00:05:00Z'))
    await GET(cronRequest())
    expect(sql.callsMatching(/INSERT INTO cron_pings/)).toHaveLength(2)
    expect(sql.callsMatching(/DELETE FROM sent_reminders/)).toHaveLength(1)
  })
})

describe('GET /api/push/reminders — class rules', () => {
  const physics = {
    id: 'c1', courseName: 'Physics 101', enabled: true, days: [1, 3, 5],
    startTime: '09:00', endTime: '09:50',
    reminders:  { tasks: [{ ms: DAY, label: '1 day before' }], exams: [{ ms: 7 * DAY, label: '1 week before' }] },
    exceptions: { exams: [{ date: '2026-10-15', title: 'Midterm' }] },
  }

  it('resolves class rules for the user’s tasks and exams, on their clock', async () => {
    // Midnight on the 9th in New York is 04:00Z; a day before that is now.
    vi.setSystemTime(new Date('2026-10-08T04:00:30Z'))
    const { GET, sql, webpush } = await load()
    seed(sql, {
      classRows:  [{ user_id: 'u1', data: physics }],
      classTodos: [{ user_id: 'u1', data: { id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-10-09' } }],
      subs:       [sub({ time_zone: 'America/New_York' })],
    })

    const body = await (await GET(cronRequest())).json()

    const taskAt = Date.UTC(2026, 9, 8, 4)
    expect(body).toMatchObject({
      due: 1, sent: 1,
      // The midterm, 09:00 EDT on the 15th, a week out: 13:00Z on the 8th.
      nextDueAt: '2026-10-08T13:00:00.000Z',
    })
    const [[, payload]] = webpush.sendNotification.mock.calls
    expect(JSON.parse(payload)).toEqual({
      title: 'Physics 101 — Lab report', body: '1 day before', tag: `td-t1-cls${DAY}-${taskAt}`,
    })
  })

  it('does not go looking for tasks when no class carries a rule', async () => {
    const { GET, sql } = await load()
    seed(sql)
    await GET(cronRequest())
    expect(sql.callsMatching(/FROM todos WHERE NOT/)).toHaveLength(0)
  })
})
