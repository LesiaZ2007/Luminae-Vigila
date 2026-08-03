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
