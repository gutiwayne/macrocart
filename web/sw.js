/* macrocart service worker: the app shell works offline. Your data is in IndexedDB,
   not here. Bump VERSION on every release so phones pick up the new files. */
const VERSION = "macrocart-v2.0.0";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "js/db.js", "js/api.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
  "vendor/barcode-detector.js", "vendor/zxing_reader.wasm",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("macrocart-") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Same-origin files: network first (so a new release shows at once), the cache when
   offline. Open Food Facts and its photos are left to the browser. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if(res.ok && res.type === "basic"){ const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
});
