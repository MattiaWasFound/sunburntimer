/* fleet_pwa.js — the fleet's shared PWA browser half. Vendored byte-for-byte
 * per app (docs/fleet-pwa.md); fix it HERE and re-vendor, never patch a copy.
 *
 *   <head>  <script defer src="/static/fleet_pwa.js"></script>
 *   <body>  <script type="module" src="/static/app.js"></script>
 *
 * and from the app's own module, which runs after the deferred classic script:
 *
 *   window.fleetPWA.start({ serviceWorker: "/sw.js" });
 *
 * NOT an inline <script>: `script-src 'self'` (the fleet's CSP) refuses one, and
 * the app is then installable-looking with no worker at all.
 *
 * It owns three things and nothing else: registering the service worker and
 * surfacing its update, publishing online/offline and installed state, and the
 * installed-only affordances that make a home-screen launch stop feeling like a
 * browser tab. It renders no app UI, reads no app state, and every part of it
 * is optional — a failure here must never take the page down with it.
 */

window.fleetPWA = (function () {
  "use strict";

  var root = document.documentElement;
  var config = null;
  var registration = null;
  var deferredInstall = null;

  /* Installed means "launched from the home screen", which is not the same as
   * "installable". iOS reports it only through the legacy navigator flag. */
  function installed() {
    return navigator.standalone === true ||
      matchMedia("(display-mode: standalone)").matches ||
      matchMedia("(display-mode: fullscreen)").matches;
  }

  function emit(name, detail) {
    dispatchEvent(new CustomEvent("fleet-pwa:" + name, { detail: detail }));
  }

  /* ---------------------------------------------------------------------
   * Installed-only affordances
   *
   * All of it is gated on `installed()` and applied at RUNTIME. The zoom rule
   * especially: `user-scalable=no` is appended to the live viewport meta and
   * must never be baked into the static HTML, because Safari ignores the
   * attribute (so it buys nothing on iOS web) while Android Chrome honours it —
   * a static copy would strip pinch zoom, an accessibility affordance, from
   * every Android user browsing the site in a normal tab. This is segue's
   * ruling (web/game.js, IS_NATIVE) applied to the installed PWA, which is the
   * same shell in a different wrapper.
   * ------------------------------------------------------------------- */

  /* Where selection stays ON when the shell blocks it. The list is extensible
   * because an app's own content is not always markable from the outside: a
   * canvas whose notes are `.sheet` elements would otherwise have to turn the
   * whole feature off (`selection: false`) to keep its own text selectable,
   * which is what the first adopters did. `selectable: [".sheet"]`. */
  var SELECTABLE = ["input", "textarea", "[contenteditable]", "[data-pwa-selectable]",
                    ".pwa-selectable"];

  function selectable(options) {
    return SELECTABLE.concat(Array.isArray(options.selectable) ? options.selectable : [])
      .join(", ");
  }

  /* Selection and the iOS long-press callout are browser affordances that read
   * as bugs in an app. Off across the shell, then carved back on wherever you
   * would actually want to select — text fields first, and anything the app
   * marks as content. */
  function selectionCSS(allowed) {
    return [
      "html.pwa-installed, html.pwa-installed body {",
      "  -webkit-user-select: none; user-select: none;",
      "  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;",
      "}",
      "html.pwa-installed :is(" + allowed + ") {",
      "  -webkit-user-select: text; user-select: text; -webkit-touch-callout: default;",
      "}"
    ].join("\n");
  }

  /* `manipulation` and not `none`: it removes only the double-tap-to-zoom
   * delay, which is why it travels with the zoom option. `touch-action: none`
   * on anything large is how a phone loses scrolling entirely, so it belongs to
   * a drag handle and never to a shell. */
  var TAP_CSS = [
    "html.pwa-installed :is(button, a, label, summary, [role=\"button\"], input, select,",
    "  textarea) { touch-action: manipulation; }"
  ].join("\n");

  /* A CONSTRUCTED stylesheet, not an injected <style> element: under
   * `script-src 'self'; style-src 'self'` — the fleet's CSP — a <style> the
   * page builds at runtime is an inline style and is refused, so the shell
   * rules silently never applied on the strictest apps. Constructed sheets are
   * not inline styles and are exempt. The <style> path stays as the fallback
   * for engines without adoptedStyleSheets (Safari before 16.4), where a strict
   * CSP will still refuse it — no worse than the nothing it replaces. */
  function addStyles(css) {
    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [].slice.call(document.adoptedStyleSheets).concat(sheet);
      return;
    } catch (error) {
      var style = document.createElement("style");
      style.id = "fleet-pwa-shell";
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  function applyShellAffordances(options) {
    root.classList.add("pwa-installed");

    /* Each half is gated by its OWN option. `selection: false` used to disable
     * only the selectstart handler while the CSS half kept blocking selection
     * anyway — an app that turned the feature off still got it. */
    var css = [];
    if (options.selection !== false) css.push(selectionCSS(selectable(options)));
    if (options.zoom !== false) css.push(TAP_CSS);
    if (css.length) addStyles(css.join("\n"));

    if (options.zoom !== false) {
      var viewport = document.querySelector('meta[name="viewport"]');
      if (viewport && !/user-scalable/.test(viewport.getAttribute("content") || "")) {
        viewport.setAttribute("content", viewport.getAttribute("content") + ", user-scalable=no");
      }
    }

    if (options.selection !== false) {
      /* CSS is not enough on iOS: a double tap still raises the selection
       * handles over non-input text. Refusing the selection outright is the
       * only reliable stop (canvas, static/app.js). */
      var allowed = selectable(options);
      document.addEventListener("selectstart", function (event) {
        var target = event.target;
        if (target && target.closest && target.closest(allowed)) return;
        event.preventDefault();
      });
    }

    if (options.downloadEscape !== false) {
      /* Installed, iOS has no download manager and no browser chrome: it
       * ignores `download`, renders the file in this very web view, and strands
       * you on a preview with no way back. Opening a real tab is the only exit
       * (canvas learned this the hard way). */
      document.addEventListener("click", function (event) {
        var anchor = event.target && event.target.closest && event.target.closest("a[download]");
        if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        open(anchor.href, "_blank", "noopener,noreferrer");
      });
    }

    /* An installed app's cache and storage are its offline copy; ask for the
     * quota that is not evicted under pressure (pod's index.html). */
    if (options.persistStorage !== false && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  /* ---------------------------------------------------------------------
   * Service worker: register, then wait
   * ------------------------------------------------------------------- */

  function watchUpdate(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", function () {
      /* `installed` WITH a controller means a new version is sitting behind the
       * running one. It is not activated here: swapping the assets under a page
       * that is mid-session is how a live form loses its scripts. The app
       * reopens (or the user takes the offer), and the new worker takes over
       * then — the "reopen to update" contract. */
      if (worker.state === "installed" && navigator.serviceWorker.controller) announceUpdate();
    });
  }

  function announceUpdate() {
    if (root.dataset.pwaUpdate === "ready") return;
    root.dataset.pwaUpdate = "ready";
    emit("update", { apply: applyUpdate });
    if (config.updateBanner !== false) showBanner();
  }

  /* The one built-in piece of UI, and deliberately the smallest possible: with
   * fifty apps adopting, "reopen to update" has to exist by default rather than
   * be fifty forgotten toasts. An app with its own notification surface passes
   * `updateBanner: false` and listens for `fleet-pwa:update` instead. */
  function showBanner() {
    var banner = document.createElement("div");
    banner.id = "fleet-pwa-update";
    banner.setAttribute("role", "status");
    banner.style.cssText = [
      "position:fixed", "z-index:2147483000", "inset-inline:0",
      "bottom:calc(env(safe-area-inset-bottom, 0px) + 12px)", "margin-inline:auto",
      "width:max-content", "max-width:calc(100vw - 24px)",
      "display:flex", "gap:12px", "align-items:center",
      "padding:10px 14px", "border-radius:999px",
      "font:500 14px/1.2 system-ui, sans-serif",
      "background:var(--pwa-banner-bg, #1c1c1e)", "color:var(--pwa-banner-fg, #fff)",
      "box-shadow:0 6px 24px rgba(0,0,0,.28)"
    ].join(";");

    var label = document.createElement("span");
    label.textContent = "Update ready";
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Reopen";
    button.style.cssText = [
      "font:inherit", "cursor:pointer", "border:0", "border-radius:999px",
      "padding:6px 12px", "color:inherit",
      "background:var(--pwa-banner-action, rgba(255,255,255,.18))"
    ].join(";");
    /* Property-wired from creation: one event-wiring mechanism per element. */
    button.onclick = function () { banner.remove(); applyUpdate(); };

    banner.append(label, button);
    document.body.appendChild(banner);
  }

  /* Taking the offer: the waiting worker is told to take over, and the page
   * reloads once it has. Same end state as closing and reopening the app. */
  function applyUpdate() {
    var waiting = registration && registration.waiting;
    if (!waiting) return void location.reload();
    var reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  /* A browser visit must always be live. A worker only earns its keep once the
   * app is launched from the home screen, so an ordinary visitor never gets one
   * — and if a past visit (or a since-removed install) left one behind, this
   * tears it down and drops its caches so the very next load is served from the
   * network. This is what keeps "just visiting the site" from ever showing a
   * stale shell; offline lives in the installed app, nowhere else. */
  function unregisterWorkers() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) { reg.unregister(); });
    }).catch(function () {});
    if (self.caches && caches.keys) {
      caches.keys().then(function (names) {
        names.forEach(function (name) { caches.delete(name); });
      }).catch(function () {});
    }
  }

  function registerWorker(url, scope) {
    return navigator.serviceWorker.register(url, scope ? { scope: scope } : undefined)
      .then(function (reg) {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) announceUpdate();
        watchUpdate(reg.installing);
        reg.addEventListener("updatefound", function () { watchUpdate(reg.installing); });

        /* An installed app is rarely reloaded, so nothing would ever ask for a
         * new version. Coming back to the foreground is the natural moment. */
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update().catch(function () {});
        });
        return reg;
      });
  }

  /* ---------------------------------------------------------------------
   * Entry point
   * ------------------------------------------------------------------- */

  function start(options) {
    config = options || {};

    if (installed()) applyShellAffordances(config);

    function publishNetwork() {
      var offline = navigator.onLine === false;
      root.classList.toggle("pwa-offline", offline);
      emit(offline ? "offline" : "online", { offline: offline });
    }
    root.classList.toggle("pwa-offline", navigator.onLine === false);
    addEventListener("online", publishNetwork);
    addEventListener("offline", publishNetwork);

    /* Captured so the app can offer installation at a moment of its choosing;
     * left uncaptured, Chrome's own prompt is the only chance and it is spent. */
    addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstall = event;
      root.classList.add("pwa-installable");
      emit("installable", {});
    });
    addEventListener("appinstalled", function () {
      deferredInstall = null;
      root.classList.remove("pwa-installable");
      emit("installed", {});
    });

    if (config.serviceWorker && "serviceWorker" in navigator && installed()) {
      /* Registration is an enhancement: a rejected or unsupported worker leaves
       * a perfectly working online app, so it must never reach the page as an
       * unhandled rejection (segue's web/pwa.js posture). Gated on installed()
       * — offline is a home-screen-app feature; a browser tab stays live. */
      registerWorker(config.serviceWorker, config.scope).catch(function (error) {
        emit("error", { error: error });
      });
    }
    return api;
  }

  var api = {
    start: start,
    installed: installed,
    offline: function () { return navigator.onLine === false; },
    applyUpdate: applyUpdate,
    updateReady: function () { return root.dataset.pwaUpdate === "ready"; },
    canInstall: function () { return deferredInstall !== null; },
    promptInstall: function () {
      if (!deferredInstall) return Promise.resolve(null);
      var event = deferredInstall;
      deferredInstall = null;
      root.classList.remove("pwa-installable");
      event.prompt();
      return event.userChoice;
    },
    registration: function () { return registration; }
  };
  return api;
})();
