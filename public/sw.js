const CACHE_PREFIX = "jikeoro-senior-";
const RELEASE_URL = new URL("./?v=22", self.registration.scope).href;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(windows.map((client) => client.navigate(RELEASE_URL).catch(() => undefined)));
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Always display a visible fallback. */ }
  event.waitUntil(self.registration.showNotification(
    payload.title || "지켜로와 함께해요!",
    {
      body: payload.body || "오늘 걸으신 길은 어땠나요?",
      icon: new URL("icon-192.png", self.registration.scope).href,
      badge: new URL("icon-192.png", self.registration.scope).href,
      tag: payload.test ? "jikeoro-reminder-test" : "jikeoro-walking-reminder",
      data: { test: Boolean(payload.test) },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(RELEASE_URL);
  if (!event.notification.data?.test) target.searchParams.set("from", "reminder");
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      if (!event.notification.data?.test) existing.postMessage({ type: "OPEN_WALKING_REPORT" });
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(fetch(event.request, { cache: "no-store" }));
});
