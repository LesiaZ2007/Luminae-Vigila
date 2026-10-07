'use client'

/**
 * Client-side Web Push helpers.
 *
 * Browsers (Android Chrome especially) silently ignore Notification.requestPermission()
 * unless it is called from a user gesture. So we split registration into two parts:
 *   - registerAndSyncPush(): safe to call on load. Registers the SW and, if permission
 *     is ALREADY granted, (re)creates and uploads the push subscription. Never prompts.
 *   - enablePush(): must be called from a click handler. Prompts for permission, then
 *     subscribes. Returns a status string the UI can react to.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/**
 * Which build the service worker belongs to: `<build time>-<commit>`, or `dev`.
 *
 * public/sw.js is a static file, so on its own every deploy would serve the same bytes
 * and the browser would never install a fresh worker — or know to replace the cached
 * code. The version rides on the script URL instead: a new URL is a new worker, and the
 * worker names its caches after it. Build time leads so the versions sort in the order
 * they were built, which is how the worker decides which generations to keep.
 *
 * `dev` switches the worker's caching off entirely: under `next dev` a cached chunk is
 * exactly what hot reload must never meet. A build with neither value set (nothing
 * should produce one) gets `dev` too, because a version that never changes would mean
 * a worker that never updates.
 */
export function serviceWorkerVersion({ nodeEnv, builtAt, commit }) {
  if (nodeEnv === 'development') return 'dev'
  if (!builtAt && !commit) return 'dev'
  return `${builtAt ?? ''}-${commit ?? ''}`
}

export function serviceWorkerUrl(version) {
  return `/sw.js?v=${encodeURIComponent(version)}`
}

// Spelled out member by member: Next only inlines `process.env.NAME` written exactly
// like this, so destructuring process.env would leave all three undefined in the bundle.
export const SW_URL = serviceWorkerUrl(serviceWorkerVersion({
  nodeEnv: process.env.NODE_ENV,
  builtAt: process.env.APP_BUILT_AT,
  commit:  process.env.APP_COMMIT_SHA,
}))

/**
 * Register (or re-register) the worker. Every caller goes through here, so the page
 * can never register two different script URLs and flip the worker back and forth.
 * Resolves to the registration, or null where service workers do not exist.
 */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  // updateViaCache 'none' keeps the HTTP cache out of update checks entirely; sw.js
  // is also served no-store (next.config.mjs), so this is belt and braces.
  return navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' })
}

/**
 * The offline kill switch: drop every registration and every cache the worker made.
 * Used by `?reset-offline=1` (see ServiceWorkerRegistration) for a device that is stuck
 * on a broken cached build. localStorage — where the actual data lives — is untouched.
 */
export async function resetOfflineCache({
  serviceWorker = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  cacheStorage  = typeof caches    !== 'undefined' ? caches : undefined,
} = {}) {
  const registrations = (await serviceWorker?.getRegistrations?.().catch(() => [])) ?? []
  await Promise.all(registrations.map(r => r.unregister().catch(() => false)))
  const names = (await cacheStorage?.keys().catch(() => [])) ?? []
  await Promise.all(names.filter(n => n.startsWith('lv-')).map(n => cacheStorage.delete(n).catch(() => false)))
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && Boolean(VAPID_PUBLIC_KEY)
}

/** Current permission: 'granted' | 'denied' | 'default' | 'unsupported'. */
export function pushPermission() {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

async function subscribeAndUpload(registration) {
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const res = await fetch('/api/push/subscribe', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // tzOffset travels with the subscription so the server-side daily glance can
    // work out which calendar day to summarise; crons run in UTC. The zone name goes
    // too: an offset is only right until the next daylight-saving change, the zone
    // stays right all year.
    body:    JSON.stringify({
      ...sub.toJSON(),
      tzOffset: new Date().getTimezoneOffset(),
      timeZone: currentTimeZone(),
    }),
  })
  if (!res.ok) {
    // Server never recorded the subscription (e.g. session expired) — the local
    // sub would otherwise look "enabled" while no pushes can ever arrive.
    throw new Error(`subscribe upload failed: ${res.status}`)
  }
  return sub
}

function currentTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/**
 * Register the service worker and, if permission is already granted, ensure a
 * subscription exists and is uploaded. Never prompts. Safe on page load.
 */
export async function registerAndSyncPush() {
  if (!pushSupported()) return
  try {
    const registration = await registerServiceWorker()
    if (Notification.permission === 'granted') {
      await navigator.serviceWorker.ready
      await subscribeAndUpload(registration)
    }
  } catch (e) {
    console.warn('[luminaeVigila] Push registration failed:', e)
  }
}

/**
 * Prompt for permission (must be from a user gesture) and subscribe.
 * Returns 'granted' | 'denied' | 'unsupported' | 'error'.
 */
export async function enablePush() {
  if (!pushSupported()) return 'unsupported'
  try {
    const registration = await registerServiceWorker()
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return permission // 'denied' | 'default'
    await navigator.serviceWorker.ready
    await subscribeAndUpload(registration)
    return 'granted'
  } catch (e) {
    console.warn('[luminaeVigila] enablePush failed:', e)
    return 'error'
  }
}
