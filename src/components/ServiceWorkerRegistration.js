'use client'

import { useEffect } from 'react'
import { registerAndSyncPush } from '@/lib/pushClient'

/**
 * Registers the service worker and re-syncs the push subscription on load.
 * Does NOT prompt for permission — that must happen from a user gesture
 * (see enablePush() + the "Enable notifications" button). Auto-prompting is
 * silently ignored by Android Chrome, which is why phone notifications never
 * turned on before.
 */
export default function ServiceWorkerRegistration({ isSignedIn }) {
  useEffect(() => {
    if (!isSignedIn) return
    registerAndSyncPush()
  }, [isSignedIn])

  return null
}
