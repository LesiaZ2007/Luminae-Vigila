// luminaeVigila service worker — handles push notifications

self.addEventListener('push', event => {
  const d = event.data?.json() ?? {}
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
