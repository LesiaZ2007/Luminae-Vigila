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
  await fetch('/api/push/subscribe', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(sub.toJSON()),
  })
  return sub
}

/**
 * Register the service worker and, if permission is already granted, ensure a
 * subscription exists and is uploaded. Never prompts. Safe on page load.
 */
export async function registerAndSyncPush() {
  if (!pushSupported()) return
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
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
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
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
