/* The cache headers everything above depends on, against the real serve.py.
 *
 * This is the half of the PWA contract that cannot be proved by reading files:
 * a correct worker delivered with no `Cache-Control` is a worker that can never
 * update itself, because the browser is free to invent a freshness lifetime for
 * it and the worker's own network-first fetch goes through that same HTTP
 * cache. The app used to be served by `python3 -m http.server`, which sends no
 * Cache-Control on anything, which is why serve.py exists.
 *
 * A real subprocess on a scratch port rather than a unit test of the handler
 * class: the thing being asserted is what arrives over a socket, and half of
 * these headers are added by machinery (mimetypes, 304 handling) that only runs
 * in a live server.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { APP_ROOT } from "./harness.js";

// Not serve.py's default port: a test must never be able to answer for — or
// collide with — a real running copy of the app.
const PORT = Number(process.env.VERIFY_PORT || 8938);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
	server = spawn("python3", [join(APP_ROOT, "serve.py"), String(PORT), "--bind", "127.0.0.1"],
		{ cwd: APP_ROOT, stdio: ["ignore", "pipe", "pipe"] });
	for (let i = 0; i < 100; i++) {
		try {
			await fetch(`${BASE}/`);
			return;
		} catch { await new Promise((r) => setTimeout(r, 100)); }
	}
	throw new Error("serve.py never came up");
});

after(() => server?.kill());

test("no response leaves Cache-Control to the browser's imagination", async () => {
	// The invariant, stated once over everything the app serves. An absent
	// header means heuristic caching (~10% of the file's age since
	// Last-Modified), which is how an unchanged file is served stale for days.
	for (const path of ["/", "/sw.js", "/static/manifest.webmanifest", "/css/styles.css",
		"/js/app.js", "/js/uv_source.js", "/static/fleet_pwa.js",
		"/static/icons/icon-192.png", "/static/icons/favicon.svg"]) {
		const response = await fetch(`${BASE}${path}`);
		assert.equal(response.status, 200, path);
		assert.equal(response.headers.get("cache-control"), "no-cache", path);
	}
});

test("the worker is served as JavaScript, no-cache, and allowed the root scope", async () => {
	const response = await fetch(`${BASE}/sw.js`);
	assert.equal(response.headers.get("cache-control"), "no-cache");
	assert.equal(response.headers.get("service-worker-allowed"), "/");
	assert.match(response.headers.get("content-type"), /^(application|text)\/javascript/);
});

test("the manifest gets the content type browsers actually accept", async () => {
	// `.webmanifest` is in neither Python's mimetypes nor nginx's stock
	// mime.types. Served as octet-stream the manifest is ignored outright and
	// the install prompt has no name and no icon.
	const response = await fetch(`${BASE}/static/manifest.webmanifest`);
	assert.equal(response.headers.get("content-type"), "application/manifest+json");
	assert.equal(response.headers.get("cache-control"), "no-cache");
	assert.equal((await response.json()).id, "/");
});

test("an unchanged file revalidates into an empty 304", async () => {
	// What makes `no-cache` cheap rather than a full re-download on every load.
	const first = await fetch(`${BASE}/js/uv_source.js`);
	const lastModified = first.headers.get("last-modified");
	assert.ok(lastModified, "no Last-Modified, so no conditional request is possible");
	const second = await fetch(`${BASE}/js/uv_source.js`, {
		headers: { "If-Modified-Since": lastModified },
	});
	assert.equal(second.status, 304);
	assert.equal((await second.text()).length, 0);
});

test("the app sets its own security headers", async () => {
	// A reverse proxy that passes responses through untouched adds none, so if
	// the app does not say these, nothing does.
	const response = await fetch(`${BASE}/`);
	assert.equal(response.headers.get("x-content-type-options"), "nosniff");
	assert.equal(response.headers.get("referrer-policy"), "no-referrer");
	assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("the server does not advertise its Python version to the internet", async () => {
	// This app is PUBLIC; http.server's default banner names the interpreter
	// build.
	const response = await fetch(`${BASE}/`);
	assert.equal(response.headers.get("server"), "sunburntimer");
});

test("the root serves the app, not a directory listing", async () => {
	const response = await fetch(`${BASE}/`);
	assert.match(response.headers.get("content-type"), /^text\/html/);
	assert.match(await response.text(), /Sunburn Calculator/);
});

test("only the site is served, never the rest of the checkout", async () => {
	// The server's root is the git checkout, so everything that is repository
	// rather than site must 404 -- encoded or not, and no folder is a listing.
	for (const path of ["/.git/HEAD", "/.git/", "/%2egit/config", "/serve.py", "/README.md",
		"/package.json", "/bin/sun", "/tests/", "/tests/harness.js", "/static/%2e%2e/serve.py",
		"/js/", "/static/icons/"]) {
		const response = await fetch(`${BASE}${path}`);
		assert.equal(response.status, 404, path);
		await response.arrayBuffer();
	}
	for (const path of ["/", "/index.html", "/sw.js", "/css/styles.css", "/js/app.js",
		"/static/manifest.webmanifest", "/static/icons/favicon.svg"]) {
		const response = await fetch(`${BASE}${path}`);
		assert.equal(response.status, 200, path);
		await response.arrayBuffer();
	}
});
