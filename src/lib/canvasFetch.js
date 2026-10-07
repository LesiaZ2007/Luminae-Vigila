/**
 * Shared Canvas REST helpers.
 *
 * Every Canvas route hand-rolled the same network-error → 401 → non-ok → bad-JSON
 * ladder, and two of them (assignments, calendar) each walked Canvas's Link-header
 * pagination with their own copy of the same loop. `canvasGet` is the single
 * fetch-and-classify step; `canvasFetchAll` is the single pagination walk. Each route
 * still writes its own `Response.json(...)` from the result, because the exact wording
 * and status code for "Canvas said no" is not the same in every route and was not meant
 * to be — compare credential/route.js's 401 message (which tells you to generate a new
 * token) against courses/route.js's (which doesn't). Classification lives here;
 * phrasing stays with the route that knows what the caller should do about it.
 */

/** The next page's URL from a Canvas `Link` response header, or `null` at the last page. */
export function nextLinkFrom(linkHeader) {
  const match = (linkHeader ?? '').match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}

/**
 * Fetch one Canvas endpoint and classify the outcome, rather than throwing.
 *
 * Returns `{ ok: true, data, res }` on success. On failure, `{ ok: false, kind, ... }`
 * where `kind` is one of:
 *
 *   - `'network'`      — the fetch itself rejected (DNS, timeout, connection refused).
 *                        `error` holds it.
 *   - `'unauthorized'` — Canvas returned 401. `status`/`res` describe it.
 *   - `'http'`         — any other non-2xx. `status`/`res` describe it.
 *   - `'badJson'`      — a 2xx body that did not parse as JSON. `error` holds the parse
 *                        failure.
 */
export async function canvasGet(url, token, { fetchImpl = fetch } = {}) {
  let res
  try {
    res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch (error) {
    return { ok: false, kind: 'network', error }
  }
  if (res.status === 401) return { ok: false, kind: 'unauthorized', status: res.status, res }
  if (!res.ok) return { ok: false, kind: 'http', status: res.status, res }
  try {
    return { ok: true, data: await res.json(), res }
  } catch (error) {
    return { ok: false, kind: 'badJson', error }
  }
}

/**
 * Follow Canvas's Link-header pagination from `url`, collecting every page's items.
 *
 * Deliberately best-effort rather than all-or-nothing: a page that fails to fetch or
 * parse stops the walk and returns whatever was already collected, instead of throwing
 * away pages that *did* succeed. Canvas paginates in order, so a break partway through
 * is a short list, not a corrupt one — and the alternative (propagating the failure)
 * would turn one flaky page into zero assignments for a course that mostly worked, or an
 * unhandled rejection in a route with no try/catch around the walk (calendar/route.js
 * has none around its own pagination).
 *
 * `onPageError`, if given, is called with the page-level error (network or bad-JSON)
 * before the walk stops — for a caller that wants to log it without losing the partial
 * result. A non-ok HTTP status is not passed to it: Canvas routinely ends a Link chain
 * by having the "last" page still look followable, and a plain end-of-pagination is not
 * an error worth logging.
 */
export async function canvasFetchAll(url, token, { fetchImpl = fetch, onPageError } = {}) {
  const items = []
  let next = url
  while (next) {
    let res
    try {
      res = await fetchImpl(next, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) { onPageError?.(error); break }

    if (!res.ok) break

    let page
    try {
      page = await res.json()
    } catch (error) { onPageError?.(error); break }

    if (Array.isArray(page)) items.push(...page)
    next = nextLinkFrom(res.headers.get('Link'))
  }
  return items
}

/**
 * Run `worker` over `items` with at most `limit` in flight at once.
 *
 * Canvas's rate limit is per-token, so firing a request per course at once risks a 403
 * that penalises the student's *next* sync too. A small cap gets most of the concurrency
 * win — a student with 6 courses no longer waits for 6 sequential round trips — without
 * hammering it. Results come back in the same order as `items`, not completion order, so
 * callers can treat this like `Promise.all` and a run's output is reproducible.
 */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function runOne() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  }
  const workerCount = Math.max(0, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, runOne))
  return results
}
