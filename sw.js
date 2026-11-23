// 앱 셸만 캐시(오프라인 첫 화면). API 응답은 캐시하지 않는다(날씨는 항상 최신 조회).
const CACHE = 'tailtrail-shell-v34';
// 캐리커처 43장은 처음 설치할 때 함께 받아 둔다(오프라인에서도 아이 그림이 보이게)
const CARICATURES = ['maltese-1', 'maltese-2', 'maltese-3', 'maltese-4', 'maltese-5', 'poodle', 'pomeranian', 'corgi', 'bichon', 'retriever', 'saint-bernard', 'saint-bernard-puppy', 'saint-bernard-senior', 'pug', 'pug-puppy', 'pug-senior', 'shih-tzu', 'shih-tzu-puppy', 'shih-tzu-senior', 'husky', 'husky-puppy', 'husky-senior', 'shiba', 'shiba-puppy', 'shiba-senior', 'french-bulldog', 'french-bulldog-puppy', 'french-bulldog-senior', 'chow-chow', 'chow-chow-puppy', 'chow-chow-senior', 'samoyed', 'samoyed-puppy', 'samoyed-senior', 'jindo', 'jindo-puppy', 'jindo-senior', 'chihuahua-puppy', 'chihuahua-senior', 'chihuahua', 'dachshund', 'dachshund-puppy', 'dachshund-senior'].map(n => `./assets/caricatures/${n}.webp?v=4`);
const SHELL = ['./', './manifest.webmanifest', './assets/icon.svg', ...CARICATURES];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  const fresh = e.request.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/') ? fetch(e.request, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(fresh.then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
