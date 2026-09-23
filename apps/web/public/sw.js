/*
 * Service Worker für Push.
 *
 * Bewusst minimal: er stellt Benachrichtigungen zu und öffnet die passende Stelle in der
 * App. Er cacht nichts – Offline-Erfassen läuft über die Warteschlange in lib/api.ts, und
 * ein halb gecachter Stand wäre bei einem System, dem man Verantwortung überlässt,
 * gefährlicher als ein ehrliches „gerade offline".
 *
 * Der Inhalt folgt der Einstellung „Inhalte in Push und E-Mail" (§23.5): Was hier ankommt,
 * hat der Server bereits auf das erlaubte Maß gekürzt.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const title = payload.title || 'Thealotta'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      tag: payload.tag || undefined,
      // Gleiche Meldung ersetzt die alte, statt sich zu stapeln (§19: keine Alarmmüdigkeit).
      renotify: false,
      data: { url: payload.url || '/jetzt' },
      icon: '/icon.svg',
      badge: '/icon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/jetzt'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
