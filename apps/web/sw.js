// Network-only service worker: enables PWA installation and background Web Push notifications.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  const title = String(payload.title || 'ZORONA').slice(0, 100);
  const body = String(payload.body || 'اكتشف الجديد في ZORONA.').slice(0, 240);
  const requestedUrl = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//')
    ? payload.url
    : '/';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: requestedUrl }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requestedUrl = event.notification?.data?.url;
  const target = new URL(
    typeof requestedUrl === 'string' && requestedUrl.startsWith('/') && !requestedUrl.startsWith('//')
      ? requestedUrl
      : '/',
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if (typeof client.navigate === 'function') await client.navigate(target);
      return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
