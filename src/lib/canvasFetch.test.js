import { describe, it, expect, vi } from 'vitest'
import { nextLinkFrom, canvasGet, canvasFetchAll, mapLimit } from './canvasFetch.js'

function jsonResponse(data, { status = 200, link } = {}) {
  const headers = new Headers()
  if (link) headers.set('Link', link)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => data,
  }
}

describe('nextLinkFrom', () => {
  it('extracts the rel="next" URL from a Link header', () => {
    const link = '<https://canvas.example/api/v1/x?page=2>; rel="next", <https://canvas.example/api/v1/x?page=9>; rel="last"'
    expect(nextLinkFrom(link)).toBe('https://canvas.example/api/v1/x?page=2')
  })

  it('returns null when there is no next page', () => {
    const link = '<https://canvas.example/api/v1/x?page=1>; rel="first"'
    expect(nextLinkFrom(link)).toBeNull()
  })

  it('returns null for a missing or malformed header', () => {
    expect(nextLinkFrom(undefined)).toBeNull()
    expect(nextLinkFrom('')).toBeNull()
    expect(nextLinkFrom('not a link header at all')).toBeNull()
  })
})

describe('canvasGet', () => {
  it('classifies success', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hello: 'world' }))
    const result = await canvasGet('https://canvas.example/api/v1/x', 'tok', { fetchImpl })
    expect(result).toMatchObject({ ok: true, data: { hello: 'world' } })
    expect(fetchImpl).toHaveBeenCalledWith('https://canvas.example/api/v1/x', {
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('classifies a network failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND') })
    const result = await canvasGet('https://canvas.example/api/v1/x', 'tok', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('network')
    expect(result.error.message).toMatch(/ENOTFOUND/)
  })

  it('classifies a 401 as unauthorized, distinct from other non-ok statuses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, { status: 401 }))
    const result = await canvasGet('https://canvas.example/api/v1/x', 'tok', { fetchImpl })
    expect(result).toMatchObject({ ok: false, kind: 'unauthorized', status: 401 })
  })

  it('classifies any other non-2xx as http', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null, { status: 500 }))
    const result = await canvasGet('https://canvas.example/api/v1/x', 'tok', { fetchImpl })
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 500 })
  })

  it('classifies a 2xx body that is not valid JSON as badJson', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => { throw new SyntaxError('Unexpected token') },
    }))
    const result = await canvasGet('https://canvas.example/api/v1/x', 'tok', { fetchImpl })
    expect(result).toMatchObject({ ok: false, kind: 'badJson' })
    expect(result.error).toBeInstanceOf(SyntaxError)
  })
})

describe('canvasFetchAll', () => {
  it('follows multiple Link-header pages and concatenates them in order', async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => jsonResponse([1, 2], { link: '<https://c.example/x?page=2>; rel="next"' }))
      .mockImplementationOnce(async () => jsonResponse([3, 4], { link: '<https://c.example/x?page=3>; rel="next"' }))
      .mockImplementationOnce(async () => jsonResponse([5]))
    const items = await canvasFetchAll('https://c.example/x?page=1', 'tok', { fetchImpl })
    expect(items).toEqual([1, 2, 3, 4, 5])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('stops after one page when there is no Link header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([1, 2, 3]))
    const items = await canvasFetchAll('https://c.example/x', 'tok', { fetchImpl })
    expect(items).toEqual([1, 2, 3])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('stops pagination on a malformed Link header rather than looping forever', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([1], { link: 'garbage, not a real link header' }))
    const items = await canvasFetchAll('https://c.example/x', 'tok', { fetchImpl })
    expect(items).toEqual([1])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps pages already collected when a later page is non-ok, rather than discarding them', async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => jsonResponse([1, 2], { link: '<https://c.example/x?page=2>; rel="next"' }))
      .mockImplementationOnce(async () => jsonResponse(null, { status: 500 }))
    const items = await canvasFetchAll('https://c.example/x?page=1', 'tok', { fetchImpl })
    expect(items).toEqual([1, 2])
  })

  it('keeps pages already collected when a later page throws, and reports it via onPageError', async () => {
    const onPageError = vi.fn()
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => jsonResponse([1, 2], { link: '<https://c.example/x?page=2>; rel="next"' }))
      .mockImplementationOnce(async () => { throw new Error('network blip') })
    const items = await canvasFetchAll('https://c.example/x?page=1', 'tok', { fetchImpl, onPageError })
    expect(items).toEqual([1, 2])
    expect(onPageError).toHaveBeenCalledTimes(1)
    expect(onPageError.mock.calls[0][0].message).toBe('network blip')
  })

  it('ignores a page whose body is JSON but not an array', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ not: 'an array' }))
    const items = await canvasFetchAll('https://c.example/x', 'tok', { fetchImpl })
    expect(items).toEqual([])
  })
})

describe('mapLimit', () => {
  it('returns results in input order regardless of completion order', async () => {
    const items = [30, 10, 20]
    const result = await mapLimit(items, 2, async (ms) => {
      await new Promise(r => setTimeout(r, ms))
      return ms
    })
    expect(result).toEqual([30, 10, 20])
  })

  it('never runs more than `limit` workers at once', async () => {
    let active = 0
    let maxActive = 0
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 5))
      active--
    })
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('handles an empty list without hanging', async () => {
    const result = await mapLimit([], 4, async () => { throw new Error('never called') })
    expect(result).toEqual([])
  })

  it('handles a limit larger than the list', async () => {
    const result = await mapLimit([1, 2], 10, async (n) => n * 2)
    expect(result).toEqual([2, 4])
  })

  it('propagates a worker error', async () => {
    await expect(mapLimit([1, 2], 2, async (n) => { if (n === 2) throw new Error('boom'); return n }))
      .rejects.toThrow('boom')
  })
})
