/* The service worker's invariants, read off the real sw.js.
 *
 * A worker is the one file here that cannot be unit-tested by running it: it
 * needs a browser, a registration and a network. What CAN be pinned is the
 * shape of its five slots and the handful of rules the fleet template encodes
 * (ServerCLI docs/fleet-pwa.md) — and those are exactly the parts a later edit
 * gets wrong. The two that would be silent in production and loud here:
 *
 *   - a precache list that names a file this repo does not ship. ONE bad
 *     answer fails the whole install, and the app then has no worker at all:
 *     invisible online, total offline.
 *   - a weather response becoming cacheable. That would put a UV index in HTTP
 *     land where js/uv_source.js cannot see its age and cannot refuse it,
 *     quietly undoing the honest-staleness rule from underneath.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { APP_ROOT } from "./harness.js";

const SW = readFileSync(join(APP_ROOT, "sw.js"), "utf8");
const INDEX = readFileSync(join(APP_ROOT, "index.html"), "utf8");

/* sw.js is heavily commented on purpose, and several of those comments name the
 * very thing they forbid ("rather than handed to cache.addAll"). Assertions
 * about what the worker DOES read this instead. */
const SW_CODE = SW.split("\n")
	.filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
	.join("\n");

function slot(name) {
	// Lazy up to the FIRST `];`, so a one-line empty slot (`const X = [];`)
	// reads as empty rather than swallowing everything down to the next array.
	const body = SW.match(new RegExp(`^const ${name} = \\[([\\s\\S]*?)\\];`, "m"));
	assert.ok(body, `sw.js has no ${name} array`);
	return body[1];
}

/** The slot's string entries, with OFFLINE_URL resolved by name. */
function list(name) {
	const offline = SW.match(/const OFFLINE_URL = "([^"]+)"/);
	const entries = [];
	for (const line of slot(name).split("\n")) {
		const code = line.split("//")[0];
		const quoted = code.match(/"([^"]+)"/);
		if (quoted) entries.push(quoted[1]);
		else if (code.includes("OFFLINE_URL") && offline) entries.push(offline[1]);
	}
	return entries;
}

/** The slot's JavaScript regex literals as real ones. */
function patterns(name) {
	return slot(name).split("\n")
		.filter((line) => !line.trim().startsWith("//"))
		.map((line) => line.trim().match(/^\/(.*)\/[a-z]*,?$/))
		.filter(Boolean)
		.map((m) => new RegExp(m[1]));
}

/** Where a root-relative URL lands in this repo. "/" is index.html. */
function fileFor(url) {
	return join(APP_ROOT, url === "/" ? "index.html" : url.replace(/^\//, ""));
}

// --- the precache list ------------------------------------------------------

test("every precached URL is a file this repo actually ships", () => {
	for (const url of list("PRECACHE")) {
		assert.ok(existsSync(fileFor(url)), `${url} is precached but ${fileFor(url)} does not exist`);
	}
});

test("the precache covers the whole module graph index.html loads", () => {
	// An ES module graph does not degrade when a member is missing — it does
	// not run. So "the shell" here means every script tag and every import,
	// discovered from the source rather than kept by hand.
	const precache = new Set(list("PRECACHE"));
	const linked = [...INDEX.matchAll(/(?:href|src)="((?:\/|css\/|js\/)[^"]+)"/g)]
		.map((m) => (m[1].startsWith("/") ? m[1] : `/${m[1]}`))
		.filter((url) => url.endsWith(".css") || url.endsWith(".js"));
	assert.ok(linked.length >= 2, "index.html stopped linking its own code — has the shell moved?");
	for (const url of linked) assert.ok(precache.has(url), `${url} is loaded by index.html but not precached`);

	for (const url of [...precache].filter((u) => u.startsWith("/js/"))) {
		const imports = [...readFileSync(fileFor(url), "utf8").matchAll(/from "\.\/([^"]+)"/g)];
		for (const [, name] of imports) {
			assert.ok(precache.has(`/js/${name}`), `${url} imports ${name}, which is not precached`);
		}
	}
});

test("the app itself is the offline page", () => {
	// A single page whose whole value offline is that it still calculates. A
	// courtesy "you are offline" page would be strictly worse than the app that
	// opens, shows the reading it stored and the time it read it, and refuses
	// to pretend the reading is current.
	assert.match(SW, /const OFFLINE_URL = "\/";/);
	assert.ok(list("PRECACHE").includes("/"));
	assert.ok(!existsSync(join(APP_ROOT, "offline.html")),
		"an offline.html nobody can reach still has to carry a head block");
});

test("nothing is both precached and refused", () => {
	const refuse = patterns("NEVER_CACHE");
	for (const url of list("PRECACHE")) {
		assert.ok(!refuse.some((p) => p.test(url)), `${url} is an install that fails on its own rules`);
	}
});

// --- what must never be cached ---------------------------------------------

test("the weather providers are refused by name, and the refusal runs first", () => {
	// Deliberately redundant with the cross-origin guard: "cache the weather so
	// the app is faster offline" is the most plausible future edit to this
	// file, and it must run into a named refusal with a reason.
	const hosts = patterns("NEVER_CACHE_HOSTS");
	for (const host of ["api.open-meteo.com", "air-quality-api.open-meteo.com",
		"geocoding-api.open-meteo.com", "api.bigdatacloud.net"]) {
		assert.ok(hosts.some((p) => p.test(host)), `${host} is not refused by name`);
	}
	const handler = SW.split('addEventListener("fetch"')[1];
	const hostGuard = handler.indexOf("NEVER_CACHE_HOSTS.some");
	const originGuard = handler.indexOf("url.origin !== self.location.origin");
	assert.ok(hostGuard > 0 && hostGuard < originGuard,
		"the named refusal must come before the generic origin check");
});

test("every cross-origin host services.js talks to is on the refusal list", () => {
	// Discovered from the app's own code: a new provider added to services.js
	// has to be classified here rather than quietly becoming cacheable.
	const services = readFileSync(join(APP_ROOT, "js/services.js"), "utf8");
	const hosts = new Set([...services.matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]));
	assert.ok(hosts.size >= 3, "no provider hosts found in services.js — has the fetch layer moved?");
	const refused = patterns("NEVER_CACHE_HOSTS");
	for (const host of hosts) {
		assert.ok(refused.some((p) => p.test(host)), `${host} is fetched but not on NEVER_CACHE_HOSTS`);
	}
});

test("the worker never caches itself", () => {
	assert.ok(patterns("NEVER_CACHE").some((p) => p.test("/sw.js")),
		"a worker that cached itself could never be replaced");
});

test("only same-origin 200s that are not redirects are ever stored", () => {
	assert.match(SW, /response\.ok && response\.type === "basic" && !response\.redirected/);
	assert.match(SW, /request\.method === "GET"/);
});

// --- versioning and the sweep ----------------------------------------------

test("the cache name carries the version, and activate deletes the older ones", () => {
	assert.match(SW, /const CACHE = `\$\{APP\}-\$\{CACHE_VERSION\}`/);
	const activate = SW.split('addEventListener("activate"')[1].split('addEventListener("message"')[0];
	assert.ok(activate.includes("name.startsWith(`${APP}-`) && name !== CACHE"),
		"the sweep must be scoped to this app's own versioned caches");
	assert.ok(activate.includes("caches.delete(name)"));
});

test("the sweep skips protected caches, and there are none to protect", () => {
	// A protected cache exists so a version bump cannot delete something the
	// user made that no deploy can re-create. Everything this app keeps for the
	// user is in localStorage, which no sweep touches. An entry appearing here
	// would mean weather responses had started being cached.
	assert.ok(SW.includes("!PROTECTED_CACHES.includes(name)"));
	assert.deepEqual(list("PROTECTED_CACHES"), []);
});

test("nothing is treated as immutable, because nothing here is content-addressed", () => {
	// This app has no build step by design, so no filename changes when its
	// bytes do. A wrong entry here would serve a stale module for a year.
	assert.match(SW, /const IMMUTABLE = \[\];/);
});

test("a new worker waits instead of swapping modules under a running timer", () => {
	const install = SW.split('addEventListener("install"')[1].split('addEventListener("activate"')[0];
	const code = install.split("\n").map((line) => line.split("//")[0]).join("\n");
	assert.ok(!code.includes("skipWaiting"), "no skipWaiting on install — see the reopen-to-update contract");
	assert.ok(SW.includes('if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();'));
});

test("the install gates every entry rather than handing the list to addAll", () => {
	// cache.addAll CANNOT be filtered: it stores whatever came back with a 200.
	assert.ok(!SW_CODE.includes("addAll"));
	assert.match(SW, /refusing to precache/);
	assert.match(SW, /new Request\(url, \{ cache: "no-cache" \}\)/);
});

test("this is a filled-in worker, not the fleet template", () => {
	assert.ok(!existsSync(join(APP_ROOT, "sw-template.js")));
	assert.ok(!SW.includes('const APP = "APPNAME"'));
});

// --- the head block and how the worker is started ---------------------------

test("index.html carries the generated head block", () => {
	assert.ok(INDEX.includes('rel="manifest" href="/static/manifest.webmanifest" crossorigin="use-credentials"'));
	assert.ok(INDEX.includes('rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png"'));
	assert.ok(INDEX.includes('content="#fff7ed" media="(prefers-color-scheme: light)"'));
	assert.ok(INDEX.includes('content="#fff7ed" media="(prefers-color-scheme: dark)"'));
	assert.ok(INDEX.includes('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"'));
});

test("there is exactly one viewport meta and it does not bake in user-scalable", () => {
	// Two viewport metas is a fight the page can only lose; and a static
	// user-scalable=no strips pinch zoom from every Android user in an ordinary
	// tab, while Safari ignores it. fleet_pwa.js appends it at runtime instead.
	const viewports = [...INDEX.matchAll(/<meta name="viewport" content="([^"]*)"/g)];
	assert.equal(viewports.length, 1);
	assert.ok(!viewports[0][1].includes("user-scalable"));
});

test("the worker is started from a module, never an inline script", () => {
	// An inline start block is refused under `script-src 'self'`, leaving an app
	// with a manifest, an icon set and no worker at all — with the only
	// evidence in a console nobody is reading.
	assert.ok(INDEX.includes('<script defer src="/static/fleet_pwa.js"></script>'));
	assert.ok(!INDEX.includes("fleetPWA.start"), "the start call must not be inline in the HTML");
	const app = readFileSync(join(APP_ROOT, "js/app.js"), "utf8");
	assert.match(app, /window\.fleetPWA\?\.start\(\{ serviceWorker: "\/sw\.js" \}\)/);
});

test("the vendored fleet module is byte-identical to the fleet's canonical copy", () => {
	const canonical = process.env.FLEET_PWA_REFERENCE ||
		join(process.env.HOME, "git/ServerCLI/docs/fleet-pwa-reference/fleet_pwa.js");
	if (!existsSync(canonical)) return; // no fleet checkout; ServerCLI's own drift test covers this
	assert.deepEqual(readFileSync(join(APP_ROOT, "static/fleet_pwa.js")), readFileSync(canonical),
		"fix bugs in the canonical copy and re-vendor; never patch a vendored copy");
});
