'use client'

import { useEffect } from 'react'
import { registerAndSyncPush, registerServiceWorker, resetOfflineCache } from '@/lib/pushClient'

export const RESET_OFFLINE_PARAM = 'reset-offline'

/** True when the URL asks for the offline kill switch: `?reset-offline=1`. */
export function wantsOfflineReset(href) {
  try { return new URL(href).searchParams.get(RESET_OFFLINE_PARAM) === '1' } catch { return false }
}

/** The same URL with the kill-switch flag taken out, so the reload does not loop. */
export function withoutOfflineReset(href) {
  const url = new URL(href)
  url.searchParams.delete(RESET_OFFLINE_PARAM)
  return url.href
}

/**
 * Registers the service worker for everyone, and re-syncs the push subscription on
 * load for signed-in users.
 *
 * The worker is what makes the app open with no connection, and the app works
 * without an account, so registration no longer waits for a sign-in. Push is still
 * account-bound — the server needs to know whose reminders to send — so only that
 * half depends on `isSignedIn`.
 *
 * Does NOT prompt for permission — that must happen from a user gesture
 * (see enablePush() + the "Enable notifications" button). Auto-prompting is
 * silently ignored by Android Chrome, which is why phone notifications never
 * turned on before.
 *
 * `?reset-offline=1` on any page is the escape hatch for a device stuck on a broken
 * cached build: it unregisters the worker, deletes its caches and reloads without
 * the flag, before anything is registered again.
 */
export default function ServiceWorkerRegistration({ isSignedIn }) {
  useEffect(() => { startServiceWorker({ isSignedIn }) }, [isSignedIn])
  return null
}

/** The effect's body, apart so a test can hand it a location it controls. */
export function startServiceWorker({ isSignedIn, location = window.location }) {
  if (wantsOfflineReset(location.href)) {
    return resetOfflineCache()
      .catch(() => {})
      .finally(() => location.replace(withoutOfflineReset(location.href)))
  }
  registerServiceWorker().catch(e => console.warn('[luminaeVigila] Service worker registration failed:', e))
  handOverLoadedAssets()
  if (isSignedIn) registerAndSyncPush()
  return Promise.resolve()
}

let handingOver = false

/**
 * Tell the worker about build files this page loaded without going through it.
 *
 * On a first visit the page is not controlled until the worker has installed, and
 * everything it loads before then — the initial chunks, and usually the idle prefetch
 * of the calendar, notes and Corvus — goes straight to the network. The precache
 * covers what the HTML names, but not the split chunks, so without this the calendar
 * would open offline only while the browser's HTTP cache happened to still hold it.
 *
 * A resource the worker handled has a non-zero `workerStart`; anything else under
 * `/_next/static/` is queued and posted once the page is controlled by a worker that
 * caches (see isCachingWorker). The observer stays on for the page's lifetime,
 * because a request that started just before the worker took over finishes — and
 * reports — after it.
 */
export function handOverLoadedAssets({
  serviceWorker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  Observer      = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : undefined,
  origin        = typeof location !== 'undefined' ? location.origin : '',
} = {}) {
  if (!serviceWorker || !Observer || handingOver) return
  handingOver = true
  let pending = []
  const flush = () => {
    const controller = serviceWorker.controller
    if (!isCachingWorker(controller) || !pending.length) return
    controller.postMessage({ type: 'cache-urls', urls: pending })
    pending = []
  }
  try {
    new Observer(list => {
      for (const entry of list.getEntries()) {
        if (entry.workerStart > 0) continue
        if (entry.name.startsWith(`${origin}/_next/static/`)) pending.push(entry.name)
      }
      flush()
    }).observe({ type: 'resource', buffered: true })
  } catch {
    handingOver = false
    return
  }
  serviceWorker.addEventListener('controllerchange', flush)
}

/**
 * True for a worker that caches: one registered with a build version, `/sw.js?v=…`
 * (see SW_URL in src/lib/pushClient.js).
 *
 * The worker before that was registered as plain `/sw.js` and only did push, with no
 * message handler. On the first visit after the deploy that brought the cache, it is
 * still in control when the first resource timings report, and a list posted to it is
 * dropped. So the list waits for a controllerchange to the caching worker instead.
 */
export function isCachingWorker(worker) {
  if (!worker) return false
  try { return new URL(worker.scriptURL).searchParams.has('v') } catch { return false }
}
