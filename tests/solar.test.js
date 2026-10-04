/* The sun's position, against values that can be checked without this code:
 * the noon elevation a latitude and a declination give by plain geometry, and
 * sunrise and sunset times published for a real place and day. */

import test from "node:test";
import assert from "node:assert/strict";

import { solarElevation, shadowRatio, sunTimes } from "../js/solar.js";

const LISBON = [38.7223, -9.1393];

test("the highest sun of a day is 90° minus the latitude plus the declination", () => {
	// 2026-07-14: declination about +21.6°, so Lisbon's noon sun is near 72.9°.
	let best = -90;
	for (let m = 0; m < 1440; m++) best = Math.max(best, solarElevation(Date.UTC(2026, 6, 14, 0, m), ...LISBON));
	assert.ok(Math.abs(best - 72.9) < 0.3, `peak ${best.toFixed(2)}°`);
});

test("at an equinox the sun stands overhead on the equator at noon", () => {
	assert.ok(solarElevation(Date.UTC(2026, 2, 20, 12, 7), 0, 0) > 89.5);
});

test("at night the sun is below the horizon", () => {
	assert.ok(solarElevation(Date.UTC(2026, 6, 14, 1, 0), ...LISBON) < -10);
});

test("sunrise and sunset land within two minutes of the published times", () => {
	// Lisbon, 2026-07-14: sunrise 06:24 and sunset 21:03 WEST (UTC+1).
	const day = Date.UTC(2026, 6, 13, 23, 0);
	const { sunrise, sunset } = sunTimes(day, day + 86400000, ...LISBON);
	assert.ok(Math.abs(sunrise - Date.UTC(2026, 6, 14, 5, 24)) < 120000, new Date(sunrise).toISOString());
	assert.ok(Math.abs(sunset - Date.UTC(2026, 6, 14, 20, 3)) < 120000, new Date(sunset).toISOString());
});

test("a polar day has no sunset to find", () => {
	const day = Date.UTC(2026, 5, 21, 0, 0);
	const { sunset } = sunTimes(day, day + 86400000, 78.2, 15.6); // Svalbard, midsummer
	assert.equal(sunset, null);
});

test("the shadow rule: at 45° your shadow is your height, lower it is longer", () => {
	assert.ok(Math.abs(shadowRatio(45) - 1) < 1e-9);
	assert.ok(shadowRatio(30) > 1.7);
	assert.ok(shadowRatio(70) < 0.4);
	assert.equal(shadowRatio(0), Infinity);
	assert.equal(shadowRatio(-5), Infinity);
});
