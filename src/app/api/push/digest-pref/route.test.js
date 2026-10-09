/**
 * GET/POST /api/push/digest-pref — the account-level digest opt-in.
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

const post = body => new Request('http://x/api/push/digest-pref', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
})

describe('GET /api/push/digest-pref', () => {
  it('rejects a caller with no session', async () => {
    const { GET, sql } = await load({ session: null })
    expect((await GET()).status).toBe(401)
    expect(sql.calls).toHaveLength(0)
  })

  it('reports what the server holds for the account', async () => {
    const { GET, sql } = await load()
    sql.on(/SELECT digest_enabled FROM users/, [{ digest_enabled: false }])
    expect(await (await GET()).json()).toEqual({ digest_enabled: false })
    expect(sql.callsMatching(/FROM users/)[0].values).toEqual(['u1'])
  })

  it('reads a missing row as off rather than failing', async () => {
    const { GET, sql } = await load()
    sql.on(/SELECT digest_enabled FROM users/, [])
    expect(await (await GET()).json()).toEqual({ digest_enabled: false })
  })
})

describe('POST /api/push/digest-pref', () => {
  it('rejects a caller with no session', async () => {
    const { POST } = await load({ session: null })
    expect((await POST(post({ digest_enabled: true }))).status).toBe(401)
  })

  it('accepts only a boolean', async () => {
    const { POST, sql } = await load()
    for (const body of [{ digest_enabled: 'yes' }, {}, 'not json']) {
      expect((await POST(post(body))).status).toBe(400)
    }
    expect(sql.callsMatching(/UPDATE users/)).toHaveLength(0)
  })

  it('updates the caller’s own account', async () => {
    const { POST, sql } = await load()
    sql.on(/UPDATE users/, [{ id: 'u1' }])

    const res = await POST(post({ digest_enabled: true }))

    expect(await res.json()).toEqual({ ok: true, digest_enabled: true })
    expect(sql.callsMatching(/UPDATE users/)[0].values).toEqual([true, 'u1'])
  })

  // The Neon driver resolves to the rows, not to a result with a count — so the
  // only way to see "no row matched" is to ask for rows back.
  it('answers 404 when the session’s account no longer exists', async () => {
    const { POST, sql } = await load()
    sql.on(/UPDATE users/, [])

    const res = await POST(post({ digest_enabled: false }))

    expect(res.status).toBe(404)
    expect(sql.callsMatching(/UPDATE users/)[0].text).toMatch(/RETURNING id/)
  })
})
