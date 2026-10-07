import { describe, it, expect, vi } from 'vitest'
import net from 'node:net'
import { isPublicAddress, safeFetch, SafeFetchError } from './safeFetch.js'

// ---------------------------------------------------------------------------
// isPublicAddress
// ---------------------------------------------------------------------------

describe('isPublicAddress', () => {
  describe('IPv4', () => {
    it('rejects loopback', () => {
      expect(isPublicAddress('127.0.0.1')).toBe(false)
    })

    it('rejects RFC1918 private ranges', () => {
      expect(isPublicAddress('10.1.2.3')).toBe(false)
      expect(isPublicAddress('172.16.5.5')).toBe(false)
      expect(isPublicAddress('192.168.1.1')).toBe(false)
    })

    it('does not over-match the 172.16.0.0/12 boundary', () => {
      expect(isPublicAddress('172.15.255.255')).toBe(true)
      expect(isPublicAddress('172.32.0.1')).toBe(true)
    })

    it('rejects link-local, including the cloud-metadata address', () => {
      expect(isPublicAddress('169.254.1.1')).toBe(false)
      expect(isPublicAddress('169.254.169.254')).toBe(false)
    })

    it('rejects carrier-grade NAT (100.64.0.0/10) but not addresses just outside it', () => {
      expect(isPublicAddress('100.64.0.5')).toBe(false)
      expect(isPublicAddress('100.128.0.1')).toBe(true)
    })

    it('accepts an ordinary public address', () => {
      expect(isPublicAddress('8.8.8.8')).toBe(true)
    })

    it('rejects a malformed address rather than throwing', () => {
      expect(isPublicAddress('999.1.1.1')).toBe(false)
      expect(isPublicAddress('not-an-ip')).toBe(false)
    })
  })

  describe('IPv6', () => {
    it('rejects loopback (::1)', () => {
      expect(isPublicAddress('::1')).toBe(false)
    })

    it('rejects link-local (fe80::/10)', () => {
      expect(isPublicAddress('fe80::1')).toBe(false)
    })

    it('rejects unique-local (fc00::/7), both halves of the range', () => {
      expect(isPublicAddress('fc00::1')).toBe(false)
      expect(isPublicAddress('fd12:3456:789a::1')).toBe(false)
    })

    it('rejects the unspecified address (::)', () => {
      expect(isPublicAddress('::')).toBe(false)
    })

    it('accepts an ordinary public IPv6 address', () => {
      expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
    })

    it('judges an IPv4-mapped address (::ffff:a.b.c.d) by the embedded IPv4', () => {
      expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
      expect(isPublicAddress('::ffff:192.168.1.1')).toBe(false)
      expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true)
    })

    it('judges NAT64 (64:ff9b::/96) and 6to4 (2002::/16) by the IPv4 they carry', () => {
      // Both encodings of 127.0.0.1 used to pass as "public IPv6".
      expect(isPublicAddress('64:ff9b::7f00:1')).toBe(false)
      expect(isPublicAddress('64:ff9b::c0a8:101')).toBe(false)   // 192.168.1.1
      expect(isPublicAddress('64:ff9b::808:808')).toBe(true)     // 8.8.8.8
      expect(isPublicAddress('2002:7f00:1::')).toBe(false)
      expect(isPublicAddress('2002:a9fe:a9fe::1')).toBe(false)   // 169.254.169.254
      expect(isPublicAddress('2002:808:808::1')).toBe(true)
    })

    it('rejects local-use NAT64 and the documentation range', () => {
      expect(isPublicAddress('64:ff9b:1::808:808')).toBe(false)
      expect(isPublicAddress('2001:db8::1')).toBe(false)
    })

    it('strips brackets, as a URL.hostname leaves them on', () => {
      expect(isPublicAddress('[::1]')).toBe(false)
      expect(isPublicAddress('[2606:4700:4700::1111]')).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

/** A `dns.promises.lookup`-shaped mock: literal IPs echo themselves, named hosts come from `table`. */
function makeLookup(table = {}) {
  return async (hostname) => {
    if (net.isIP(hostname)) return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }]
    const addresses = table[hostname]
    if (!addresses) { const err = new Error(`ENOTFOUND ${hostname}`); err.code = 'ENOTFOUND'; throw err }
    return addresses.map(address => ({ address, family: net.isIPv6(address) ? 6 : 4 }))
  }
}

describe('safeFetch', () => {
  const lookup = makeLookup({ 'feed.example': ['93.184.216.34'], 'other.example': ['93.184.216.35'] })

  it('happy path: resolves a public host and returns the body text', async () => {
    const fetchImpl = vi.fn(async () => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', { status: 200 }))
    const text = await safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl })
    expect(text).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual')
  })

  it('rejects a URL with credentials before ever fetching', async () => {
    const fetchImpl = vi.fn()
    await expect(safeFetch('https://user:pass@feed.example/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(SafeFetchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects plain http by default', async () => {
    const fetchImpl = vi.fn()
    await expect(safeFetch('http://feed.example/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(/https/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a literal private IPv4 host', async () => {
    const fetchImpl = vi.fn()
    await expect(safeFetch('https://192.168.1.5/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(/private or internal/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a literal IPv6 loopback host', async () => {
    const fetchImpl = vi.fn()
    await expect(safeFetch('https://[::1]/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(/private or internal/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a hostname that resolves to a private address', async () => {
    const privateLookup = makeLookup({ 'feed.example': ['10.0.0.9'] })
    const fetchImpl = vi.fn()
    await expect(safeFetch('https://feed.example/cal.ics', { lookup: privateLookup, fetchImpl }))
      .rejects.toThrow(/private or internal/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a redirect that points at a private address, without following it', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302, headers: { Location: 'https://192.168.0.1/evil' },
    }))
    await expect(safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(/private or internal/)
    // The redirect target is rejected during validation, before a second fetch.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('follows a redirect to another public host', async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => new Response(null, {
        status: 302, headers: { Location: 'https://other.example/cal.ics' },
      }))
      .mockImplementationOnce(async () => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', { status: 200 }))
    const text = await safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl })
    expect(text).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up after maxRedirects hops', async () => {
    let hop = 0
    const fetchImpl = vi.fn(async () => {
      hop += 1
      return new Response(null, { status: 302, headers: { Location: `https://feed.example/${hop}` } })
    })
    await expect(safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl, maxRedirects: 2 }))
      .rejects.toThrow(/too many redirects/i)
    // The original request plus 2 allowed hops = 3 fetches before giving up.
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('rejects a body larger than maxBytes', async () => {
    const big = 'x'.repeat(1000)
    const fetchImpl = vi.fn(async () => new Response(big, { status: 200 }))
    await expect(safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl, maxBytes: 100 }))
      .rejects.toThrow(/larger than 100 bytes/)
  })

  it('times out a request that never responds', async () => {
    const fetchImpl = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    }))
    await expect(safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl, timeoutMs: 20 }))
      .rejects.toThrow(/timed out/i)
  })

  it('wraps a network-level fetch failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND') })
    await expect(safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(/Could not fetch the URL/)
  })

  it('surfaces a non-ok upstream status with the status attached', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }))
    await expect(safeFetch('https://feed.example/cal.ics', { lookup, fetchImpl })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('rejects when the hostname cannot be resolved at all', async () => {
    const fetchImpl = vi.fn()
    await expect(safeFetch('https://nowhere.example/cal.ics', { lookup, fetchImpl }))
      .rejects.toThrow(/could not resolve/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
