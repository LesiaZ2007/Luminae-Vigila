/**
 * appBadge.js — PWA App Icon Badge API helpers
 * Feature-detects silently; never throws on unsupported browsers.
 */

export function setAppBadge(count) {
  try {
    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(() => {})
    }
  } catch {}
}

export function clearAppBadge() {
  try {
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {})
    }
  } catch {}
}

/** Sets badge when count > 0, clears it when count === 0. */
export function updateAppBadge(count) {
  if (count > 0) {
    setAppBadge(count)
  } else {
    clearAppBadge()
  }
}
