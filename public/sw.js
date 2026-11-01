/* CVLian's service worker: the part that makes "no server" literally true.
 *
 * A compile pulls the WASM engine and a few hundred TeX files out of
 * public/texlive. They are a pinned TeX distribution — the bytes behind a
 * given URL never change within a deploy — so they are cached hard and, once
 * a résumé has been built once, the app keeps working with the network off.
 *
 * Two rules keep a cache on a static host from becoming a trap, because a
 * page with no backend has no way to tell a stuck browser to let go:
 *
 *   1. BUILD is stamped at build time from the contents of dist (see
 *      scripts/stamp-sw.mjs), so every deploy lands in a fresh cache and
 *      activate() drops every older one. Nothing has to be remembered by
 *      hand.
 *   2. The HTML is network-first. A deploy therefore reaches a returning
 *      visitor on the first load that has any network at all, and the cache
 *      is only what answers when the network does not.
 *
 * Anything cross-origin is left alone entirely. On the guest path there is
 * nothing cross-origin at all — even the interface font is vendored — so in
 * practice this is Drive and Google Identity Services, and quietly answering
 * an auth call out of a cache would be a bug with teeth.
 */

const BUILD = "__BUILD__";
const CACHE = `cvlian-${BUILD}`;

/* The shell, stamped in from what was actually built (hashed bundle names and
 * all). It is taken at install rather than as it happens to be used, because
 * the very first visit loads the page before this worker controls anything:
 * without this, a second visit with no network would find no page to open. */
const SHELL = __SHELL__;

/* Immutable within a deploy: hashed bundles, the pinned TeX tree and the
 * engine. These are answered from the cache without ever asking again. */
const IMMUTABLE = /(?:\/assets\/|\/texlive\/|swiftlatexpdftex\.(?:js|wasm)$)/;

self.addEventListener("install", (e) => {
  /* The TeX tree is deliberately *not* in here: it is 24MB, and a résumé
   * cites a few dozen of those files. It fills as it is used instead, which
   * is both smaller and exactly the right subset. */
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("cvlian-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/* Only a 200 from our own origin is worth keeping. A 404 is a real answer
 * the engine expects for its probes, and caching one would make a file that
 * arrives in a later deploy permanently missing. */
const keepable = (res) => res && res.ok && res.status === 200 && res.type === "basic";

/* `ignoreMethod` is what lets a HEAD be answered out of a stored GET, and it
 * is load-bearing: the app preflights the TeX format file with HEAD before
 * starting the engine, so without this the first thing a compile does with
 * no network is fail. Only a GET is ever stored — Cache.put rejects a HEAD. */
const stash = (cache, req, res) => {
  if (req.method === "GET" && keepable(res)) cache.put(req, res.clone()).catch(() => {});
};

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreMethod: true });
  if (hit) return hit;
  const res = await fetch(req);
  stash(cache, req, res);
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    stash(cache, req, res);
    return res;
  } catch (err) {
    const hit =
      (await cache.match(req, { ignoreMethod: true })) ?? (await cache.match("index.html"));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" && req.method !== "HEAD") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Drive, Google sign-in

  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(IMMUTABLE.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
