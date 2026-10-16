const CACHE_PREFIX = "jikeoro-senior-";
const CACHE = `${CACHE_PREFIX}v9`;
const APP_SHELL = new URL("./", self.registration.scope).href;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request.mode === "navigate" ? APP_SHELL : event.request, response.clone());
        }
        return response;
      })
      .catch(() => event.request.mode === "navigate" ? caches.match(APP_SHELL) : caches.match(event.request)),
  );
});
