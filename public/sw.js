self.addEventListener('push', (event) => {
  let data = { title: 'Circle', body: '', url: '/dashboard' }
  try { data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png', data: { url: data.url } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus() }
      return clients.openWindow(url)
    })
  )
})
