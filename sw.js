// Service worker AfriBoost : rend le site installable et affiche les notifications push.
// Il ne met RIEN en cache : le site est toujours chargé depuis le réseau (pas de vieille version bloquée).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // requis pour l'installation sur certains Android, ne change aucune réponse

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'AfriBoost', body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'AfriBoost').slice(0, 80);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 240),
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: typeof d.url === 'string' ? d.url : '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = '/';
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    if (u.origin === self.location.origin) url = u.href; // on n'ouvre que des pages de CE site
  } catch (_) {}
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { try { c.navigate(url); } catch (_) {} return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
