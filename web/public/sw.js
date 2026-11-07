/* Tune Arena: a public offline page, never an offline copy of a user account. */
const CACHE = "tune-arena-public-shell-v1";
const PUBLIC_ASSETS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("tune-arena-public-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.mode !== "navigate") return;
  // Auth/admin/API requests, including links with confirmation tokens, always go straight to the network.
  if (!["/", "/install", "/winners"].includes(url.pathname)) return;
  if (["token", "code", "state", "confirm"].some(key => url.searchParams.has(key))) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match("/offline.html")) || new Response("Tune Arena needs an internet connection.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
});
