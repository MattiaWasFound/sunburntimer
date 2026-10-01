#!/usr/bin/env node
/* Before/after captures for the 2026-10-01 polish round.
 *
 *   node design/mockups/20261001-polish/capture.cjs <checkout-dir> <out-dir> [scenario…]
 *
 * Serves <checkout-dir> with its own serve.py on a free loopback port, pins the
 * browser clock to a fixed summer morning, and answers every Open-Meteo call
 * from the fixtures below, so a before and an after shot see the same sky.
 * Nothing reaches the network: BigDataCloud is aborted and the service worker
 * is blocked (it would otherwise answer the shell from its own cache).
 *
 * Needs the fleet's uitest library (ServerCLI bin/uitest); point UITEST_LIB at
 * it when the checkout is not at ~/git/ServerCLI.
 */
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const { createSession, route, initScript, waitForHttp } =
	require(process.env.UITEST_LIB || path.join(os.homedir(), "git/ServerCLI/bin/uitest"));

// 2026-07-14 11:40 in Copenhagen (UTC+2).
const NOW = Date.parse("2026-07-14T09:40:00Z");

const PLACES = {
	copenhagen: { lat: 55.6761, lon: 12.5683, tz: "Europe/Copenhagen", offset: 2, peak: 6.2,
		rise: 4.75, set: 21.83, temp: 23, dew: 13, code: 1, elevation: 9, aqi: 31 },
	lisbon: { lat: 38.7223, lon: -9.1393, tz: "Europe/Lisbon", offset: 1, peak: 9.1,
		rise: 6.33, set: 21.0, temp: 29, dew: 15, code: 0, elevation: 45, aqi: 44 },
};

function placeFor(lat) {
	return Math.abs(lat - PLACES.lisbon.lat) < 1 ? PLACES.lisbon : PLACES.copenhagen;
}

const pad = (n) => String(n).padStart(2, "0");
function localStamp(ms, offsetH) {
	const d = new Date(ms + offsetH * 3600000);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function uvAt(place, hour) {
	const h = ((hour % 24) + 24) % 24;
	if (h <= place.rise || h >= place.set) return 0;
	const x = Math.sin(Math.PI * (h - place.rise) / (place.set - place.rise));
	return Math.round(place.peak * Math.pow(x, 1.6) * 100) / 100;
}

function forecast(place) {
	const localNow = NOW + place.offset * 3600000;
	const midnightLocal = localNow - (localNow % 86400000);
	const midnightUtc = midnightLocal - place.offset * 3600000;
	const hourly = { time: [], temperature_2m: [], dew_point_2m: [], uv_index: [], weather_code: [] };
	for (let i = 0; i < 72; i++) {
		const t = midnightUtc + i * 3600000;
		const h = i % 24;
		hourly.time.push(localStamp(t, place.offset));
		hourly.temperature_2m.push(Math.round((place.temp - 7 + 7 * Math.sin(Math.PI * Math.max(0, h - 5) / 14)) * 10) / 10);
		hourly.dew_point_2m.push(place.dew);
		hourly.uv_index.push(uvAt(place, h));
		hourly.weather_code.push(h > 6 && h < 20 ? place.code : 0);
	}
	const curMs = NOW - (NOW % 900000);
	const curLocalH = ((curMs + place.offset * 3600000) % 86400000) / 3600000;
	const day = (k, hour) => localStamp(midnightUtc + k * 86400000 + hour * 3600000, place.offset);
	return {
		latitude: place.lat, longitude: place.lon, timezone: place.tz, elevation: place.elevation,
		current: { time: localStamp(curMs, place.offset), temperature_2m: place.temp, dew_point_2m: place.dew,
			uv_index: Math.round(uvAt(place, curLocalH) * 10) / 10, weather_code: place.code },
		hourly,
		daily: { sunrise: [0, 1, 2].map((k) => day(k, place.rise)), sunset: [0, 1, 2].map((k) => day(k, place.set)) },
	};
}

const GEOCODE = { results: [
	{ id: 2267057, name: "Lisbon", admin1: "Lisbon", country: "Portugal", country_code: "PT", latitude: 38.7223, longitude: -9.1393 },
	{ id: 5367929, name: "Lisbon", admin1: "Ohio", country: "United States", country_code: "US", latitude: 40.7723, longitude: -80.7681 },
] };

/* What a returning visitor has in localStorage. `weatherFetchedAt` is the time
 * the stored forecast arrived; a scenario that wants the app to refetch on load
 * makes it old, one that wants an offline refusal also cuts the network. */
function saved(place, { skinType = "II", spfLevel = "SPF_15", sweatLevel = "MEDIUM", fetchedAgoMin = 0 } = {}) {
	const p = PLACES[place];
	const placeName = place === "lisbon" ? "Lisbon, Portugal" : "Copenhagen, Denmark";
	const countryCode = place === "lisbon" ? "PT" : "DK";
	return {
		key: "sunburntimer-storage",
		value: JSON.stringify({
			skinType, spfLevel, sweatLevel, activityStart: null, manualUv: null, uvAck: null,
			geolocation: { status: "completed", position: { latitude: p.lat, longitude: p.lon }, placeName, countryCode,
				weather: storedWeather(p), weatherFetchedAt: NOW - fetchedAgoMin * 60000 },
		}),
	};
}

/* The stored shape is what services.js builds from the response, so this goes
 * through the app's own parser: load services.js and hand it the fixture. */
let storedWeatherCache = new Map();
function storedWeather(place) { return storedWeatherCache.get(place); }

async function buildStored(root) {
	const services = await import(require("node:url").pathToFileURL(path.join(root, "js/services.js")).href);
	const realFetch = globalThis.fetch;
	for (const p of Object.values(PLACES)) {
		globalThis.fetch = async (url) => {
			const u = String(url);
			const body = u.includes("air-quality") ? { current: { us_aqi: p.aqi } } : forecast(p);
			return { ok: true, status: 200, json: async () => body };
		};
		storedWeatherCache.set(p, await services.fetchWeatherData({ latitude: p.lat, longitude: p.lon }, "DK"));
	}
	globalThis.fetch = realFetch;
}

const PHONE = { width: 390, height: 844, touch: true };
const SMALL = { width: 360, height: 640, touch: true };
const DESKTOP = { width: 1440, height: 900, touch: false };

/* name → viewport, storage, network, optional action, fullPage. */
const SCENARIOS = {
	"first-phone": { vp: PHONE },
	"first-phone-full": { vp: PHONE, fullPage: true },
	"returning-phone": { vp: PHONE, store: () => saved("lisbon", { fetchedAgoMin: 120 }) },
	"returning-phone-full": { vp: PHONE, store: () => saved("lisbon", { fetchedAgoMin: 120 }), fullPage: true },
	"returning-small": { vp: SMALL, store: () => saved("lisbon", { fetchedAgoMin: 120 }) },
	"returning-desktop": { vp: DESKTOP, store: () => saved("lisbon", { fetchedAgoMin: 120 }) },
	"returning-desktop-full": { vp: DESKTOP, store: () => saved("lisbon", { fetchedAgoMin: 120 }), fullPage: true },
	"first-desktop": { vp: DESKTOP },
	"offline-phone": { vp: PHONE, store: () => saved("lisbon", { fetchedAgoMin: 180 }), offline: true },
	"returning-phone-dark": { vp: PHONE, scheme: "dark", store: () => saved("lisbon", { fetchedAgoMin: 120 }) },
	"returning-desktop-dark": { vp: DESKTOP, scheme: "dark", store: () => saved("lisbon", { fetchedAgoMin: 120 }) },
	"skin-sheet-phone": { vp: PHONE, store: () => saved("lisbon"), act: async (page) => {
		await page.click("[data-edit=skin]"); await page.waitForTimeout(600);
	} },
	"place-sheet-phone": { vp: PHONE, store: () => saved("lisbon"), act: async (page) => {
		await page.click("[data-edit=place]"); await page.waitForTimeout(300);
		await page.fill("#place-search", "Lisb"); await page.waitForTimeout(900);
	} },
	"details-phone": { vp: PHONE, store: () => saved("lisbon"), act: async (page) => {
		await page.evaluate(() => document.querySelector("#details")?.scrollIntoView());
		await page.waitForTimeout(400);
	} },
	"timer-phone": { vp: PHONE, store: () => saved("lisbon"), act: async (page) => {
		await page.click("[data-timer=start]"); await page.waitForTimeout(400);
	} },
};

function freePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
		srv.on("error", reject);
	});
}

async function main() {
	const [root, outDir, ...only] = process.argv.slice(2);
	if (!root || !outDir) { console.error("usage: capture.cjs <checkout> <out-dir> [scenario…]"); process.exit(2); }
	const absRoot = path.resolve(root);
	fs.mkdirSync(outDir, { recursive: true });
	await buildStored(absRoot);
	const port = await freePort();
	const server = spawn("python3", [path.join(absRoot, "serve.py"), String(port)], { stdio: "ignore" });
	const base = `http://127.0.0.1:${port}/`;
	try {
		await waitForHttp(base, { timeoutMs: 10000 });
		for (const [name, sc] of Object.entries(SCENARIOS)) {
			if (only.length && !only.includes(name)) continue;
			const session = await createSession({ ...sc.vp, scheme: sc.scheme || "light",
				contextOptions: { serviceWorkers: "block", timezoneId: "Europe/Copenhagen", locale: "en-GB" } });
			try {
				await session.page.clock.setFixedTime(NOW);
				const stored = sc.store ? sc.store() : null;
				await session.use(
					stored ? initScript(([k, v]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); } }, [stored.key, stored.value]) : null,
					route("https://api.open-meteo.com/**", (r) => sc.offline ? r.abort() :
						r.fulfill({ json: forecast(placeFor(Number(new URL(r.request().url()).searchParams.get("latitude")))) })),
					route("https://air-quality-api.open-meteo.com/**", (r) => sc.offline ? r.abort() :
						r.fulfill({ json: { current: { us_aqi: placeFor(Number(new URL(r.request().url()).searchParams.get("latitude"))).aqi } } })),
					route("https://geocoding-api.open-meteo.com/**", (r) => sc.offline ? r.abort() : r.fulfill({ json: GEOCODE })),
					route("https://api.bigdatacloud.net/**", (r) => r.abort()),
				);
				await session.navigate(base, { settleMs: 900 });
				if (sc.act) await sc.act(session.page);
				const file = path.join(outDir, `${name}.png`);
				await session.page.screenshot({ path: file, fullPage: !!sc.fullPage });
				console.log(file);
			} catch (e) {
				console.error(`${name}: ${e.message.split("\n")[0]}`);
			} finally {
				await session.close();
			}
		}
	} finally {
		server.kill();
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
