const CACHE="india1400-v2-1";
const SHELL=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.pathname.endsWith("/market.json") || u.pathname.endsWith("market.json")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match("market.json")));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});