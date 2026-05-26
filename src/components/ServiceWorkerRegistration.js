'use client'

import { useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function ServiceWorkerRegistration({ isSignedIn }) {
  useEffect(() => {
    if (!isSignedIn) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!VAPID_PUBLIC_KEY) return

    let registration = null

    async function register() {
      try {
        // Register service worker
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

        // Request notification permission
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        // Wait for SW to be active
        await navigator.serviceWorker.ready

        // Get or create push subscription
        let sub = await registration.pushManager.getSubscription()
        if (!sub) {
          sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }

        // Send subscription to server
        await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(sub.toJSON()),
        })
      } catch (e) {
        console.warn('[luminaeVigila] Push registration failed:', e)
      }
    }

    register()
  }, [isSignedIn])

  return null
}
