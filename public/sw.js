/* Cosa Nostra PWA — Service Worker + Web Push (v11) */
const CACHE = 'cosa-nostra-v11';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/data.js',
  './js/app.js',
  './img/logo.jpeg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-72.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[sw] precache partial', err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  try {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/api/')) return;
  } catch (_) {
    /* ignore */
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

/* ===== WEB PUSH ===== */
function absUrl(path) {
  try {
    return new URL(path || './index.html', self.registration.scope).href;
  } catch {
    return path || './index.html';
  }
}

self.addEventListener('push', (event) => {
  let data = {
    title: 'Cosa Nostra',
    body: 'Hay novedades en el club.',
    url: './index.html',
    tag: 'cosa-nostra',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (_) {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch (e) {
      /* ignore */
    }
  }

  const options = {
    body: data.body || '',
    icon: absUrl('./icons/icon-192.png'),
    badge: absUrl('./icons/icon-72.png'),
    tag: data.tag || 'cosa-nostra',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || './index.html',
      topic: data.topic || null,
    },
    vibrate: [80, 40, 80],
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Cosa Nostra', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const raw = (event.notification.data && event.notification.data.url) || './index.html';
  const target = absUrl(raw);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url && 'focus' in client) {
          return client.focus().then((c) => {
            if (c && 'navigate' in c) {
              try {
                return c.navigate(target);
              } catch (_) {
                /* ignore navigate errors */
              }
            }
            if (c && c.postMessage) {
              c.postMessage({ type: 'PUSH_NAVIGATE', url: raw });
            }
            return c;
          });
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

/**
 * El navegador puede rotar la suscripción push.
 * Avisamos a las pestañas abiertas para que re-suscriban en el servidor.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        client.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGE',
          oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint,
        });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE });
  }
});
