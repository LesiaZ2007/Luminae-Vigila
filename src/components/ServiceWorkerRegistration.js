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
  if (isSignedIn) registerAndSyncPush()
  return Promise.resolve()
}
