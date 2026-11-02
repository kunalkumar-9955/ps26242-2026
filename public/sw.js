/**
 * SatyaRPL Service Worker — Versioned Offline Shell & Sync Fallback
 * Version: satyarpl-shell-v1.0.0
 */

const CACHE_VERSION = "satyarpl-shell-v1.0.0";
const PRECACHE_ASSETS = [
  "/",
  "/worker",
  "/worker/capture",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// 1. Install Event: Cache Core App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn("[SW] Some assets could not be pre-cached during install:", err);
        });
      })
      .then(() => {
        // Don't auto skipWaiting; wait for user confirmation or message
      })
  );
});

// 2. Activate Event: Evict Stale Caches & Claim Clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_VERSION) {
              console.log("[SW] Deleting stale cache:", name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-First for API/Pages, Cache-First for Static Assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (e.g. POST to APIs are handled by Dexie Sync Engine)
  if (request.method !== "GET") {
    return;
  }

  // API calls: Network-First with offline JSON fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            offline: true,
            error: "Device is currently offline. Action queued in local store.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // HTML Page Navigation: Network-First, fall back to Cache, then /offline.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const offlinePage = await caches.match("/offline.html");
          return offlinePage || new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  // Static Assets (_next/static, images, icons, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Update & Control Messages
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_VERSION });
    }
  }
});

// 5. Background Sync API (Chromium / Chrome Android)
self.addEventListener("sync", (event) => {
  if (event.tag === "satyarpl-evidence-sync") {
    console.log("[SW] Background Sync triggered: satyarpl-evidence-sync");
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "TRIGGER_SYNC", reason: "background_sync" });
        });
      })
    );
  }
});
