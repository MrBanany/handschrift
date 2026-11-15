// Network first, cache fallback: always fresh when online, still works offline.
// One cache per build (vite.config.ts puts a hash of index.html in the name): a new version fills a new cache
// and deletes the old ones, so the cache cannot grow with every deploy (a full cache makes Safari clear IndexedDB too).
// shortcut: only the files index.html names and the sample fonts are stored on install; a feature never used online (e.g. PDF import) is not offline yet — precache the build manifest if that bites.
const CACHE = 'handschrift-__BUILD__';
const FONTS = '__FONTS__'.split(','); // sample fonts, filled in by vite.config.ts (index.html does not name them)
// The page and the files it names (hashed JS/CSS), so the new version works offline right after the update.
const precache = async () => {
  const cache = await caches.open(CACHE);
  const page = await fetch('./', { cache: 'no-cache' });
  const files = [...(await page.clone().text()).matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  await cache.put('./', page);
  await Promise.all([...files, ...FONTS].map((f) => cache.add(f).catch(() => {}))); // a missing file must not stop the update
};
self.addEventListener('install', (e) => e.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // other origins (e.g. the GoatCounter script gc.zgo.at and its count requests) go straight to the network, never cached
  // The page itself is revalidated every time (GitHub Pages would serve a 10-minute-old copy), so a new version shows on the next start.
  const req = e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req)
      // the page is stored without its query: a handed-over ?text=… must not pile up in the cache
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request.mode === 'navigate' ? e.request.url.split('?')[0] : e.request, copy)); return res; })
      // ignoreVary: fonts and module scripts are asked for with an Origin header, the stored copy was not; a server that says "Vary: Origin" would otherwise never match
      .catch(() => caches.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match('./'))),
  );
});
