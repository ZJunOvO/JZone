const CACHE_VERSION = 'jzone-pwa-v2';
const APP_SHELL_CACHE = `${CACHE_VERSION}:shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

const isSameOrigin = (url) => url.origin === self.location.origin;
const isDevAsset = (pathname) =>
  pathname.startsWith('/@vite') ||
  pathname.startsWith('/@react-refresh') ||
  pathname.startsWith('/node_modules') ||
  pathname.startsWith('/index.tsx') ||
  pathname.startsWith('/src/');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (isDevAsset(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/')
        .then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) {
                const copy = response.clone();
                caches.open(APP_SHELL_CACHE).then((cache) => cache.put('/', copy));
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/') || url.pathname === '/favicon.svg') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
