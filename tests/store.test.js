/* What survives a reload, and what a reload must never resurrect.
 *
 * The store is the other half of the honest-staleness rule. uv_source.js can
 * only judge a reading's age if the reading was stored WITH the moment it
 * arrived, and the app can only work offline if it was stored at all — before
 * this pass neither was true: the forecast lived in memory and vanished on
 * reload, which is why an offline launch used to be a blank app rather than a
 * stale one.
 *
 * Driven through the real js/store.js on a memory-backed localStorage; the
 * assertions read the JSON that actually reached storage, not the in-memory
 * state, because that string is what the next launch will see.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveUvSource } from "../js/uv_source.js";
import { freshStore, weatherAt } from "./harness.js";

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

test("a fetched forecast is persisted, and never without the time it arrived", () => {
	// The pair is the invariant. A stored forecast whose age is unknown cannot
	// be judged, and everything in uv_source.js is a judgement about age.
	return freshStore().then(({ actions, saved, getState }) => {
		actions.setWeather(weatherAt(NOW));
		const disk = saved();
		assert.ok(disk.geolocation.weather, "the forecast did not reach storage");
		assert.equal(typeof disk.geolocation.weatherFetchedAt, "number");
		assert.ok(Math.abs(disk.geolocation.weatherFetchedAt - Date.now()) < 5000);
		assert.equal(getState().geolocation.status, "completed");
	});
});

test("a stored forecast comes back on the next launch, with its age intact", async () => {
	const readAt = Date.now() - 30 * 60_000;
	const { getState } = await freshStore({
		skinType: "II", spfLevel: "NONE", sweatLevel: "LOW", activityStart: null,
		geolocation: { status: "completed", position: { latitude: 55.68, longitude: 12.57 },
			placeName: "Copenhagen, Denmark", countryCode: "DK",
			weather: weatherAt(Date.now()), weatherFetchedAt: readAt },
	});
	const source = resolveUvSource(getState(), new Date());
	assert.equal(source.mode, "live");
	assert.equal(source.readAt, readAt);
});

test("a forecast stored without a timestamp is dropped, not trusted", async () => {
	// An untimed reading is exactly the thing this app refuses to have: it
	// would be indistinguishable from a live one. Older versions of this app
	// wrote no timestamp, so this is a real migration path, not a hypothetical.
	const { getState } = await freshStore({
		skinType: "II",
		geolocation: { status: "completed", position: { latitude: 55.68, longitude: 12.57 },
			placeName: "Copenhagen, Denmark", countryCode: "DK", weather: weatherAt(Date.now()) },
	});
	assert.equal(getState().geolocation.weather, undefined);
	assert.equal(resolveUvSource(getState(), new Date()).mode, "none");
});

test("a half-shaped stored forecast is dropped rather than handed to the calculator", async () => {
	// localStorage is user-writable and keyed per origin. Undefined UV values
	// would reach the damage loop as NaN and come out as a confident number.
	const { getState } = await freshStore({
		skinType: "II",
		geolocation: { status: "completed", position: { latitude: 55.68, longitude: 12.57 },
			placeName: "x", countryCode: "DK", weatherFetchedAt: Date.now(),
			weather: { hourly: [], current: {} } },
	});
	assert.equal(getState().geolocation.weather, undefined);
});

test("a fresh fetch retires both overrides", async () => {
	// An acknowledgement of the reading being replaced is meaningless, and a
	// number typed because the app had nothing is no longer what the app has.
	const { actions, getState } = await freshStore();
	actions.setManualUv(7);
	actions.setWeather(weatherAt(NOW));
	actions.acknowledgeStaleUv();
	assert.ok(getState().uvAck, "acknowledge should have taken");
	actions.setWeather(weatherAt(NOW));
	assert.equal(getState().manualUv, null);
	assert.equal(getState().uvAck, null);
});

test("moving the pin throws the old place's forecast away", async () => {
	// No freshness rule can catch this one: Copenhagen's UV attached to a
	// Lisbon pin is not old, it is somewhere else.
	const { actions, getState, saved } = await freshStore();
	actions.setWeather(weatherAt(NOW));
	actions.setPosition({ latitude: 38.72, longitude: -9.14 }, "Lisbon, Portugal", "PT");
	assert.equal(getState().geolocation.weather, undefined);
	assert.equal(getState().geolocation.weatherFetchedAt, undefined);
	assert.equal(saved().geolocation.weather, undefined);
	assert.equal(resolveUvSource(getState(), new Date()).mode, "none");
});

test("an acknowledgement is bound to the exact reading it was given for", async () => {
	const { actions, getState } = await freshStore();
	actions.setWeather(weatherAt(NOW));
	actions.acknowledgeStaleUv();
	assert.equal(getState().uvAck.forReadAt, getState().geolocation.weatherFetchedAt);
	assert.ok(Math.abs(getState().uvAck.at - Date.now()) < 5000);
});

test("acknowledging with nothing to acknowledge is a no-op, not a null reading", async () => {
	const { actions, getState } = await freshStore();
	actions.acknowledgeStaleUv();
	assert.equal(getState().uvAck, null);
});

test("a typed UV index survives a reload with the moment it was typed", async () => {
	const { actions, saved } = await freshStore();
	actions.setManualUv(6.5);
	assert.equal(saved().manualUv.uvIndex, 6.5);
	assert.ok(Math.abs(saved().manualUv.enteredAt - Date.now()) < 5000);

	const { getState } = await freshStore(saved());
	const source = resolveUvSource(getState(), new Date());
	assert.equal(source.mode, "manual");
	assert.equal(source.currentUvi, 6.5);
});

test("the results area stays shut until there is some UV number to talk about", async () => {
	// isReadyToCalculate gates whether the results area renders AT ALL, and the
	// refusal has to be shown inside it — so it asks whether the user's own
	// inputs are complete and the app has a number, never whether that number
	// may be used. That second question has its own module.
	const { actions, isReadyToCalculate } = await freshStore();
	actions.setSkinType("II");
	actions.setSPFLevel("NONE");
	assert.equal(isReadyToCalculate(), false, "no reading, no results area");
	actions.setManualUv(7);
	assert.equal(isReadyToCalculate(), true, "a typed index alone is enough to render a result");
});

test("a storage write that fails does not take the app down", async () => {
	// Private browsing and a full quota both throw from setItem. The in-memory
	// state is still correct; only the offline copy is missing.
	const { actions, getState } = await freshStore();
	localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
	actions.setSkinType("V");
	assert.equal(getState().skinType, "V");
});
