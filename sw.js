/* Casting Buddy service worker: network-first with an offline cache, so the
 * workshop app always gets the latest deploy when online and still opens with
 * no signal. Bump CACHE when the asset list changes. /api/ is never cached. */
const CACHE = 'casting-buddy-v4';
const ASSETS = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './config.js', './js/util.js', './js/profile.js', './profiles/protocast-trueblue-cz121.js', './js/engine.js', './js/storage.js', './js/sync.js', './js/push.js', './js/alerts.js', './js/ui/components.js', './js/ui/now.js', './js/ui/timeline.js', './js/ui/run.js', './js/ui/history.js', './js/ui/settings.js', './js/ui/modals.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Account/sync API calls always go to the network and are never cached.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});

// A push from the server (js/push.js): show it even though the app is closed.
// If the app is open on screen it raises its own alert, so this one stays silent.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data && e.data.text() }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const onScreen = list.some((c) => c.visibilityState === 'visible');
    return self.registration.showNotification(d.title || 'Casting Buddy', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      requireInteraction: true,
      silent: onScreen,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    });
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
