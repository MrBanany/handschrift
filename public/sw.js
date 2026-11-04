// Network first, cache fallback: always fresh when online, still works offline.
// shortcut: files are cached when first fetched; a feature never used online (e.g. PDF import) is not offline yet — precache the build manifest if that bites.
const CACHE = 'handschrift-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // The page itself is revalidated every time (GitHub Pages would serve a 10-minute-old copy), so a new version shows on the next start.
  const req = e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./'))),
  );
});
