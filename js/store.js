import { SPFLevel, DEFAULT_SWEAT_LEVEL, FitzpatrickType } from "./config.js";

const STORAGE_KEY = "sunburntimer-storage";

/* A first visit gets an answer with zero input, so every input has a default.
 * Sunscreen defaults to NONE because it is the conservative one: the shortest
 * burn time, never a longer one than the visitor actually has. */
const DEFAULT_SKIN_TYPE = FitzpatrickType.II;
const DEFAULT_SPF_LEVEL = SPFLevel.NONE;
const UNITS = ["celsius", "fahrenheit"];
const DEFAULT_LOCATION = {
	status: "completed",
	position: { latitude: 55.6761, longitude: 12.5683 },
	placeName: "Copenhagen, Denmark",
	countryCode: "DK",
};

const state = {
	skinType: undefined,
	spfLevel: undefined,
	sweatLevel: undefined,
	geolocation: { status: "blank" },
	activityStart: null,
	calculation: undefined,
	manualUv: null,
	uvAck: null,
	// null follows the place's country (°F in the US); a choice is remembered.
	units: null,
};

const listeners = [];

/* The last weather response is persisted, and that is what makes this app work
 * with no network — the service worker can only bring back the shell, and a
 * shell with nothing to calculate from is a blank screen with an app icon.
 *
 * It is persisted WITH the wall-clock time it arrived (`weatherFetchedAt`) and
 * never without: a stored forecast whose age is unknown cannot be judged, and
 * everything in uv_source.js is a judgement about age. The two are written in
 * the same action for the same reason, and nothing else in this file sets
 * either one.
 *
 * A shape check rather than blind trust: this comes back from localStorage,
 * which is user-writable, survives across versions of this app, and is keyed
 * per origin — the scratch channels have hosted other apps. A half-shaped
 * forecast would reach calculations.js as undefined UV values. */
function usableWeather(weather) {
	return !!(weather && Array.isArray(weather.hourly) && weather.hourly.length >= 2 &&
		weather.current && typeof weather.current.uvi === "number");
}

function applyDefaults() {
	if (!state.skinType) state.skinType = DEFAULT_SKIN_TYPE;
	if (!state.spfLevel) state.spfLevel = DEFAULT_SPF_LEVEL;
	if (!state.sweatLevel) state.sweatLevel = DEFAULT_SWEAT_LEVEL;
}

function load() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			state.geolocation = { ...DEFAULT_LOCATION };
			applyDefaults();
			return;
		}
		const saved = JSON.parse(raw);
		state.skinType = saved.skinType || DEFAULT_SKIN_TYPE;
		if (saved.spfLevel) state.spfLevel = saved.spfLevel;
		if (saved.sweatLevel) state.sweatLevel = saved.sweatLevel;
		if (UNITS.includes(saved.units)) state.units = saved.units;
		// A start time is a plan for one outing, not a default: one that has
		// already passed is dropped, or yesterday's "14:00" comes back as a
		// start in the past and the answer is for a moment that is over.
		const start = saved.activityStart ? new Date(saved.activityStart).getTime() : NaN;
		if (!Number.isNaN(start) && start > Date.now()) state.activityStart = saved.activityStart;
		if (saved.manualUv && typeof saved.manualUv.uvIndex === "number" && typeof saved.manualUv.enteredAt === "number") state.manualUv = saved.manualUv;
		if (saved.uvAck && typeof saved.uvAck.forReadAt === "number" && typeof saved.uvAck.at === "number") state.uvAck = saved.uvAck;
		if (saved.geolocation && saved.geolocation.status === "completed" && saved.geolocation.position) {
			state.geolocation = {
				status: "completed",
				position: saved.geolocation.position,
				placeName: saved.geolocation.placeName,
				countryCode: saved.geolocation.countryCode,
			};
			if (usableWeather(saved.geolocation.weather) && typeof saved.geolocation.weatherFetchedAt === "number") {
				state.geolocation.weather = saved.geolocation.weather;
				state.geolocation.weatherFetchedAt = saved.geolocation.weatherFetchedAt;
			}
		} else {
			state.geolocation = { ...DEFAULT_LOCATION };
		}
		applyDefaults();
	} catch (e) {
		console.warn("Failed to load saved state:", e);
		state.skinType = DEFAULT_SKIN_TYPE;
		state.geolocation = { ...DEFAULT_LOCATION };
		applyDefaults();
	}
}

function persist() {
	const toSave = {
		skinType: state.skinType,
		spfLevel: state.spfLevel,
		sweatLevel: state.sweatLevel,
		activityStart: state.activityStart,
		manualUv: state.manualUv,
		uvAck: state.uvAck,
		units: state.units,
		geolocation:
			state.geolocation.status === "completed" && state.geolocation.position
				? {
					status: "completed",
					position: state.geolocation.position,
					placeName: state.geolocation.placeName,
					countryCode: state.geolocation.countryCode,
					weather: state.geolocation.weather,
					weatherFetchedAt: state.geolocation.weatherFetchedAt,
				}
				: { status: "blank" },
	};
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
	} catch (e) {
		// A full or blocked quota must not take the app down: the in-memory
		// state is still correct, only the offline copy is missing.
		console.warn("Failed to persist state:", e);
	}
}

function notify() {
	// A subscriber's failure is the subscriber's, not the action's. render() is
	// a subscriber and it runs SYNCHRONOUSLY inside every action, so a throw in
	// there used to unwind all the way back out through the action to whoever
	// called it — and the callers are async fetches ending in
	// `.catch((err) => actions.setGeolocationError(err.message))`.
	//
	// That once relabelled a rendering failure as a data failure: a browser
	// holding one stale ES module threw out of the calculator during the render
	// inside `setWeather`, the weather fetch's own catch caught it, and the page
	// showed "Error / refusing to calculate from a missing UV source" as a
	// LOCATION error — location card gone, results gone, and
	// the one thing the message was not about was the location. A store must
	// not be able to attribute a render's exception to the data that triggered
	// it; the console is where a broken subscriber gets reported.
	for (const fn of listeners) {
		try {
			fn(state);
		} catch (error) {
			console.error("A store subscriber failed:", error);
		}
	}
}

export function getState() {
	return state;
}

export function subscribe(fn) {
	listeners.push(fn);
	return () => {
		const i = listeners.indexOf(fn);
		if (i >= 0) listeners.splice(i, 1);
	};
}

function update(updater) {
	updater(state);
	persist();
	notify();
}

export const actions = {
	setSkinType(skinType) {
		update((s) => { s.skinType = skinType; });
	},
	setSPFLevel(spfLevel) {
		update((s) => {
			s.spfLevel = spfLevel;
			if (spfLevel !== SPFLevel.NONE && !s.sweatLevel) s.sweatLevel = DEFAULT_SWEAT_LEVEL;
		});
	},
	setSweatLevel(sweatLevel) {
		update((s) => { s.sweatLevel = sweatLevel; });
	},
	setActivityStart(activityStart) {
		update((s) => { s.activityStart = activityStart; });
	},
	setUnits(units) {
		update((s) => { s.units = UNITS.includes(units) ? units : null; });
	},
	setGeolocationStatus(status) {
		update((s) => { s.geolocation = { ...s.geolocation, status, error: undefined }; });
	},
	setPosition(position, placeName, countryCode) {
		// A new place invalidates the old place's forecast outright — keeping it
		// would leave Copenhagen's UV attached to a Lisbon pin, which no
		// freshness rule can catch because the reading is not old, it is
		// somewhere else.
		update((s) => {
			s.geolocation = { ...s.geolocation, position, placeName, countryCode, error: undefined,
				weather: undefined, weatherFetchedAt: undefined };
			s.uvAck = null;
		});
	},
	setWeather(weather) {
		// The fetch timestamp is written here and nowhere else, and a fresh
		// fetch retires both overrides: an acknowledgement of the reading it
		// replaces is meaningless, and a hand-typed number the user entered
		// because the app had nothing is no longer what the app has.
		update((s) => {
			s.geolocation = { ...s.geolocation, weather, weatherFetchedAt: Date.now(), status: "completed" };
			s.manualUv = null;
			s.uvAck = null;
		});
	},
	setManualUv(uvIndex) {
		update((s) => { s.manualUv = { uvIndex, enteredAt: Date.now() }; s.uvAck = null; });
	},
	clearManualUv() {
		update((s) => { s.manualUv = null; });
	},
	acknowledgeStaleUv() {
		// Bound to the exact reading it was given for, and stamped with when it
		// was given: a new fetch changes `weatherFetchedAt` and orphans this,
		// and an hour from now uv_source.js stops honouring it and asks again.
		update((s) => {
			if (!s.geolocation.weatherFetchedAt) return;
			s.uvAck = { forReadAt: s.geolocation.weatherFetchedAt, at: Date.now() };
			s.manualUv = null;
		});
	},
	setGeolocationError(error) {
		update((s) => { s.geolocation = { ...s.geolocation, status: "error", error }; });
	},
	setCalculation(calculation) {
		update((s) => { s.calculation = calculation; });
	},
	clearCalculation() {
		update((s) => { s.calculation = undefined; });
	},
	reset() {
		update((s) => {
			s.skinType = undefined;
			s.spfLevel = undefined;
			s.sweatLevel = undefined;
			s.geolocation = { status: "blank" };
			s.activityStart = null;
			s.calculation = undefined;
			s.manualUv = null;
			s.uvAck = null;
		});
	},
};

/* The user's own inputs are complete and there is at least one UV number in
 * the app. Whether that number may be USED is a separate question with its own
 * module (uv_source.js): this one gates whether the results area renders at
 * all, and the results area is where a refusal has to be shown. */
export function isReadyToCalculate() {
	const { skinType, spfLevel, sweatLevel, geolocation, manualUv } = state;
	return !!(
		skinType &&
		spfLevel !== undefined &&
		(spfLevel === SPFLevel.NONE || sweatLevel) &&
		// A refresh of the same place keeps its reading on screen while the new
		// one loads (a new place clears `weather` in setPosition, so this is
		// never another place's forecast); uv_source.js still judges its age.
		(geolocation.status === "completed" || (geolocation.status === "fetching_weather" && geolocation.weather)) &&
		(geolocation.weather || manualUv)
	);
}

load();
