'use strict';

const scope = new URL(self.registration.scope);
const prefix = `undokai-static:${scope.pathname}:`;
const cacheName = prefix + 'v1';
const home = new URL('./index.html', scope).href;
const appFiles = ['index.html', 'styles.css', 'model.js', 'app.js', 'manifest.webmanifest', 'icon.svg'];
const appUrls = new Set(appFiles.map(file => new URL(file, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...appUrls].map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const resource = url.origin + url.pathname;
  const isHome = event.request.mode === 'navigate' && (resource === scope.href || resource === home);
  if (!isHome && !appUrls.has(resource)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    const stored = await cache.match(isHome ? home : resource);
    return stored || fetch(event.request);
  }));
});
