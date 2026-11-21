// 앱 셸만 캐시(오프라인 첫 화면). API 응답은 캐시하지 않는다(날씨는 항상 최신 조회).
const CACHE = 'tailtrail-shell-v2';
const SHELL = ['./', './manifest.webmanifest', './assets/icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  const fresh = e.request.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/') ? fetch(e.request, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(fresh.then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
