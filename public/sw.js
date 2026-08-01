// luminaeVigila service worker — handles push notifications

// Activate a freshly deployed SW immediately instead of waiting for every tab
// to close — otherwise push-handler / icon changes can lag indefinitely.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

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
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow('/')
    })
  )
})
