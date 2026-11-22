/* 闪卡离线缓存。
   index.html / words.enc：联网优先，4 秒没回应才用缓存。图标、背景：先给缓存，后台拉新。
   adjust.json：联网优先，连不上才用缓存。 */
const CACHE = 'flashcard-v1';
const SHELL = ['./', 'index.html', 'words.enc', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png', 'bg-light.jpg', 'bg-dark.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/adjust.json')) {
    const key = url.origin + url.pathname;
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); }
      return r;
    }).catch(() => caches.match(key).then(r => r || Response.error())));
    return;
  }

  // 网页本身和词表：联网优先（带校验，没变只回 304，很省流量），4 秒没回应或断网才用缓存，保证改版当场生效
  const p = url.pathname;
  if (req.mode === 'navigate' || p.endsWith('/') || p.endsWith('/index.html') || p.endsWith('/words.enc')) {
    const key = url.origin + (p.endsWith('/') ? p + 'index.html' : p);
    e.respondWith(caches.open(CACHE).then(c => {
      const net = fetch(new Request(req.url, { cache: 'no-cache' })).then(r => {
        if (r.ok) c.put(key, r.clone());
        return r;
      });
      const slow = new Promise(ok => setTimeout(ok, 4000));
      return Promise.race([net.catch(() => null), slow.then(() => null)]).then(r => r ||
        c.match(key).then(hit => hit || c.match(req, { ignoreSearch: true })).then(hit => hit || net));
    }));
    return;
  }

  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(new Request(req.url, { cache: 'no-cache' })).then(r => {
      if (r.ok) c.put(url.origin + url.pathname, r.clone());
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })));
});
