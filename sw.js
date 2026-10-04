/* sunburntimer's service worker, filled in from a shared service-worker
 * template (the numbered SLOTs below). Served from the app ROOT at /sw.js,
 * because a worker's default scope is its URL's directory and this one has to
 * control the whole origin.
 *
 * WHAT THIS WORKER IS FOR. sunburntimer is used on a beach, on a mountain, in
 * a foreign country with data roaming off — precisely where there is no
 * network. So the whole app shell is precached and everything it does with
 * data the user already has works with the radio off: the calculator, both
 * charts and the live exposure timer.
 *
 * WHAT IT DELIBERATELY DOES NOT CACHE: any answer from Open-Meteo or
 * BigDataCloud. Those are cross-origin and, more to the point, per-moment — a
 * UV index is a claim about one hour. Caching one in HTTP-land would put a
 * stale UV number behind the app's back, where js/uv_source.js cannot see how
 * old it is and cannot refuse it. A fetched reading lives in ONE place, the
 * app's own store, with the wall-clock time it arrived; that timestamp is what
 * the honest-staleness rule is built on and this worker must never create a
 * second, untimed copy of it.
 *
 * Delivery rules for this file and everything it caches: serve.py, which is
 * what sets them.
 */

// --- SLOT 1: identity ------------------------------------------------------
// Bump CACHE_VERSION on every deploy that changes a precached file. The version
// is in the cache NAME, so a new worker fills a new cache and the activate
// handler deletes every older `sunburn-shell-*` — there is no in-place
// invalidation to get wrong, and a rollback re-uses its own old name. "-shell"
// is not decoration: the shell is the only thing this cache may ever hold.
const APP = "sunburn-shell";
// v2: v1 could hold stale bytes. The network-first branch below wrote whatever
// `fetch(request)` returned into the shell cache, and on a server sending no
// Cache-Control that is whatever the browser's HTTP cache decided — so a cache
// named for the current version was able to contain a month-old module. The
// revalidating fetch stops it happening again; the bump throws away the copies
// that already exist on people's phones.
// v3: the one-page redesign — new shell, and js/answer.js.
// v4: comment-only edits across the shell; bumped so no phone keeps the old bytes.
// v5: the bento — six tiles, a shared cursor, js/solar.js.
const CACHE_VERSION = "v5";
const CACHE = `${APP}-${CACHE_VERSION}`;

// --- SLOT 2: caches the activate sweep must never touch --------------------
// Empty, and it has to stay empty. A protected cache exists so a version bump
// cannot delete something the user made that no deploy can re-create (a podcast
// app's downloaded episodes). Everything this app keeps for the user — the last
// forecast, its timestamp, a hand-typed UV index — is in localStorage, which
// no cache sweep touches. An entry appearing here would mean weather responses
// had started being cached, which is exactly what this worker forbids.
const PROTECTED_CACHES = [];

// --- SLOT 3: the offline app shell ----------------------------------------
// The whole shell, because the whole app is the shell: nine ES modules, one
// stylesheet, one document. They are all loaded on every visit anyway, and a
// module graph with one member missing does not degrade — it does not run.
//
// OFFLINE_URL is the app itself, not a separate offline.html. This is a single
// page whose entire value offline is that it still calculates; a courtesy page
// saying "you are offline" would be strictly worse than the app that opens,
// shows the reading it stored and the time it read it, and refuses to pretend
// the reading is current. An offline.html here would be a page nobody could
// ever reach that still had to carry a head block and a stylesheet.
const OFFLINE_URL = "/";
const PRECACHE = [
  OFFLINE_URL,
  "/css/styles.css",
  "/js/answer.js",
  "/js/app.js",
  "/js/calculations.js",
  "/js/charts.js",
  "/js/config.js",
  "/js/services.js",
  "/js/solar.js",
  "/js/store.js",
  "/js/utils.js",
  "/js/uv_source.js",
  "/static/fleet_pwa.js",
  "/static/manifest.webmanifest",
  "/static/icons/apple-touch-icon.png",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/icons/icon-maskable-512.png",
  "/static/icons/favicon.ico",
  "/static/icons/favicon.svg",
];

// --- SLOT 4: what must never be cached ------------------------------------
// This app is a static tree with no API, no session and no per-user route on
// its own origin, so the usual fleet exclusions (/api/, /login, /logout) have
// nothing to match. The list is not empty for the sake of it: /sw.js is here
// because a worker that cached itself could never be replaced.
const NEVER_CACHE = [
  /^\/sw\.js$/,
];

// The data providers, refused BY NAME. The cross-origin guard in the fetch
// handler below already returns for every one of these, so this list is
// deliberately redundant — it exists because "cache the weather so the app is
// faster offline" is the single most plausible future edit to this file, and
// it must run into a named refusal with a reason rather than into an origin
// check that looks like plumbing. A UV index is a claim about one hour; the
// only copy of one lives in the app's store WITH the time it was fetched, so
// js/uv_source.js can age it out. An HTTP-cached copy has no such timestamp
// and cannot be refused.
const NEVER_CACHE_HOSTS = [
  /(^|\.)open-meteo\.com$/,
  /(^|\.)bigdatacloud\.net$/,
];

// --- SLOT 5: immutable, content-addressed assets --------------------------
// Empty on purpose: nothing here has a hash in its name (no build step, by
// design), so no file can be trusted from cache without revalidating. A wrong
// entry would serve a stale module for a year.
const IMMUTABLE = [];

// ---------------------------------------------------------------------------
// Everything below is the template's, with the one addition marked in the
// fetch handler.
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  // No skipWaiting: a new worker waits until the app is reopened, or until the
  // page asks through the SKIP_WAITING message below. Swapping modules under a
  // running exposure timer is how a live page loses the scripts it was written
  // against. This is the "reopen to update" contract fleet_pwa.js surfaces.
  //
  // Each entry is fetched and gated through cacheable() rather than handed to
  // cache.addAll, which CANNOT be filtered: it stores whatever came back with a
  // 200. `cache: "no-cache"` because a plain fetch goes through the browser's
  // HTTP cache, whose heuristic freshness can hand the worker a file that is
  // already weeks stale — the exact failure serve.py's headers exist to stop.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (url) => {
      const request = new Request(url, { cache: "no-cache" });
      const response = await fetch(request);
      if (!cacheable(request, response)) {
        throw new Error(`refusing to precache ${url} (${response.status}, ${response.type})`);
      }
      await cache.put(url, response);
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(`${APP}-`) && name !== CACHE &&
        !PROTECTED_CACHES.includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* The shell's network leg, forced to revalidate.
 *
 * A worker's `fetch(request)` carries the PAGE's cache disposition — "default"
 * for a subresource — so it is answered by the browser's HTTP cache on exactly
 * the terms the page would have got. Where the server sends no `Cache-Control`
 * that means HEURISTIC freshness, roughly 10% of the file's age since
 * Last-Modified, and network-first quietly becomes cache-first: the worker
 * never touches the network, so it cannot notice a deploy and cannot rescue
 * anyone from one. It also means the cache writes below can store a stale body
 * under a fresh version's name.
 *
 * Not hypothetical. A deploy once restarted this app onto
 * `python3 -m http.server` instead of serve.py, and a single page load
 * straddling the update left browsers running a month-old js/app.js beside
 * seven fresh modules. An ES
 * module graph half a version apart does not fail loudly; it computes with the
 * wrong shapes until something throws. Measured on Chromium: the stale module
 * survived the deploy, a reload and a browser restart, and only this option
 * cleared it. A month-old file buys about three days of that.
 *
 * `cache: "no-cache"` is a conditional request, not a bypass — an unchanged
 * file costs a 304 with no body. serve.py states the same rule from the server
 * end; this states it where a wrong server cannot take it away, which is
 * precisely what went wrong.
 *
 * Navigations are deliberately left alone: `new Request(navigateRequest, init)`
 * coerces the request's mode to same-origin, and the document is not what
 * skews — every module in the graph is fetched by the branch this serves.
 */
function revalidating(request) {
  return new Request(request, { cache: "no-cache" });
}

function cacheable(request, response) {
  // A response is only worth keeping if it is this origin's own, a plain 200,
  // and not the end of a redirect chain — a redirected response replayed from
  // cache lands on the wrong URL.
  return response && response.ok && response.type === "basic" && !response.redirected &&
    request.method === "GET";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // THE ADDITION: the weather providers, refused by name and first, ahead of
  // the general cross-origin guard that would also have returned. See
  // NEVER_CACHE_HOSTS.
  if (NEVER_CACHE_HOSTS.some((pattern) => pattern.test(url.hostname))) return;

  // Mutations, cross-origin calls, range requests and streams are passed
  // straight through: no cache read, no cache write, no interception.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.headers.get("range")) return;
  if (request.headers.get("accept")?.includes("text/event-stream")) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  if (request.mode === "navigate") {
    // Network-first: the page is the thing most likely to have changed, and a
    // stale HTML shell pointing at deleted modules is a broken app, not an
    // offline one. Only a real network failure falls back — to the cached
    // document, and then to the precached shell, which IS this app.
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (cacheable(request, response)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch (error) {
        return (await caches.match(request)) ||
          (await caches.match(OFFLINE_URL)) ||
          new Response("offline", { status: 503, headers: { "content-type": "text/plain" } });
      }
    })());
    return;
  }

  if (IMMUTABLE.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith((async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (cacheable(request, response)) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })());
    return;
  }

  // Everything else: network-first with a cached fallback, so the app opens
  // offline with the last bytes it saw and is never a version behind online.
  // After the exclusions above, "everything else" is this app's own CSS, its
  // modules and its icons. "Never a version behind" is the revalidating fetch's
  // doing, not network-first's — see revalidating().
  event.respondWith((async () => {
    try {
      const response = await fetch(revalidating(request));
      if (cacheable(request, response)) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch (error) {
      const hit = await caches.match(request);
      if (hit) return hit;
      throw error;
    }
  })());
});
