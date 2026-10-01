/* The hero's facts, from js/answer.js: which UV band (the hero's colour), the
 * moment the answer is for, the verdict a calculation becomes, and the slice
 * of the forecast the "UV through the day" chart draws. Pure functions, driven
 * through the real calculator where a result is needed. */

import test from "node:test";
import assert from "node:assert/strict";

import { uvBand, effectiveStart, summarizeAnswer, durationParts, shortDuration, skyPhase, dayWindow } from "../js/answer.js";
import { findOptimalTimeSlicing } from "../js/calculations.js";
import { resolveUvSource } from "../js/uv_source.js";
import { stateWith, weatherAt, forecast } from "./harness.js";

const HOUR = 3600000;
const NOW = Date.UTC(2026, 6, 15, 10, 0, 0);

test("UV bands follow the WHO scale, edges included", () => {
	assert.deepEqual([0, 2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11, 14].map((v) => uvBand(v).key),
		["low", "low", "moderate", "moderate", "high", "high", "very-high", "very-high", "extreme", "extreme"]);
	assert.equal(uvBand(undefined).key, "low");
	assert.equal(uvBand(NaN).key, "low");
});

test("the answer is for now unless a start is planned in the future", () => {
	const now = new Date(NOW);
	assert.equal(effectiveStart(null, now), now);
	assert.equal(effectiveStart("not a date", now), now);
	assert.equal(effectiveStart(new Date(NOW - HOUR).toISOString(), now), now, "a passed plan is now, never the past");
	assert.equal(effectiveStart(new Date(NOW + HOUR).toISOString(), now).getTime(), NOW + HOUR);
});

function calculate({ uvi = 8, spfLevel = "NONE", hours = 24 } = {}) {
	const weather = weatherAt(NOW, { uvi, hours });
	const state = { ...stateWith({ weather, weatherFetchedAt: NOW }), spfLevel };
	const source = resolveUvSource(state, new Date(NOW));
	return findOptimalTimeSlicing({ uvSource: source, timezone: "UTC", placeName: "x", currentTime: new Date(NOW),
		skinType: "II", spfLevel, sweatLevel: "LOW" });
}

test("a burn becomes a duration, a burn time and the same dose elsewhere", () => {
	const result = calculate({ uvi: 8 });
	const summary = summarizeAnswer(result, "UTC", false);
	assert.equal(summary.kind, "burn");
	assert.equal(summary.burnTime.getTime(), result.burnTime.getTime());
	assert.equal(summary.safeMs, result.burnTime.getTime() - result.startTime.getTime());
	assert.ok(summary.safeMs > 0);
	assert.equal(summary.highRisk, true, "a fast burn at midday is the high-risk case");
	for (const key of ["shade", "sand", "snow"]) assert.equal(typeof summary.envTimes[key], "string");
	assert.equal(summary.tip, result.advice[0]);
});

test("with sunscreen on, the hero's tip is not the reapply reminder the settings already show", () => {
	const result = calculate({ uvi: 8, spfLevel: "SPF_15" });
	assert.match(result.advice[0], /^Reapply/);
	const summary = summarizeAnswer(result, "UTC", true);
	assert.equal(summary.tip, result.advice[1] || null);
	assert.doesNotMatch(String(summary.tip), /^Reapply/);
});

test("no burn before the calculation stops is 'unlikely', with the dose it does reach", () => {
	const result = calculate({ uvi: 1, spfLevel: "SPF_50_PLUS" });
	const summary = summarizeAnswer(result, "UTC", true);
	assert.equal(summary.kind, "unlikely");
	assert.equal(summary.burnTime, null);
	assert.ok(summary.finalDamage >= 0 && summary.finalDamage < 100);
});

test("the big number is hours and minutes, never a decimal", () => {
	assert.deepEqual(durationParts(35 * 60000), [["35", "min"]]);
	assert.deepEqual(durationParts(HOUR), [["1", "hour"]]);
	assert.deepEqual(durationParts(2 * HOUR), [["2", "hours"]]);
	assert.deepEqual(durationParts(5 * HOUR + 9 * 60000), [["5", "h"], ["09", "m"]]);
	assert.deepEqual(durationParts(-5), [["0", "min"]]);
	assert.equal(shortDuration(3 * HOUR + 60000), "3h 1m");
	assert.equal(shortDuration(45 * 60000), "45m");
	assert.equal(shortDuration(3 * HOUR), "3h");
});

test("the sky phase follows the sun, and night is either side of it", () => {
	const rise = NOW, set = NOW + 14 * HOUR;
	assert.equal(skyPhase(rise - 1, rise, set), "night");
	assert.equal(skyPhase(rise + HOUR, rise, set), "dawn");
	assert.equal(skyPhase(rise + 7 * HOUR, rise, set), "midday");
	assert.equal(skyPhase(set - HOUR, rise, set), "dusk");
	assert.equal(skyPhase(set + 1, rise, set), "night");
	assert.equal(skyPhase(NOW, NaN, set), "midday", "no sun times is a neutral sky, not a guess");
});

test("the day window is the asked-about day's UV hours plus one either side", () => {
	const midnight = Date.UTC(2026, 6, 15, 0, 0, 0);
	const sunny = (i) => { const h = i % 24; return h >= 6 && h <= 19 ? 5 : 0; };
	const hourly = forecast(midnight, 72, sunny);
	const window = dayWindow(hourly, midnight + 26 * HOUR, "UTC");
	assert.equal(new Date(window[0].dt * 1000).getUTCDate(), 16, "the window is the day asked about");
	assert.equal(new Date(window[0].dt * 1000).getUTCHours(), 5);
	assert.equal(new Date(window.at(-1).dt * 1000).getUTCHours(), 20);
	assert.equal(window[0].uvi, 0);
	assert.equal(window.at(-1).uvi, 0);
	assert.equal(dayWindow(hourly.slice(0, 1), midnight, "UTC").length, 1, "too short to window is returned as is");
	const flat = forecast(midnight + 10 * HOUR, 13, 4);
	assert.equal(dayWindow(flat, midnight + 10 * HOUR, "UTC").length, 13, "a typed UV's flat series is kept whole");
});
