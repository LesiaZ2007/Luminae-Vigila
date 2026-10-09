// luminaeVigila service worker — the offline app shell, a cache of the app's code,
// and push notifications.
//
// Why any of the caching exists: every page is rendered per request (the root layout
// reads the session cookie), so the HTML is `no-store`, and without a copy of it here a
// phone opened with no signal showed the browser's dinosaur — even though every task,
// event and note was sitting in localStorage the whole time. So:
//
//   • page loads go to the network first and fall back to the last copy saved here —
//     and only the page actually shown is saved, once the build files it names are
//     (see respondToNavigation and savePage);
//   • `/_next/static/*` files are content-hashed and never change, so they are served
//     straight from the cache once saved — including the ones a first visit loaded
//     before this worker took over, which the page hands over in a message;
//   • icons, the manifest and the favicon are served from the cache and refreshed in
//     the background.
//
// The file is static and hand-written on purpose. Its version arrives on the script
// URL — the page registers `/sw.js?v=<build time>-<commit>` (see SW_URL in
// src/lib/pushClient.js) — and a new script URL is what makes the browser install a
// fresh worker for every deploy. Caches are named after that version, two generations
// are kept, and `v=dev` (a `next dev` server) turns all of the caching off so hot
// reload never meets a stale chunk.

const VERSION = (() => {
  try { return new URL(self.location.href).searchParams.get('v') || 'dev' } catch { return 'dev' }
})()
const CACHING        = VERSION !== 'dev'
const SHELL_PREFIX   = 'lv-shell-'
const STATIC_PREFIX  = 'lv-static-'
const SHELL_CACHE    = SHELL_PREFIX + VERSION
const STATIC_CACHE   = STATIC_PREFIX + VERSION

// The current build plus one before it. The older generation is what a tab still
// running the previous build loads its not-yet-opened chunks from after this worker
// takes over; anything older has no tab left that could ask for it.
const GENERATIONS_KEPT = 2

// How long a page load waits on the network before showing the saved copy. Long
// enough that a slow-but-working connection still gets fresh HTML, short enough that
// a connection that is only nominally up (one bar, captive portal) does not leave the
// screen blank.
const NAVIGATION_TIMEOUT_MS = 4000

// Saved at install, and again after a sign-out clears the saved pages, so they open
// offline even if they were never visited: the planner, plus the two other places the
// OS can launch the app into directly — the Today shortcut and push, and the share
// target / New note shortcut.
const PRECACHE_PAGES = ['/', '/today', '/share']
// Install waits on the precache, and a stalled request must not hold the new worker
// (and with it every fix in the deploy) hostage. Whatever finished by then is kept.
const PRECACHE_BUDGET_MS = 30000

const PUBLIC_ASSET = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|webmanifest|woff2?|ttf|otf)$/i

// Set by clear-shell to the clearing in progress, and taken by the first page that
// loads after it, which saves the launch pages again (see respondToNavigation).
let resaveAfterSignOut = null

// ── Lifecycle ────────────────────────────────────────────────────────────────

// Activate a freshly deployed SW immediately instead of waiting for every tab
// to close — otherwise push-handler / icon changes can lag indefinitely. The
// precache is best-effort and can never fail the install: a worker that refuses
// to install leaves the previous one in charge with its stale code.
self.addEventListener('install', event => {
  event.waitUntil(
    (CACHING ? withBudget(precache(), PRECACHE_BUDGET_MS) : Promise.resolve())
      .catch(() => {})
      .then(() => self.skipWaiting())
      .catch(() => {})
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    pruneGenerations().catch(() => {}),
  ]))
})

self.addEventListener('message', event => {
  const data = event.data || {}
  // Sent by the sign-out buttons: a saved page has the signed-in state rendered into
  // it, and it should not outlive the session it was rendered for.
  //
  // That takes /today and /share with it, which the OS opens directly and which must
  // work offline, so they are saved again — but not yet. The message goes out just
  // before the sign-out request, while the session cookie is still there, and pages
  // fetched now would come back signed in. The first page that loads after this is
  // the /login the sign-out redirects to, and by then the cookie is gone.
  if (data.type === 'clear-shell') {
    const cleared = clearShell().catch(() => {})
    resaveAfterSignOut = cleared
    event.waitUntil(cleared)
  }
  // Sent by the page with the build files it loaded before this worker controlled it.
  // On a first visit that is the whole initial load and usually the idle prefetch too —
  // none of which went through the fetch handler, so none of it would be saved, and the
  // calendar would open offline only for as long as the HTTP cache happened to keep it.
  if (data.type === 'cache-urls' && Array.isArray(data.urls)) {
    event.waitUntil(saveLoadedAssets(data.urls).catch(() => {}))
  }
})

// ── Requests ─────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  if (!CACHING) return
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try { url = new URL(request.url) } catch { return }
  if (url.origin !== self.location.origin) return
  // The API is live data, and caching it here would let a stale answer pose as a
  // fresh one; the app already keeps its own copy of everything in localStorage.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return
  // Client-side navigations fetch an RSC payload, not HTML. Left alone, a failed one
  // makes Next fall back to a full page load — which lands in the branch below.
  if (isRscRequest(request, url)) return

  if (request.mode === 'navigate') {
    event.respondWith(respondToNavigation(event, url))
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event, request))
  } else if (isPublicAsset(url)) {
    event.respondWith(staleWhileRevalidate(event, request))
  }
})

function isRscRequest(request, url) {
  return request.headers.get('RSC') === '1'
    || request.headers.has('Next-Router-Prefetch')
    || request.headers.has('Next-Router-State-Tree')
    || url.searchParams.has('_rsc')
}

function isPublicAsset(url) {
  if (url.pathname.startsWith('/_next/') || url.pathname === '/sw.js') return false
  return PUBLIC_ASSET.test(url.pathname)
}

/**
 * Pages: network first, the saved copy when the network fails or stalls.
 *
 * Saved by pathname alone, so `/?new=task` and `/?focus=1` — the home-screen
 * shortcuts — open from the copy of `/`. Those flags are read on the client, and
 * Next takes the URL from the address bar rather than the HTML, so the copy works
 * for any query.
 */
async function respondToNavigation(event, url) {
  const key = shellKey(url.pathname)

  /* Taken now, while the request is being made, not when its answer arrives: only a
     page *requested* after a sign-out can be the one that saves the launch pages
     again. A signed-in load still downloading when Sign out was tapped would
     otherwise take the flag and re-save signed-in copies straight after the clear. */
  const cleared = resaveAfterSignOut
  resaveAfterSignOut = null

  const network = fetch(event.request)
  // The copy is taken the moment the response arrives, before the browser starts
  // reading the body.
  const copied = network.then(r => (isCacheablePage(r) ? r.clone() : null), () => null)

  /* Only the page actually served is saved — never one that turned up after the
     timeout had already answered with the saved copy. The running page is then the
     old one: it only ever requests the old build's chunks, so the calendar and notes
     chunks the late page needs (lazy-loaded, so named nowhere in its HTML) would
     never be fetched, and a working offline copy would be swapped for one whose
     default tab cannot load. The served page loads its own chunks, so they are saved
     as it runs. */
  let settle
  const served = new Promise(resolve => { settle = resolve })
  event.waitUntil(Promise.all([copied, served]).then(([copy, wasServed]) => {
    if (!wasServed || !copy) {
      // Not used — leave it for the next page that does load.
      if (cleared && !resaveAfterSignOut) resaveAfterSignOut = cleared
      return
    }
    if (!cleared) return savePage(key, copy)
    // The first page to load since a sign-out: the session cookie is gone now, so
    // the launch pages clear-shell dropped can be saved again, signed out.
    return cleared.then(() => Promise.all([savePage(key, copy), precache()]))
  }).catch(() => {}))

  const timer = delay(NAVIGATION_TIMEOUT_MS)
  const first = await Promise.race([
    network.then(response => ({ response }), () => ({ failed: true })),
    timer.promise.then(() => ({ timedOut: true })),
  ])
  timer.cancel()

  // A 5xx is the server failing rather than the page not existing; the saved copy
  // is the better answer if there is one.
  if (first.response && first.response.status < 500) { settle(true); return first.response }

  const saved = await matchShell(key)
  if (saved) { settle(false); return saved }
  if (first.response) { settle(true); return first.response }
  if (first.timedOut) {
    // Nothing saved to fall back on, so a slow answer is still better than none.
    try { const response = await network; settle(true); return response } catch {}
  }
  settle(false)
  const plannerSaved = url.pathname !== '/' && Boolean(await matchShell(shellKey('/')))
  return offlinePage(plannerSaved)
}

/** Hashed build files: whichever generation has it, else the network. */
async function cacheFirst(event, request) {
  const hit = await findStatic(request)
  if (hit) {
    // Found under an older build: copy it forward, so pruning that build later
    // cannot take a file the current one still uses.
    if (hit.cacheName !== STATIC_CACHE) keep(event, STATIC_CACHE, request, hit.response)
    return hit.response
  }
  const response = await fetch(request)
  if (isCacheableAsset(response)) keep(event, STATIC_CACHE, request, response)
  return response
}

/** Icons, manifest, favicon: the saved copy now, a fresh one for next time. */
async function staleWhileRevalidate(event, request) {
  const hit = await findStatic(request)
  const network = fetch(request)
  event.waitUntil(network.then(response => {
    if (!isCacheableAsset(response)) return
    const copy = response.clone()
    return caches.open(STATIC_CACHE).then(cache => cache.put(request, copy))
  }).catch(() => {}))
  return hit ? hit.response : network
}

// ── Caches ───────────────────────────────────────────────────────────────────

async function precache() {
  // Shared between the pages, so a file two of them name is fetched once.
  const assets = new Map()
  // Each page carries on to its own files as soon as it arrives, so one page that
  // stalls does not keep the others out of the cache.
  await Promise.all(PRECACHE_PAGES.map(async path => {
    try {
      const response = await fetch(absolute(path), { credentials: 'same-origin' })
      await savePage(shellKey(path), response, assets)
    } catch {}
  }))
}

/**
 * Save a page, but only once every `/_next/static` file it names is in the cache.
 *
 * A saved page is what the next offline launch runs, and HTML whose scripts are not
 * saved runs as static markup with none of the user's data on it. Nothing else is
 * sure to save a new page's files: when the timeout has already answered with the
 * saved copy, the page on screen is the old one and only ever asks for its own code,
 * and even a page that was served can lose the signal before it has loaded its
 * chunks. So the files come first, and if any of them cannot be saved the page is
 * not either — the copy already here, whose files are all here too, stays.
 *
 * "Names" is what the page loads up front. Chunks that are only imported later (the
 * calendar, the notes editor, Corvus) appear in no HTML; the planner fetches them
 * itself once it is idle, which lands them here through cacheFirst.
 */
async function savePage(key, response, assets = new Map()) {
  if (!isCacheablePage(response)) return false
  const html = await response.clone().text()
  const store = await caches.open(STATIC_CACHE)
  const saved = await Promise.all([...staticAssetsIn(html)].map(href => {
    if (!assets.has(href)) assets.set(href, precacheAsset(store, href))
    return assets.get(href)
  }))
  if (!saved.every(Boolean)) return false
  await (await caches.open(SHELL_CACHE)).put(key, response)
  return true
}

async function saveLoadedAssets(urls) {
  if (!CACHING) return
  const wanted = new Set()
  for (const raw of urls.slice(0, 500)) {
    try {
      const url = new URL(raw, self.location.origin)
      if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) wanted.add(url.href)
    } catch {}
  }
  // These were just loaded, so the fetch is normally answered by the HTTP cache.
  const store = await caches.open(STATIC_CACHE)
  await Promise.all([...wanted].map(href => precacheAsset(store, href)))
}

/** Put one build file in the current generation. True once it is there. */
async function precacheAsset(store, href) {
  try {
    const hit = await findStatic(href)
    if (hit) {
      if (hit.cacheName !== STATIC_CACHE) await store.put(href, hit.response)
      return true
    }
    const response = await fetch(href, { credentials: 'same-origin' })
    if (!isCacheableAsset(response)) return false
    await store.put(href, response)
    return true
  } catch {
    return false
  }
}

/** `/_next/static/...` URLs named in a page: script and stylesheet tags, preloads, fonts. */
function staticAssetsIn(html) {
  const found = new Set()
  for (const match of html.matchAll(/\/_next\/static\/[^"'\s<>()\\]+/g)) {
    found.add(absolute(match[0].replace(/&amp;/g, '&')))
  }
  return found
}

async function pruneGenerations() {
  const ours = (await caches.keys()).filter(name => generationOf(name) !== null)
  // A dev server never reads these, and leaving a production build's caches around
  // on localhost only confuses the next production test.
  if (!CACHING) return Promise.all(ours.map(name => caches.delete(name)))

  // Newest by build time — but the running version always stays, even when it is the
  // older one (a rollback), and the other kept generation is the newest of the rest.
  const others = [...new Set(ours.map(generationOf))]
    .filter(version => version !== VERSION)
    .sort()
    .reverse()
  const kept = new Set([VERSION, ...others.slice(0, GENERATIONS_KEPT - 1)])
  return Promise.all(ours
    .filter(name => !kept.has(generationOf(name)))
    .map(name => caches.delete(name)))
}

async function clearShell() {
  const names = (await caches.keys()).filter(name => name.startsWith(SHELL_PREFIX))
  return Promise.all(names.map(name => caches.delete(name)))
}

function generationOf(name) {
  const match = /^lv-(?:shell|static)-(.+)$/.exec(name)
  return match ? match[1] : null
}

/** Cache names with this prefix: the current generation first, then newest to oldest. */
async function generations(prefix) {
  const current = prefix + VERSION
  return (await caches.keys())
    .filter(name => name.startsWith(prefix))
    .sort((a, b) => (a === current ? -1 : b === current ? 1 : a < b ? 1 : a > b ? -1 : 0))
}

async function matchShell(key) {
  try {
    for (const cacheName of await generations(SHELL_PREFIX)) {
      const hit = await caches.match(key, { cacheName, ignoreVary: true })
      if (hit) return hit
    }
  } catch {}
  return null
}

async function findStatic(request) {
  try {
    for (const cacheName of await generations(STATIC_PREFIX)) {
      const response = await caches.match(request, { cacheName, ignoreVary: true })
      if (response) return { response, cacheName }
    }
  } catch {}
  return null
}

function keep(event, cacheName, request, response) {
  const copy = response.clone()
  event.waitUntil(caches.open(cacheName).then(cache => cache.put(request, copy)).catch(() => {}))
}

function isCacheablePage(response) {
  return Boolean(response) && response.ok && response.type === 'basic' && !response.redirected
    && (response.headers.get('Content-Type') || '').includes('text/html')
}

function isCacheableAsset(response) {
  // 200 exactly: Cache.put refuses a 206, and an opaque or error response must never
  // be what a later offline load gets handed.
  return Boolean(response) && response.status === 200 && response.type === 'basic'
}

function shellKey(pathname) {
  // `/today/` and `/today` are the same page.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname
  return absolute(path)
}

function absolute(path) {
  return new URL(path, self.location.origin).href
}

function delay(ms) {
  let id
  const promise = new Promise(resolve => { id = setTimeout(resolve, ms) })
  return { promise, cancel: () => clearTimeout(id) }
}

function withBudget(promise, ms) {
  const timer = delay(ms)
  return Promise.race([promise, timer.promise]).finally(timer.cancel)
}

function offlinePage(plannerSaved) {
  const planner = plannerSaved ? '<a class="primary" href="/">Open the planner</a>' : ''
  const retry   = `<a class="${plannerSaved ? 'secondary' : 'primary'}" href="">Try again</a>`
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#243b55">
<title>Offline · luminaeVigila</title>
<script>try{var t=localStorage.getItem('theme');if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.className='dark'}catch(e){}</script>
<style>
:root{color-scheme:light;--bg:#f7f9fc;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--text-2:#475569;--blue:#3a6fa8;--on-blue:#fff}
:root.dark{color-scheme:dark;--bg:#0a1628;--surface:#0f1e36;--border:rgba(255,255,255,.08);--text:#e2eaf8;--text-2:#7a9cc0;--blue:#6fa8d8;--on-blue:#0a1628}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:360px;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}
h1{margin:0 0 6px;font-size:1rem;font-weight:700}
p{margin:0 0 18px;color:var(--text-2);font-size:.85rem}
nav{display:flex;flex-wrap:wrap;gap:8px}
a{padding:8px 14px;border-radius:9px;font-size:.8rem;font-weight:600;text-decoration:none}
.primary{background:var(--blue);color:var(--on-blue)}
.secondary{border:1px solid var(--border);color:var(--text-2)}
</style>
</head>
<body>
<main>
<h1>You're offline</h1>
<p>And this page hasn't been opened on this device yet, so there's no saved copy of it to show. Pages you have opened before still work without a connection.</p>
<nav>${planner}${retry}</nav>
</main>
</body>
</html>`
  return new Response(html, {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// ── Push ─────────────────────────────────────────────────────────────────────

self.addEventListener('push', event => {
  // Some browsers deliver empty or non-JSON pushes; .json() would throw and the
  // notification would silently never show. Fall back gracefully.
  let d = {}
  try { d = event.data?.json() ?? {} } catch { d = {} }
  event.waitUntil(
    self.registration.showNotification(d.title ?? 'luminaeVigila', {
      body:  d.body  ?? '',
      // Android Chrome does not render SVG notification icons — use PNGs.
      icon:  '/icon-192.png',
      badge: '/notification-icon.png',
      tag:   d.tag   ?? 'lv-notification',
      renotify: Boolean(d.tag),
      // Carried through to notificationclick so a push can name where it should
      // land — the daily glance opens /today, reminders open the app.
      data:  { url: typeof d.url === 'string' ? d.url : '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  // Only ever same-origin: the URL comes from a push payload, and navigating an
  // existing tab somewhere arbitrary on a tap would be a real hazard.
  let target = '/'
  try {
    const raw = event.notification.data?.url
    if (typeof raw === 'string') target = new URL(raw, self.location.origin).origin === self.location.origin
      ? new URL(raw, self.location.origin).pathname
      : '/'
  } catch {}

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          // Focus the tab that already exists, then move it to the right view —
          // opening a second window would leave two copies of the app running.
          if ('navigate' in client && new URL(client.url).pathname !== target) {
            return client.navigate(target).then(c => (c ?? client).focus())
          }
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(target)
    })
  )
})
