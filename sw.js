const CACHE_PREFIX = "india1400-v";
const CACHE = "india1400-v5-29-20261005-core-trend";
const SHELL = ["./?v=5.29", "index.html", "deep-dive.js", "deep-dive-bundle.js", "review-history.js", "VERSION", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];
const DYNAMIC_JSON = new Set([
  "market.json",
  "history.json",
  "nifty_daily_history.json",
  "indicator_history.json",
  "common_snapshot.json",
  "forecast_evaluation.json",
  "nifty_ohlc_history.json",
  "india_core.json",
  "india_core_history.json",
  "publication_manifest.json",
]);
const DYNAMIC_TEXT = new Set(["VERSION"]);
function isDynamic(url) { const name=url.pathname.split("/").pop(); return DYNAMIC_JSON.has(name) || DYNAMIC_TEXT.has(name); }

// Cache contract: COM-CACHE-002/003, revision 1 (2026-09-27).
// This namespace prevents accidental cross-app use; it is not an origin security boundary.
const CACHE_BUSTER_PARAM = "v";
const APP_SCOPE = new URL(self.registration.scope);
function inAppScope(url) {
  return url.origin === APP_SCOPE.origin && url.pathname.startsWith(APP_SCOPE.pathname);
}
function dynamicKey(request) {
  const url = new URL(request.url);
  // Only the app-specific documented freshness nonce is discarded.
  // Keep ticker, period, revision and ALL other query parameters.
  url.searchParams.delete(CACHE_BUSTER_PARAM);
  return new Request(url.href, {method: "GET", headers: request.headers});
}
async function ownMatch(key) {
  try { return await (await caches.open(CACHE)).match(key); }
  catch (_) { return undefined; }
}
async function storeResponse(key, response) {
  // A storage/quota failure must not discard a successful network response.
  if (!response.ok || response.redirected) return;
  try { await (await caches.open(CACHE)).put(key, response.clone()); }
  catch (_) { /* Cache is best effort; never touch localStorage/IndexedDB. */ }
}
async function networkFirst(request, cacheKey = request) {
  let response;
  try { response = await fetch(request, {cache: "no-store"}); }
  catch (_) { return (await ownMatch(cacheKey)) || Response.error(); }
  // Do not disguise HTTP errors as success or overwrite the last cached value.
  await storeResponse(cacheKey, response);
  return response;
}
async function shellFirst(request) {
  const cached = await ownMatch(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await storeResponse(request, response);
    return response;
  } catch (_) { return Response.error(); }
}
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // Other applications and external resources are not intercepted or cached.
  if (request.method !== "GET" || !inAppScope(url)) return;
  if (isDynamic(url)) {
    const canonicalKey = dynamicKey(request);
    event.respondWith(networkFirst(request, canonicalKey));
  } else if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(shellFirst(request));
  }
});
