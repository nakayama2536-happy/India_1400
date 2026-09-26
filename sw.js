const CACHE = "india1400-v5-14-20260926-app-only1";
const SHELL = ["./?v=5.14", "index.html", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];
const DYNAMIC_JSON = new Set([
  "market.json",
  "history.json",
  "nifty_daily_history.json",
  "indicator_history.json",
  "common_snapshot.json",
  "forecast_evaluation.json",
  "nifty_ohlc_history.json",
  "india_core.json",
]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheKey = request) {
  try {
    const response = await fetch(request, {cache: "no-store"});
    const cache = await caches.open(CACHE);
    if (response.ok) cache.put(cacheKey, response.clone());
    return response;
  } catch (e) {
    return (await caches.match(cacheKey)) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  const filename = url.pathname.split("/").pop();
  if (DYNAMIC_JSON.has(filename)) {
    const canonicalKey = new Request(url.origin + url.pathname);
    event.respondWith(networkFirst(event.request, canonicalKey));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});