import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import {
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
} from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

// Bump this version any time you need to force-clear the old shell cache.
const SHELL_CACHE = "crewsync-shell-v2";
const API_CACHE   = "crewsync-api-v1";

// Old cache names that should be deleted.
const OBSOLETE_CACHES = ["crewsync-shell-v1"];

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Activate immediately and clean up stale caches.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete old shell caches so stale index.html never gets served.
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => OBSOLETE_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// App-shell navigation fallback — NetworkFirst so a fresh index.html is
// always fetched on reload. Falls back to cache only when offline.
// This is the critical fix: CacheFirst here caused stale index.html to be
// served after deploys, breaking all JS chunk references (404s → blank screen).
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: SHELL_CACHE,
      networkTimeoutSeconds: 5,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
      ],
    })
  )
);

// Static assets (JS/CSS chunks, fonts, images) — CacheFirst is fine here
// because Vite hashes asset filenames on every build.
registerRoute(
  ({ request }) =>
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image",
  new CacheFirst({
    cacheName: SHELL_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Training plans — network first, fall back to cache
registerRoute(
  ({ url }) =>
    url.pathname.includes("/functions/v1/generate-training-plan") ||
    url.pathname.includes("/functions/v1/get-training-plan"),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// Erg history — stale while revalidate
registerRoute(
  ({ url }) =>
    url.pathname.includes("/functions/v1/workouts") ||
    url.pathname.includes("/rest/v1/workouts") ||
    url.pathname.includes("/rest/v1/concept2_workouts"),
  new StaleWhileRevalidate({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// Team message board / forum — stale while revalidate
registerRoute(
  ({ url }) =>
    url.pathname.includes("/rest/v1/forum") ||
    url.pathname.includes("/rest/v1/team_messages") ||
    url.pathname.includes("/rest/v1/community"),
  new StaleWhileRevalidate({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 }),
    ],
  })
);
