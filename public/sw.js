// Minimal service worker — its only job is to make Tokengotchi installable as a
// standalone app. It doesn't cache (the engine is local and always live); the
// fetch listener just satisfies the install criteria and passes through to network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
