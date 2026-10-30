// Bump whenever the shell file list or their cached contents change, or
// installed PWAs keep serving the stale shell forever. v12: native canvas WebRTC
// video track, PeerJS ICE config reuse, and video-track fallback acknowledgment. v10: per-frame audio
// collection in the engine (fixes catch-up burst garble), sharper video
// ladder (WebP when the browser encodes it), portrait controls split, and
// the per-ROM touch layout editor. Prior:
// v9: online v3 raw-frame video (dedicated unreliable DataChannel on its own
// RTCPeerConnection, async Blob JPEG encode, ImageBitmap decode with
// drop-stale frames). Prior: Hide Menu / Full Screen mode (F11) (v8 was a
// v3-in-progress intermediate — history.md has the story); crash overlay +
// in-app issue reporting (v6); guest streaming v2 (per-seat JPEG, guest
// chrome hidden, coalesced audio).
const CACHE = 'mgba-splitscreen-shell-v15';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './online.js',
  './touch-controls.js',
  './crash-report.js',
  './manifest.json',
  './icon.svg',
  './icon-32.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache:'reload' bypasses the HTTP cache: GitHub Pages serves max-age=600,
  // and without this a freshly-installed worker could cache up to ten-minute
  // stale shell files right after a deploy, keeping old code alive a cycle.
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))),
  ));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation is network-first so a magic link never opens an obsolete shell.
  // If the network is unavailable, serve the cached app shell WITHOUT the
  // invite query string. A failed cache lookup must still return a Response;
  // respondWith(undefined) is itself a FetchEvent network error.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        console.warn('[sw] Navigation fetch failed; trying cached app shell:', error);
        const cache = await caches.open(CACHE);
        const shellUrl = new URL('./index.html', self.registration.scope).href;
        const cachedShell = await cache.match(shellUrl);
        if (cachedShell) return cachedShell;
        return new Response(
          'The app could not be reached and no offline copy is available. Check your internet connection and reload.',
          { status: 503, statusText: 'App unavailable', headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  // The crash rescue page is URL-parameterized (?report=...); never answer it
  // from a cache that cannot know those parameters.
  if (url.pathname.endsWith('/report-issue.html')) return;

  // Only cache the app shell. ROMs, save files, PeerJS, and WASM remain
  // network-controlled and are never silently persisted by this worker.
  if (SHELL.some((path) => new URL(path, self.location.href).pathname === url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (error) {
        console.warn('[sw] App-shell asset fetch failed:', request.url, error);
        return new Response('This app file could not be loaded. Check your connection and reload.', {
          status: 503,
          statusText: 'App file unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
  }
});
