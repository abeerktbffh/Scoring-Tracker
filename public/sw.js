// Bragboard service worker — minimal hand-rolled offline app-shell.
// No push notifications here (deferred to a later workstream).
//
// Bump this on every change to sw.js or the precache list so old caches
// are cleaned up on activate.
const CACHE_VERSION = "bragboard-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const OFFLINE_URL = "/offline.html";
const APP_SHELL = ["/", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses — always go to the network so data stays fresh.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Page navigations: try the network first, fall back to the cached shell
  // (and finally the offline notice) when unreachable.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Same-origin static assets: cache-first, populate on miss.
  event.respondWith(cacheFirst(request));
});

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put("/", response.clone());
    return response;
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    const cachedShell = await cache.match("/");
    return cachedShell || (await cache.match(OFFLINE_URL));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const shellCache = await caches.open(SHELL_CACHE);
    const fallback = await shellCache.match(OFFLINE_URL);
    if (fallback) return fallback;
    throw err;
  }
}
