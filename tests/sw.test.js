import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/**
 * public/sw.js, run for real.
 *
 * The worker is a static script with no exports, so it is loaded as text into a
 * `node:vm` context whose `self`, `caches`, `fetch` and `clients` are fakes. Each
 * test then dispatches the same events a browser would — install, activate, fetch,
 * message, push, notificationclick — and looks at what came back and what ended up
 * in the caches. Nothing here re-implements the worker's logic; if a strategy
 * changes, these tests are what notice.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8')
const ORIGIN = 'https://lv.test'
const V1 = '2026-10-01T10:00:00.000Z-aaaaaaa'
const V2 = '2026-10-05T10:00:00.000Z-bbbbbbb'
const V3 = '2026-10-07T10:00:00.000Z-ccccccc'

const abs = path => new URL(path, ORIGIN).href
const keyOf = input => (typeof input === 'string' ? abs(input) : input.url)

// ── Fakes ────────────────────────────────────────────────────────────────────

/** A Cache that stores bodies the way the real one does: read once, on put. */
class FakeCache {
  constructor() { this.entries = new Map() }
  async match(input) {
    const hit = this.entries.get(keyOf(input))
    if (!hit) return undefined
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers })
  }
  async put(input, response) {
    if (response.status === 206) throw new TypeError('Partial response (status code 206) is unsupported')
    this.entries.set(keyOf(input), {
      body: await response.arrayBuffer(),
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
    })
  }
  async delete(input) { return this.entries.delete(keyOf(input)) }
  async keys() { return [...this.entries.keys()].map(url => ({ url })) }
}

class FakeCacheStorage {
  constructor() { this.store = new Map() }
  async open(name) {
    if (!this.store.has(name)) this.store.set(name, new FakeCache())
    return this.store.get(name)
  }
  async has(name) { return this.store.has(name) }
  async delete(name) { return this.store.delete(name) }
  async keys() { return [...this.store.keys()] }
  async match(input, { cacheName } = {}) {
    if (cacheName) return this.store.get(cacheName)?.match(input)
    for (const cache of this.store.values()) {
      const hit = await cache.match(input)
      if (hit) return hit
    }
    return undefined
  }
  /** Test helper: seed an entry directly. */
  async seed(cacheName, path, body, init = {}) {
    const cache = await this.open(cacheName)
    await cache.put(abs(path), new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      ...init,
    }))
  }
  /** Test helper: the body stored under a path, or undefined. */
  async text(cacheName, path) {
    const hit = await this.store.get(cacheName)?.match(abs(path))
    return hit ? hit.text() : undefined
  }
  /** Test helper: the paths stored in a cache. */
  paths(cacheName) {
    const cache = this.store.get(cacheName)
    return cache ? [...cache.entries.keys()].map(url => new URL(url).pathname + new URL(url).search) : []
  }
}

/**
 * A response as a same-origin fetch produces it. `type` and `redirected` are
 * read-only on a constructed Response, so they are set on the instance — and on its
 * clones, which a real clone keeps and a constructed one's would not.
 */
function respond(body, { status = 200, type = 'basic', redirected = false, contentType } = {}) {
  const headers = contentType ? { 'Content-Type': contentType } : {}
  return asFetched(new Response(body, { status, headers }), { type, redirected })
}
function asFetched(response, props) {
  const clone = response.clone.bind(response)
  Object.defineProperty(response, 'type', { value: props.type })
  Object.defineProperty(response, 'redirected', { value: props.redirected })
  Object.defineProperty(response, 'clone', { value: () => asFetched(clone(), props) })
  return response
}
const page  = (body, opts = {}) => () => respond(body, { contentType: 'text/html; charset=utf-8', ...opts })
const asset = (body, opts = {}) => () => respond(body, { contentType: 'application/javascript', ...opts })

/** fetch with per-URL routes. Anything unrouted fails the way offline does. */
function makeFetch() {
  const routes = new Map()
  const fetch = vi.fn(async (input, init) => {
    const route = routes.get(keyOf(input))
    if (!route) throw new TypeError('Failed to fetch')
    return route(input, init)
  })
  fetch.route = (path, factory) => { routes.set(abs(path), factory); return fetch }
  fetch.offline = () => { routes.clear(); return fetch }
  return fetch
}

/** A promise you settle by hand — for a request that hangs. */
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function request(path, { mode = 'no-cors', method = 'GET', headers = {}, origin = ORIGIN } = {}) {
  return { url: new URL(path, origin).href, method, mode, headers: new Headers(headers) }
}
const navigation = (path, opts = {}) => request(path, { mode: 'navigate', ...opts })

/** An ExtendableEvent / FetchEvent that records respondWith and waitUntil. */
function makeEvent(props = {}) {
  const waits = []
  const event = {
    ...props,
    responded: null,
    respondWith(promise) { event.responded = Promise.resolve(promise) },
    waitUntil(promise) { waits.push(Promise.resolve(promise)) },
    /** Resolves once every waitUntil — including ones added late — has settled. */
    async settled() {
      if (event.responded) await event.responded.catch(() => {})
      let seen = -1
      while (seen !== waits.length) {
        seen = waits.length
        await Promise.allSettled(waits)
      }
      return Promise.all(waits)
    },
  }
  return event
}

/** Load the real worker into a fresh context. `version: null` registers with no ?v=. */
function loadWorker({ version = V3, caches = new FakeCacheStorage(), fetch = makeFetch(), clientList = [] } = {}) {
  const listeners = {}
  const scope = {
    location: new URL(version === null ? `${ORIGIN}/sw.js` : `${ORIGIN}/sw.js?v=${encodeURIComponent(version)}`),
    addEventListener: (type, handler) => { listeners[type] = handler },
    skipWaiting: vi.fn(async () => {}),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => clientList),
      openWindow: vi.fn(async () => null),
    },
    registration: { showNotification: vi.fn(async () => {}) },
    caches,
    fetch,
    Response, Request, Headers, URL, URLSearchParams,
    // Looked up on every call so vi.useFakeTimers() reaches into the worker too.
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    console,
  }
  scope.self = scope
  vm.createContext(scope)
  vm.runInContext(SOURCE, scope, { filename: 'public/sw.js' })

  const dispatch = (type, props) => {
    const event = makeEvent(props)
    listeners[type](event)
    return event
  }
  return {
    scope, caches, fetch, listeners, dispatch,
    navigate: path => dispatch('fetch', { request: navigation(path) }),
    get: (path, opts) => dispatch('fetch', { request: request(path, opts) }),
  }
}

afterEach(() => { vi.useRealTimers() })

// ── Navigations ──────────────────────────────────────────────────────────────

describe('navigations: network first, saved page as the fallback', () => {
  it('serves the network response and saves it under the pathname', async () => {
    const sw = loadWorker()
    sw.fetch.route('/today', page('fresh today'))
    const event = sw.navigate('/today')
    expect(await (await event.responded).text()).toBe('fresh today')
    await event.settled()
    expect(await sw.caches.text(`lv-shell-${V3}`, '/today')).toBe('fresh today')
  })

  it('ignores the query, so the home-screen shortcuts save into and open from `/`', async () => {
    const sw = loadWorker()
    sw.fetch.route('/?new=task', page('planner'))
    await sw.navigate('/?new=task').settled()
    expect(sw.caches.paths(`lv-shell-${V3}`)).toEqual(['/'])

    sw.fetch.offline()
    const event = sw.navigate('/?focus=1')
    expect(await (await event.responded).text()).toBe('planner')
  })

  it('treats a trailing slash as the same page', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-shell-${V3}`, '/today', 'saved today')
    const event = sw.navigate('/today/')
    expect(await (await event.responded).text()).toBe('saved today')
  })

  it('falls back to the saved copy when the network fails', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-shell-${V3}`, '/today', 'saved today')
    const event = sw.navigate('/today')
    const response = await event.responded
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('saved today')
  })

  it('looks through older generations, newest first', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-shell-${V1}`, '/today', 'oldest')
    await sw.caches.seed(`lv-shell-${V2}`, '/today', 'previous build')
    const event = sw.navigate('/today')
    expect(await (await event.responded).text()).toBe('previous build')
  })

  it('prefers the current generation over a newer-sorting one', async () => {
    // A rollback: the running build is older than a cache left by the one it replaced.
    const sw = loadWorker({ version: V2 })
    await sw.caches.seed(`lv-shell-${V3}`, '/', 'rolled-back build')
    await sw.caches.seed(`lv-shell-${V2}`, '/', 'running build')
    const event = sw.navigate('/')
    expect(await (await event.responded).text()).toBe('running build')
  })

  it('shows the offline page for a page never opened, offering the saved planner', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-shell-${V3}`, '/', 'planner')
    const response = await sw.navigate('/login').responded
    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toMatch(/text\/html/)
    const html = await response.text()
    expect(html).toContain("You're offline")
    expect(html).toContain("this page hasn't been opened on this device yet")
    expect(html).toContain('href="/">Open the planner')
    expect(html).toContain('href="">Try again')
  })

  it('leaves the planner link out when there is no saved planner to open', async () => {
    const sw = loadWorker()
    const html = await (await sw.navigate('/').responded).text()
    expect(html).toContain("You're offline")
    expect(html).not.toContain('Open the planner')
    expect(html).toContain('Try again')
  })

  it('answers from the saved copy when the network stalls past the timeout', async () => {
    vi.useFakeTimers()
    const sw = loadWorker()
    await sw.caches.seed(`lv-shell-${V3}`, '/', 'saved planner')
    const slow = deferred()
    sw.fetch.route('/', () => slow.promise)

    const event = sw.navigate('/')
    let answered = false
    event.responded.then(() => { answered = true })
    await vi.advanceTimersByTimeAsync(3999)
    expect(answered).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await (await event.responded).text()).toBe('saved planner')
    // What the late response does to the saved copy is covered below.
  })

  it('keeps waiting on a slow network when there is nothing saved to show', async () => {
    vi.useFakeTimers()
    const sw = loadWorker()
    const slow = deferred()
    sw.fetch.route('/today', () => slow.promise)
    const event = sw.navigate('/today')
    await vi.advanceTimersByTimeAsync(10000)
    slow.resolve(respond('late but real', { contentType: 'text/html' }))
    expect(await (await event.responded).text()).toBe('late but real')
  })

  it('prefers the saved copy over a server error, and passes the error on otherwise', async () => {
    const sw = loadWorker()
    sw.fetch.route('/', page('boom', { status: 502 })).route('/today', page('boom', { status: 500 }))
    await sw.caches.seed(`lv-shell-${V3}`, '/', 'saved planner')

    expect(await (await sw.navigate('/').responded).text()).toBe('saved planner')
    const error = await sw.navigate('/today').responded
    expect(error.status).toBe(500)
    expect(await sw.caches.text(`lv-shell-${V3}`, '/today')).toBeUndefined()
  })

  it('returns a 404 as-is', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-shell-${V3}`, '/', 'saved planner')
    sw.fetch.route('/nope', page('not found', { status: 404 }))
    const response = await sw.navigate('/nope').responded
    expect(response.status).toBe(404)
  })

  it.each([
    ['a redirect it followed',  { redirected: true }],
    // A real one has status 0, which a constructed Response cannot; the type is what counts.
    ['an opaque redirect',      { type: 'opaqueredirect' }],
    ['a non-HTML document',     { contentType: 'image/svg+xml' }],
  ])('does not save %s', async (_label, opts) => {
    const sw = loadWorker()
    sw.fetch.route('/', () => respond('body', { contentType: 'text/html', ...opts }))
    const event = sw.navigate('/')
    await event.responded
    await event.settled()
    expect(await sw.caches.text(`lv-shell-${V3}`, '/')).toBeUndefined()
  })
})

// ── Saving a page ────────────────────────────────────────────────────────────

describe('a page copy replaces the saved one only once its build files are saved', () => {
  const OLD_CHUNK = '/_next/static/chunks/app-old.js'
  const NEW_CHUNK = '/_next/static/chunks/app-new.js'
  const OLD_HTML  = `<html><script src="${OLD_CHUNK}"></script>old planner</html>`
  const NEW_HTML  = `<html><script src="${NEW_CHUNK}"></script>new planner</html>`
  const shell = `lv-shell-${V3}`

  /** A device whose saved planner works offline: the page, and the code it names. */
  async function workingDevice() {
    const sw = loadWorker()
    await sw.caches.seed(shell, '/', OLD_HTML)
    await sw.caches.seed(`lv-static-${V3}`, OLD_CHUNK, 'old code')
    return sw
  }

  /** A load of `/` that the timeout answers; a new build's HTML arrives after it. */
  async function lateNavigation(sw) {
    vi.useFakeTimers()
    const slow = deferred()
    sw.fetch.route('/', () => slow.promise)
    const event = sw.navigate('/')
    await vi.advanceTimersByTimeAsync(4000)
    expect(await (await event.responded).text()).toBe(OLD_HTML)
    return { event, arrive: () => slow.resolve(respond(NEW_HTML, { contentType: 'text/html' })) }
  }

  const chunkRequested = sw => vi.waitFor(() => {
    expect(sw.fetch).toHaveBeenCalledWith(abs(NEW_CHUNK), { credentials: 'same-origin' })
  })

  it('keeps the working copy when a late page’s files cannot be fetched', async () => {
    const sw = await workingDevice()
    const late = await lateNavigation(sw)
    // One bar of signal, then none: the new HTML makes it, its code does not.
    sw.fetch.offline()
    late.arrive()
    await late.event.settled()
    expect(await sw.caches.text(shell, '/')).toBe(OLD_HTML)

    // So the next launch with no signal still opens a page whose code is saved.
    expect(await (await sw.navigate('/').responded).text()).toBe(OLD_HTML)
    expect(await (await sw.get(OLD_CHUNK).responded).text()).toBe('old code')
  })

  it('replaces it with a late page once that page’s files are saved', async () => {
    const sw = await workingDevice()
    sw.fetch.route(NEW_CHUNK, asset('new code'))
    const late = await lateNavigation(sw)
    late.arrive()
    await late.event.settled()
    expect(await sw.caches.text(`lv-static-${V3}`, NEW_CHUNK)).toBe('new code')
    expect(await sw.caches.text(shell, '/')).toBe(NEW_HTML)

    sw.fetch.offline()
    expect(await (await sw.navigate('/').responded).text()).toBe(NEW_HTML)
    expect(await (await sw.get(NEW_CHUNK).responded).text()).toBe('new code')
  })

  it('saves a page it served only once the page’s files are in the cache', async () => {
    const sw = await workingDevice()
    const chunk = deferred()
    sw.fetch.route('/', page(NEW_HTML)).route(NEW_CHUNK, () => chunk.promise)
    const event = sw.navigate('/')
    expect(await (await event.responded).text()).toBe(NEW_HTML)

    // On screen, its code still downloading: the saved copy is untouched so far.
    await chunkRequested(sw)
    expect(await sw.caches.text(shell, '/')).toBe(OLD_HTML)

    chunk.resolve(respond('new code', { contentType: 'application/javascript' }))
    await event.settled()
    expect(await sw.caches.text(shell, '/')).toBe(NEW_HTML)
  })

  it('keeps the working copy when the signal goes while a served page is still loading', async () => {
    const sw = await workingDevice()
    const chunk = deferred()
    sw.fetch.route('/', page(NEW_HTML)).route(NEW_CHUNK, () => chunk.promise)
    const event = sw.navigate('/')
    await event.responded
    await chunkRequested(sw)
    chunk.reject(new TypeError('Failed to fetch'))
    await event.settled()
    expect(await sw.caches.text(shell, '/')).toBe(OLD_HTML)
  })
})

// ── Build files ──────────────────────────────────────────────────────────────

describe('/_next/static: cache first across generations', () => {
  const CHUNK = '/_next/static/chunks/notes-123abc.js'

  it('fetches a miss and keeps it in the current generation', async () => {
    const sw = loadWorker()
    sw.fetch.route(CHUNK, asset('chunk v3'))
    const event = sw.get(CHUNK)
    expect(await (await event.responded).text()).toBe('chunk v3')
    await event.settled()
    expect(await sw.caches.text(`lv-static-${V3}`, CHUNK)).toBe('chunk v3')
  })

  it('serves a hit without touching the network', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-static-${V3}`, CHUNK, 'cached chunk')
    const event = sw.get(CHUNK)
    expect(await (await event.responded).text()).toBe('cached chunk')
    expect(sw.fetch).not.toHaveBeenCalled()
  })

  it('copies a hit from an older generation forward, so pruning that one cannot lose it', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-static-${V2}`, CHUNK, 'unchanged chunk')
    const event = sw.get(CHUNK)
    expect(await (await event.responded).text()).toBe('unchanged chunk')
    await event.settled()
    expect(sw.fetch).not.toHaveBeenCalled()
    expect(await sw.caches.text(`lv-static-${V3}`, CHUNK)).toBe('unchanged chunk')
  })

  it('does not keep a failed response', async () => {
    const sw = loadWorker()
    sw.fetch.route(CHUNK, asset('missing', { status: 404 }))
    const event = sw.get(CHUNK)
    expect((await event.responded).status).toBe(404)
    await event.settled()
    expect(await sw.caches.text(`lv-static-${V3}`, CHUNK)).toBeUndefined()
  })

  it('fails like the network does on an offline miss', async () => {
    const sw = loadWorker()
    await expect(sw.get(CHUNK).responded).rejects.toThrow('Failed to fetch')
  })
})

describe('public assets: stale-while-revalidate', () => {
  it('serves the saved copy at once and refreshes it in the background', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-static-${V3}`, '/manifest.webmanifest', 'old manifest')
    sw.fetch.route('/manifest.webmanifest', asset('new manifest'))
    const event = sw.get('/manifest.webmanifest')
    expect(await (await event.responded).text()).toBe('old manifest')
    await event.settled()
    expect(await sw.caches.text(`lv-static-${V3}`, '/manifest.webmanifest')).toBe('new manifest')
  })

  it('fetches and keeps a miss', async () => {
    const sw = loadWorker()
    sw.fetch.route('/icon-192.png', asset('png'))
    const event = sw.get('/icon-192.png')
    expect(await (await event.responded).text()).toBe('png')
    await event.settled()
    expect(await sw.caches.text(`lv-static-${V3}`, '/icon-192.png')).toBe('png')
  })

  it('serves an older generation’s copy offline and survives the failed refresh', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-static-${V2}`, '/favicon.ico', 'ico')
    const event = sw.get('/favicon.ico')
    expect(await (await event.responded).text()).toBe('ico')
    await expect(event.settled()).resolves.toBeDefined()
  })

  it.each(['/icon.svg', '/notification-icon.png', '/favicon.ico', '/manifest.webmanifest'])(
    'handles %s', path => {
      const sw = loadWorker()
      sw.fetch.route(path, asset('x'))
      expect(sw.get(path).responded).not.toBeNull()
    },
  )
})

// ── Left alone ───────────────────────────────────────────────────────────────

describe('requests the worker never answers', () => {
  it.each([
    ['an RSC fetch',               request('/today', { mode: 'cors', headers: { RSC: '1' } })],
    ['an RSC prefetch',            request('/today', { mode: 'cors', headers: { 'Next-Router-Prefetch': '1' } })],
    ['an RSC state-tree request',  request('/', { mode: 'cors', headers: { 'Next-Router-State-Tree': '%5B%5D' } })],
    ['a request carrying _rsc',    request('/today?_rsc=abc12')],
    ['an _rsc navigation',         navigation('/today?_rsc=abc12')],
    ['an API call',                request('/api/sync', { mode: 'cors' })],
    ['an API navigation',          navigation('/api/auth/google/callback?code=x')],
    ['a POST navigation (sign-out)', navigation('/api/auth/logout', { method: 'POST' })],
    ['a non-GET asset',            request('/icon.svg', { method: 'HEAD' })],
    ['a cross-origin script',      request('/_next/static/chunks/a.js', { origin: 'https://cdn.example' })],
    ['a cross-origin navigation',  navigation('/', { origin: 'https://accounts.google.com' })],
    ['the worker script itself',   request('/sw.js')],
    ['an image optimiser URL',     request('/_next/image?url=%2Ficon.png&w=64&q=75')],
    ['an unknown same-origin file', request('/data.json')],
  ])('ignores %s', (_label, req) => {
    const sw = loadWorker()
    const event = sw.dispatch('fetch', { request: req })
    expect(event.responded).toBeNull()
    expect(sw.fetch).not.toHaveBeenCalled()
  })
})

// ── Dev ──────────────────────────────────────────────────────────────────────

describe('under next dev (v=dev, or no version at all)', () => {
  it.each([['v=dev', 'dev'], ['no ?v=', null]])('%s answers nothing', async (_label, version) => {
    const sw = loadWorker({ version })
    for (const req of [navigation('/'), request('/_next/static/chunks/a.js'), request('/icon.svg')]) {
      expect(sw.dispatch('fetch', { request: req }).responded).toBeNull()
    }
    expect(sw.fetch).not.toHaveBeenCalled()
  })

  it('installs without precaching, and activation clears out any build caches', async () => {
    const caches = new FakeCacheStorage()
    await caches.seed(`lv-shell-${V1}`, '/', 'prod planner')
    await caches.seed(`lv-static-${V1}`, '/_next/static/a.js', 'prod chunk')
    await caches.open('someone-else')
    const sw = loadWorker({ version: 'dev', caches })

    await sw.dispatch('install').settled()
    expect(sw.fetch).not.toHaveBeenCalled()
    expect(sw.scope.skipWaiting).toHaveBeenCalled()

    await sw.dispatch('activate').settled()
    expect(sw.scope.clients.claim).toHaveBeenCalled()
    expect(await caches.keys()).toEqual(['someone-else'])
  })
})

// ── Install ──────────────────────────────────────────────────────────────────

const PLANNER_HTML = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/_next/static/css/app-1a2b.css" data-precedence="next"/>
<link rel="preload" href="/_next/static/media/jakarta-9f8e.p.woff2" as="font" crossorigin="" type="font/woff2"/>
<link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/webpack-77aa.js"/>
<script src="/_next/static/chunks/main-app-31ff.js" async=""></script>
</head><body><div id="planner"></div>
<script>self.__next_f.push([1,"2:I[\\"/_next/static/chunks/page-5c5c.js\\",\\"default\\"]"])</script>
</body></html>`
const TODAY_HTML = `<html><head><script src="/_next/static/chunks/main-app-31ff.js" async></script>
<script src="/_next/static/chunks/today-6d6d.js?dpl=dpl_42" async></script></head><body>today</body></html>`
const SHARE_HTML = `<html><body>share<script src="/_next/static/chunks/share-7e7e.js"></script></body></html>`

const PLANNER_ASSETS = [
  '/_next/static/css/app-1a2b.css',
  '/_next/static/media/jakarta-9f8e.p.woff2',
  '/_next/static/chunks/webpack-77aa.js',
  '/_next/static/chunks/main-app-31ff.js',
  '/_next/static/chunks/page-5c5c.js',
]

function onlineSite(sw) {
  sw.fetch.route('/', page(PLANNER_HTML)).route('/today', page(TODAY_HTML)).route('/share', page(SHARE_HTML))
  for (const path of [...PLANNER_ASSETS, '/_next/static/chunks/today-6d6d.js?dpl=dpl_42', '/_next/static/chunks/share-7e7e.js']) {
    sw.fetch.route(path, asset(`contents of ${path}`))
  }
}

describe('install', () => {
  it('saves the launch pages and every build file they name, then skips waiting', async () => {
    const sw = loadWorker()
    onlineSite(sw)
    await sw.dispatch('install').settled()

    expect(sw.caches.paths(`lv-shell-${V3}`).sort()).toEqual(['/', '/share', '/today'])
    expect(await sw.caches.text(`lv-shell-${V3}`, '/')).toBe(PLANNER_HTML)
    expect(sw.caches.paths(`lv-static-${V3}`).sort()).toEqual([
      ...PLANNER_ASSETS,
      '/_next/static/chunks/share-7e7e.js',
      '/_next/static/chunks/today-6d6d.js?dpl=dpl_42',
    ].sort())
    // Pages are fetched with the session cookie, so the saved copy matches what the
    // signed-in user would get.
    const pageCall = sw.fetch.mock.calls.find(([input]) => keyOf(input) === abs('/'))
    expect(pageCall[1]).toMatchObject({ credentials: 'same-origin' })
    // A file two pages share is fetched once.
    expect(sw.fetch.mock.calls.filter(([input]) => keyOf(input).includes('main-app-31ff')).length).toBe(1)
    expect(sw.scope.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('copies files an older generation already has instead of downloading them again', async () => {
    const sw = loadWorker()
    onlineSite(sw)
    await sw.caches.seed(`lv-static-${V2}`, '/_next/static/chunks/main-app-31ff.js', 'kept from v2')
    await sw.dispatch('install').settled()
    expect(await sw.caches.text(`lv-static-${V3}`, '/_next/static/chunks/main-app-31ff.js')).toBe('kept from v2')
    expect(sw.fetch.mock.calls.some(([input]) => keyOf(input).includes('main-app-31ff'))).toBe(false)
  })

  it('never fails, with the network down entirely', async () => {
    const sw = loadWorker()
    await expect(sw.dispatch('install').settled()).resolves.toBeDefined()
    expect(sw.scope.skipWaiting).toHaveBeenCalledTimes(1)
    expect(sw.caches.paths(`lv-shell-${V3}`)).toEqual([])
  })

  it('keeps whatever succeeded when some of it fails — but no page without its code', async () => {
    const sw = loadWorker()
    onlineSite(sw)
    sw.fetch.route('/today', page('down', { status: 500 }))
    sw.fetch.route('/_next/static/chunks/page-5c5c.js', () => { throw new TypeError('reset') })
    await sw.caches.seed(`lv-shell-${V2}`, '/', 'previous planner')
    await expect(sw.dispatch('install').settled()).resolves.toBeDefined()
    // The planner's own chunk failed, so the new planner is not saved…
    expect(sw.caches.paths(`lv-shell-${V3}`)).toEqual(['/share'])
    expect(sw.caches.paths(`lv-static-${V3}`)).toContain('/_next/static/chunks/main-app-31ff.js')
    expect(sw.caches.paths(`lv-static-${V3}`)).not.toContain('/_next/static/chunks/page-5c5c.js')
    // …and the previous build's copy is still what opens offline.
    sw.fetch.offline()
    expect(await (await sw.navigate('/').responded).text()).toBe('previous planner')
  })

  it('does not let a stalled request hold the install hostage', async () => {
    vi.useFakeTimers()
    const sw = loadWorker()
    onlineSite(sw)
    sw.fetch.route('/today', () => new Promise(() => {}))
    const event = sw.dispatch('install')
    let done = false
    event.settled().then(() => { done = true })
    await vi.advanceTimersByTimeAsync(29000)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await event.settled()
    expect(done).toBe(true)
    expect(sw.scope.skipWaiting).toHaveBeenCalledTimes(1)
    // The pages that did arrive, and their code, were saved regardless.
    expect(sw.caches.paths(`lv-shell-${V3}`).sort()).toEqual(['/', '/share'])
    expect(sw.caches.paths(`lv-static-${V3}`)).toEqual(expect.arrayContaining(PLANNER_ASSETS))
  })
})

// ── Activate ─────────────────────────────────────────────────────────────────

describe('activate', () => {
  const V0 = '2026-09-20T10:00:00.000Z-0000000'

  async function seeded(versions) {
    const caches = new FakeCacheStorage()
    for (const v of versions) {
      await caches.open(`lv-shell-${v}`)
      await caches.open(`lv-static-${v}`)
    }
    await caches.open('not-ours')
    return caches
  }

  it('claims open tabs and keeps only the current and previous generations', async () => {
    const caches = await seeded([V0, V1, V2, V3])
    const sw = loadWorker({ version: V3, caches })
    await sw.dispatch('activate').settled()
    expect(sw.scope.clients.claim).toHaveBeenCalled()
    expect((await caches.keys()).sort()).toEqual(
      ['not-ours', `lv-shell-${V2}`, `lv-shell-${V3}`, `lv-static-${V2}`, `lv-static-${V3}`].sort(),
    )
  })

  it('never prunes the running generation, even when it sorts older (a rollback)', async () => {
    const caches = await seeded([V0, V1, V2, V3])
    const sw = loadWorker({ version: V1, caches })
    await sw.dispatch('activate').settled()
    expect((await caches.keys()).sort()).toEqual(
      ['not-ours', `lv-shell-${V1}`, `lv-shell-${V3}`, `lv-static-${V1}`, `lv-static-${V3}`].sort(),
    )
  })

  it('keeps a generation that only has one of its two caches', async () => {
    const caches = new FakeCacheStorage()
    await caches.open(`lv-static-${V2}`)
    await caches.open(`lv-shell-${V1}`)
    const sw = loadWorker({ version: V3, caches })
    await sw.dispatch('activate').settled()
    expect(await caches.keys()).toEqual([`lv-static-${V2}`])
  })
})

// ── Messages ─────────────────────────────────────────────────────────────────

describe('clear-shell', () => {
  it('drops every saved page, from every generation, and leaves the code', async () => {
    const caches = new FakeCacheStorage()
    await caches.seed(`lv-shell-${V2}`, '/', 'signed in, old')
    await caches.seed(`lv-shell-${V3}`, '/', 'signed in')
    await caches.seed(`lv-static-${V3}`, '/_next/static/a.js', 'code')
    const sw = loadWorker({ caches })
    await sw.dispatch('message', { data: { type: 'clear-shell' } }).settled()
    expect(await caches.keys()).toEqual([`lv-static-${V3}`])
  })

  it('ignores other messages', async () => {
    const caches = new FakeCacheStorage()
    await caches.seed(`lv-shell-${V3}`, '/', 'planner')
    const sw = loadWorker({ caches })
    await sw.dispatch('message', { data: { type: 'something-else' } }).settled()
    await sw.dispatch('message', { data: null }).settled()
    expect(await caches.keys()).toEqual([`lv-shell-${V3}`])
  })
})

// ── Push (unchanged behaviour) ───────────────────────────────────────────────

describe('push', () => {
  it('shows the notification from the payload, with PNG icons', async () => {
    const sw = loadWorker()
    const payload = { title: 'Essay due', body: 'in 1 hour', tag: 'r-1', url: '/today' }
    await sw.dispatch('push', { data: { json: () => payload } }).settled()
    expect(sw.scope.registration.showNotification).toHaveBeenCalledWith('Essay due', {
      body: 'in 1 hour',
      icon: '/icon-192.png',
      badge: '/notification-icon.png',
      tag: 'r-1',
      renotify: true,
      data: { url: '/today' },
    })
  })

  it('falls back gracefully on an empty or non-JSON push', async () => {
    const sw = loadWorker()
    await sw.dispatch('push', { data: { json: () => { throw new SyntaxError('nope') } } }).settled()
    await sw.dispatch('push', { data: null }).settled()
    for (const [title, options] of sw.scope.registration.showNotification.mock.calls) {
      expect(title).toBe('luminaeVigila')
      expect(options).toMatchObject({ body: '', tag: 'lv-notification', renotify: false, data: { url: '/' } })
    }
  })
})

describe('notificationclick', () => {
  const click = url => ({ notification: { close: vi.fn(), data: { url } } })

  function windowClient(path) {
    const client = { url: abs(path), focus: vi.fn(async () => client), navigate: vi.fn(async () => client) }
    return client
  }

  it('moves an open tab to the target and focuses it', async () => {
    const tab = windowClient('/')
    const sw = loadWorker({ clientList: [tab] })
    const event = sw.dispatch('notificationclick', click('/today'))
    await event.settled()
    expect(event.notification.close).toHaveBeenCalled()
    expect(tab.navigate).toHaveBeenCalledWith('/today')
    expect(tab.focus).toHaveBeenCalled()
    expect(sw.scope.clients.openWindow).not.toHaveBeenCalled()
  })

  it('only focuses a tab that is already there', async () => {
    const tab = windowClient('/today')
    const sw = loadWorker({ clientList: [tab] })
    await sw.dispatch('notificationclick', click('/today')).settled()
    expect(tab.navigate).not.toHaveBeenCalled()
    expect(tab.focus).toHaveBeenCalled()
  })

  it('opens a window when none is open', async () => {
    const sw = loadWorker()
    await sw.dispatch('notificationclick', click('/today')).settled()
    expect(sw.scope.clients.openWindow).toHaveBeenCalledWith('/today')
  })

  it('never navigates off-origin', async () => {
    const sw = loadWorker()
    await sw.dispatch('notificationclick', click('https://evil.example/phish')).settled()
    expect(sw.scope.clients.openWindow).toHaveBeenCalledWith('/')
  })
})

describe('cache-urls (build files the page loaded before the worker took over)', () => {
  it('saves same-origin build files, reusing an older generation’s copy', async () => {
    const sw = loadWorker()
    sw.fetch.route('/_next/static/chunks/calendar.js', asset('calendar'))
    await sw.caches.seed(`lv-static-${V2}`, '/_next/static/chunks/main.js', 'main from v2')
    await sw.dispatch('message', { data: { type: 'cache-urls', urls: [
      abs('/_next/static/chunks/calendar.js'),
      abs('/_next/static/chunks/main.js'),
      abs('/api/sync'),
      'https://cdn.example/_next/static/chunks/evil.js',
      'not a url at all ::',
    ] } }).settled()
    expect(sw.caches.paths(`lv-static-${V3}`).sort()).toEqual([
      '/_next/static/chunks/calendar.js',
      '/_next/static/chunks/main.js',
    ])
    expect(await sw.caches.text(`lv-static-${V3}`, '/_next/static/chunks/main.js')).toBe('main from v2')
    expect(sw.fetch).toHaveBeenCalledTimes(1)
  })

  it('skips what the current generation already has', async () => {
    const sw = loadWorker()
    await sw.caches.seed(`lv-static-${V3}`, '/_next/static/chunks/main.js', 'main')
    await sw.dispatch('message', { data: { type: 'cache-urls', urls: [abs('/_next/static/chunks/main.js')] } }).settled()
    expect(sw.fetch).not.toHaveBeenCalled()
  })

  it('survives a failing fetch and ignores a malformed message', async () => {
    const sw = loadWorker()
    await expect(sw.dispatch('message', { data: { type: 'cache-urls', urls: [abs('/_next/static/gone.js')] } }).settled())
      .resolves.toBeDefined()
    await expect(sw.dispatch('message', { data: { type: 'cache-urls', urls: 'nope' } }).settled())
      .resolves.toBeDefined()
    expect(sw.caches.paths(`lv-static-${V3}`)).toEqual([])
  })

  it('does nothing under next dev', async () => {
    const sw = loadWorker({ version: 'dev' })
    sw.fetch.route('/_next/static/chunks/a.js', asset('a'))
    await sw.dispatch('message', { data: { type: 'cache-urls', urls: [abs('/_next/static/chunks/a.js')] } }).settled()
    expect(sw.fetch).not.toHaveBeenCalled()
    expect(await sw.caches.keys()).toEqual([])
  })
})
