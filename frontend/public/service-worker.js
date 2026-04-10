/**
 * Service Worker — offline scaffold (v1: pass-through, v2: full offline).
 *
 * Served from /service-worker.js via the public/ directory.
 */

const CACHE_NAME = "rehabyou-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// v2: cache and serve offline
self.addEventListener("fetch", (_event) => {
  // pass-through in v1
});
