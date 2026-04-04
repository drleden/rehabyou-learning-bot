/**
 * Service Worker — offline mode scaffold (reserved for v2).
 *
 * In v1 this file is registered but does not cache anything.
 * Full offline support (lesson content, video metadata) is planned for v2.
 */

const CACHE_NAME = "rehabyou-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// v2: intercept fetch and serve cached responses when offline
self.addEventListener("fetch", (_event) => {
  // pass-through in v1
});
