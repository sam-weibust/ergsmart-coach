import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
} from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

const SHELL_CACHE = "crewsync-shell-v1";
const API_CACHE = "crewsync-api-v1";

// Injected by vite-plugin-pwa at build time
self.__WB_MANIFEST;
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// App-shell navigation fallback
registerRoute(
  new NavigationRoute(
    new CacheFirst({
      cacheName: SHELL_CACHE,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
      ],
    })
  )
);

// Static assets — cache first
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
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Training plans — network first, fall back to cache
registerRoute(
  ({ url }) => url.pathname.includes("/functions/v1/generate-training-plan") ||
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

// Activate immediately and claim all clients
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
