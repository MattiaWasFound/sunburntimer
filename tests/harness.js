/* The little that stands between node and this app's real browser modules.
 *
 * The rule these tests follow (ServerCLI ~/.claude/engineering-guidelines.md):
 * drive the REAL modules, never a parallel mockup. js/uv_source.js,
 * js/store.js and js/calculations.js are imported here exactly as index.html
 * loads them; the only thing faked is `localStorage`, which node does not have
 * outside an experimental flag, and which store.js reads at module load.
 *
 * store.js keeps ONE module-level state object and reads localStorage the
 * moment it is imported, so a fresh store means a fresh module instance. ESM
 * has no `delete require.cache`, and a plain re-import returns the same
 * instance — a cache-busting query string on the specifier is the whole trick.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let instance = 0;

/** Install a memory-backed localStorage and hand back a fresh store module. */
export async function freshStore(seed = null) {
	const backing = new Map();
	if (seed !== null) backing.set("sunburntimer-storage", JSON.stringify(seed));
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		writable: true,
		value: {
			getItem: (key) => (backing.has(key) ? backing.get(key) : null),
			setItem: (key, value) => backing.set(key, String(value)),
			removeItem: (key) => backing.delete(key),
			clear: () => backing.clear(),
		},
	});
	instance += 1;
	const store = await import(`../js/store.js?fresh=${instance}`);
	// The raw backing map, so a test can assert what actually reached disk
	// rather than what the in-memory state happens to say.
	return { ...store, saved: () => JSON.parse(backing.get("sunburntimer-storage") ?? "null") };
}

export { APP_ROOT };

/* ---------- Fixtures.
 *
 * Shaped exactly like what services.js::fetchWeatherData returns, because that
 * is what store.js persists and uv_source.js reads. Built from a base time so
 * a test can place a forecast anywhere relative to "now" without arithmetic at
 * the call site. ---------- */

/** An hourly forecast of `hours` points, one per hour, starting at `startMs`. */
export function forecast(startMs, hours = 24, uvi = 6) {
	return Array.from({ length: hours }, (_, i) => ({
		dt: Math.floor((startMs + i * 3600000) / 1000),
		temp: 24,
		dewPoint: 12,
		uvi: typeof uvi === "function" ? uvi(i) : uvi,
		weather: [{ id: 0, main: "Sunny", description: "Sunny", icon: "0" }],
	}));
}

/** A whole weather response: `hourly` running from one hour before `nowMs`. */
export function weatherAt(nowMs, { hours = 24, uvi = 6, timezone = "UTC" } = {}) {
	const hourly = forecast(nowMs - 3600000, hours, uvi);
	return {
		current: { dt: Math.floor(nowMs / 1000), temp: 24, dewPoint: 12, uvi: 6,
			weather: [{ id: 0, main: "Sunny", description: "Sunny", icon: "0" }] },
		hourly,
		temperatureUnit: "celsius",
		elevation: 10,
		aqi: { us_aqi: 20 },
		sunrise: new Date(nowMs - 6 * 3600000).toISOString(),
		sunset: new Date(nowMs + 6 * 3600000).toISOString(),
		nextSunrise: new Date(nowMs + 18 * 3600000).toISOString(),
		timezone,
	};
}

/** The store's state shape, as uv_source.js expects to receive it. */
export function stateWith({ weather, weatherFetchedAt, manualUv = null, uvAck = null } = {}) {
	return {
		skinType: "II",
		spfLevel: "NONE",
		sweatLevel: "LOW",
		geolocation: { status: "completed", position: { latitude: 55.68, longitude: 12.57 },
			placeName: "Copenhagen, Denmark", countryCode: "DK", weather, weatherFetchedAt },
		activityStart: null,
		manualUv,
		uvAck,
	};
}
