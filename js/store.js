import { SPFLevel, DEFAULT_SWEAT_LEVEL } from "./config.js";

const STORAGE_KEY = "sunburntimer-storage";

const state = {
	skinType: undefined,
	spfLevel: undefined,
	sweatLevel: undefined,
	geolocation: { status: "blank" },
	calculation: undefined,
};

const listeners = [];

function load() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw);
		if (saved.skinType) state.skinType = saved.skinType;
		if (saved.spfLevel) state.spfLevel = saved.spfLevel;
		if (saved.sweatLevel) state.sweatLevel = saved.sweatLevel;
		if (saved.geolocation && saved.geolocation.status === "completed" && saved.geolocation.position) {
			state.geolocation = {
				status: "completed",
				position: saved.geolocation.position,
				placeName: saved.geolocation.placeName,
				countryCode: saved.geolocation.countryCode,
			};
		}
	} catch (e) {
		console.warn("Failed to load saved state:", e);
	}
}

function persist() {
	const toSave = {
		skinType: state.skinType,
		spfLevel: state.spfLevel,
		sweatLevel: state.sweatLevel,
		geolocation:
			state.geolocation.status === "completed" && state.geolocation.position
				? { status: "completed", position: state.geolocation.position, placeName: state.geolocation.placeName, countryCode: state.geolocation.countryCode }
				: { status: "blank" },
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function notify() {
	for (const fn of listeners) fn(state);
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
	setGeolocationStatus(status) {
		update((s) => { s.geolocation = { ...s.geolocation, status, error: undefined }; });
	},
	setPosition(position, placeName, countryCode) {
		update((s) => { s.geolocation = { ...s.geolocation, position, placeName, countryCode, error: undefined }; });
	},
	setWeather(weather) {
		update((s) => { s.geolocation = { ...s.geolocation, weather, lastFetched: Date.now(), status: "completed" }; });
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
			s.calculation = undefined;
		});
	},
};

export function isReadyToCalculate() {
	const { skinType, spfLevel, sweatLevel, geolocation } = state;
	return !!(
		skinType &&
		spfLevel !== undefined &&
		(spfLevel === SPFLevel.NONE || sweatLevel) &&
		geolocation.status === "completed" &&
		geolocation.weather
	);
}

load();
