/**
 * A fetch that refuses to be used as an SSRF relay.
 *
 * `/api/canvas/ics` takes a URL from anyone — by design, a local-only user with no
 * account can subscribe to a Canvas calendar feed — and fetches it from the server. With
 * nothing but a scheme check, that is an open invitation to ask this server to request
 * loopback, RFC1918, link-local (169.254.0.0/16, which includes the 169.254.169.254
 * cloud-metadata address on every major cloud), and the IPv6 equivalents, then relay the
 * response back. `safeFetch` is the hardening: validate the URL and where it actually
 * resolves, fetch it defensively, and hand back nothing but the body text.
 *
 * ## The DNS-rebinding window this does not close
 *
 * This resolves the hostname, checks every address it comes back with, and *then*
 * fetches the same hostname — not the already-resolved IP. A DNS server fully under an
 * attacker's control can answer the validation lookup with a public address and the
 * platform's real connection a moment later with a private one ("rebinding"), slipping
 * through the gap between the two.
 *
 * Closing that fully means connecting to the pinned IP directly (a custom dispatcher/
 * agent with the original hostname kept only for TLS SNI and the Host header), which is
 * a meaningfully bigger change than this feature warrants: this endpoint only relays
 * text back to the user who supplied the URL, there is no account or session behind it
 * to steal, and the attacker already has to control DNS for a domain they can get this
 * server to query — at which point plenty of other things are also going wrong. Treated
 * as a residual risk rather than one worth the extra machinery here.
 */
import dns from 'node:dns'
import net from 'node:net'

export class SafeFetchError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'SafeFetchError'
    if (typeof status === 'number') this.status = status
  }
}

// ---------------------------------------------------------------------------
// isPublicAddress — pure, synchronous, IPv4 + IPv6
// ---------------------------------------------------------------------------

function ipv4ToInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map(p => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  if (nums.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function inIPv4Range(intVal, baseIp, prefixBits) {
  const mask = prefixBits === 0 ? 0 : (~0 << (32 - prefixBits)) >>> 0
  return (intVal & mask) === (ipv4ToInt(baseIp) & mask)
}

/* Every range here is non-public in the sense that matters for SSRF: it either names a
   machine the server itself can reach that a stranger should not be able to address
   through it (loopback, RFC1918, link-local/cloud-metadata, carrier-grade NAT), or it is
   not a routable unicast destination at all (multicast, reserved, documentation/test
   ranges, broadcast). */
const IPV4_NON_PUBLIC = [
  ['0.0.0.0', 8],       // "this network"
  ['10.0.0.0', 8],      // RFC1918 private
  ['100.64.0.0', 10],   // carrier-grade NAT (RFC6598)
  ['127.0.0.0', 8],     // loopback
  ['169.254.0.0', 16],  // link-local — includes the 169.254.169.254 cloud metadata IP
  ['172.16.0.0', 12],   // RFC1918 private
  ['192.0.0.0', 24],    // IETF protocol assignments
  ['192.0.2.0', 24],    // documentation (TEST-NET-1)
  ['192.168.0.0', 16],  // RFC1918 private
  ['198.18.0.0', 15],   // benchmarking
  ['198.51.100.0', 24], // documentation (TEST-NET-2)
  ['203.0.113.0', 24],  // documentation (TEST-NET-3)
  ['224.0.0.0', 4],     // multicast
  ['240.0.0.0', 4],     // reserved + broadcast (255.255.255.255 falls in here)
]

function isPublicIPv4(ip) {
  const intVal = ipv4ToInt(ip)
  if (intVal === null) return false
  return !IPV4_NON_PUBLIC.some(([base, bits]) => inIPv4Range(intVal, base, bits))
}

/**
 * Expand a textual IPv6 address into its 8 uint16 groups, or `null` if it is not a
 * well-formed address. Handles `::` compression, a trailing embedded IPv4 (`::ffff:a.b.c.d`),
 * and a `%zone` suffix.
 */
function parseIPv6Groups(ip) {
  const withoutZone = ip.split('%')[0]
  const doubleColonAt = withoutZone.indexOf('::')
  const hasDoubleColon = doubleColonAt !== -1

  const [headStr, tailStr] = hasDoubleColon
    ? [withoutZone.slice(0, doubleColonAt), withoutZone.slice(doubleColonAt + 2)]
    : [withoutZone, '']

  function toGroups(side) {
    if (side === '') return []
    const parts = side.split(':')
    const last = parts[parts.length - 1]
    if (last.includes('.')) {
      // An embedded IPv4 tail counts as two 16-bit groups.
      const v4 = ipv4ToInt(last)
      if (v4 === null) return null
      return [...parts.slice(0, -1), String((v4 >>> 16) & 0xffff), String(v4 & 0xffff)]
    }
    return parts
  }

  const head = toGroups(headStr)
  const tail = toGroups(tailStr)
  if (head === null || tail === null) return null

  let groups
  if (hasDoubleColon) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const nums = groups.map(g => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN))
  return nums.some(Number.isNaN) ? null : nums
}

function isPublicIPv6(ip) {
  const g = parseIPv6Groups(ip)
  if (!g) return false

  const isZero = g.every(n => n === 0)
  if (isZero) return false // :: — unspecified
  if (g.slice(0, 7).every(n => n === 0) && g[7] === 1) return false // ::1 — loopback
  if ((g[0] & 0xffc0) === 0xfe80) return false // fe80::/10 — link-local
  if ((g[0] & 0xfe00) === 0xfc00) return false // fc00::/7 — unique local
  if ((g[0] & 0xff00) === 0xff00) return false // ff00::/8 — multicast

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) — judge the embedded
  // IPv4 address by the same rules, rather than letting it ride through as "it's IPv6".
  if (g.slice(0, 5).every(n => n === 0) && (g[5] === 0 || g[5] === 0xffff)) {
    const embedded = `${(g[6] >> 8) & 0xff}.${g[6] & 0xff}.${(g[7] >> 8) & 0xff}.${g[7] & 0xff}`
    return isPublicIPv4(embedded)
  }

  return true
}

/** Is `ip` a publicly-routable address? False for anything private, internal, or malformed. */
export function isPublicAddress(ip) {
  if (typeof ip !== 'string' || !ip) return false
  // A URL's `.hostname` keeps the brackets on an IPv6 literal (`[::1]`); strip them
  // before classifying, not after — `net.isIPv6('[::1]')` is false, bracketed.
  const unbracketed = ip.replace(/^\[|\]$/g, '')
  if (net.isIPv4(unbracketed)) return isPublicIPv4(unbracketed)
  if (net.isIPv6(unbracketed)) return isPublicIPv6(unbracketed)
  return false
}

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

async function assertSafeUrl(urlStr, { lookup, allowHttp }) {
  let parsed
  try {
    parsed = new URL(urlStr)
  } catch {
    throw new SafeFetchError('That is not a valid URL.')
  }

  const allowedProtocols = allowHttp ? ['http:', 'https:'] : ['https:']
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new SafeFetchError(
      allowHttp ? 'URL must start with http:// or https://' : 'URL must start with https://',
    )
  }

  if (parsed.username || parsed.password) {
    throw new SafeFetchError('URL must not contain a username or password.')
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')

  let addresses
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    throw new SafeFetchError('Could not resolve that host.')
  }
  if (!Array.isArray(addresses) || !addresses.length) {
    throw new SafeFetchError('Could not resolve that host.')
  }
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) {
      throw new SafeFetchError('That address points at a private or internal network, so it cannot be fetched.')
    }
  }

  return parsed
}

/** Read a response body as text, aborting once it passes `maxBytes`. */
async function readLimitedText(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    // A mocked or bodyless response — fall back to .text() with a post-hoc size check.
    const text = await res.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new SafeFetchError(`The response was larger than ${maxBytes} bytes.`)
    }
    return text
  }

  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new SafeFetchError(`The response was larger than ${maxBytes} bytes.`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8')
}

/**
 * Fetch `url` defensively and return its body as text.
 *
 * `lookup` and `fetchImpl` are injected (defaulting to `dns.promises.lookup` and the
 * global `fetch`) so tests can exercise every branch — a redirect into a private
 * address, a too-large body, a timeout — without touching the network or DNS.
 */
export async function safeFetch(url, options = {}) {
  const {
    lookup       = dns.promises.lookup,
    fetchImpl    = fetch,
    maxBytes     = 5 * 1024 * 1024,
    timeoutMs    = 10_000,
    maxRedirects = 3,
    allowHttp    = false,
  } = options

  let current = url

  for (let redirectCount = 0; ; redirectCount++) {
    await assertSafeUrl(current, { lookup, allowHttp })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let res
    try {
      res = await fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/calendar, text/plain, */*' },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        throw new SafeFetchError(`Timed out fetching the URL after ${timeoutMs}ms.`)
      }
      throw new SafeFetchError(`Could not fetch the URL: ${err.message}`)
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer)
      if (redirectCount >= maxRedirects) throw new SafeFetchError('Too many redirects.')
      current = new URL(res.headers.get('location'), current).toString()
      continue
    }

    if (!res.ok) {
      clearTimeout(timer)
      throw new SafeFetchError(`Upstream returned HTTP ${res.status}.`, { status: res.status })
    }

    try {
      return await readLimitedText(res, maxBytes)
    } catch (err) {
      if (err instanceof SafeFetchError) throw err
      if (err.name === 'AbortError') throw new SafeFetchError(`Timed out fetching the URL after ${timeoutMs}ms.`)
      throw new SafeFetchError(`Could not read the response: ${err.message}`)
    } finally {
      clearTimeout(timer)
    }
  }
}
