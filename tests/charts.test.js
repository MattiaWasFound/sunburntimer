/* The two pure pieces of the charts: the curve every chart draws and reads its
 * cursor off, and where the hour labels go. The drawing itself needs a canvas
 * and is reviewed by eye. */

import test from "node:test";
import assert from "node:assert/strict";

import { monotone, hourTicks } from "../js/charts.js";

test("the curve passes through every hourly value", () => {
	const xs = [0, 1, 2, 3, 4], ys = [0, 2, 6, 5, 0];
	const f = monotone(xs, ys);
	xs.forEach((x, i) => assert.ok(Math.abs(f(x) - ys[i]) < 1e-9));
});

test("the curve never shows a UV the forecast did not give: no dip below zero, no bulge over the peak", () => {
	const xs = [0, 1, 2, 3, 4, 5, 6], ys = [0, 0, 1, 9.1, 9.1, 0.4, 0];
	const f = monotone(xs, ys);
	for (let x = 0; x <= 6; x += 0.01) {
		const v = f(x);
		assert.ok(v >= -1e-9, `dips to ${v} at ${x}`);
		assert.ok(v <= 9.1 + 1e-9, `bulges to ${v} at ${x}`);
	}
});

test("between two equal hours the curve stays flat", () => {
	const f = monotone([0, 1, 2, 3], [1, 4, 4, 1]);
	for (let x = 1; x <= 2; x += 0.05) assert.ok(Math.abs(f(x) - 4) < 1e-9);
});

test("hour labels land on whole hours and stay far enough apart to read", () => {
	const H = 3600000;
	const t0 = 6 * H + 1800000, t1 = 21 * H;
	const ticks = hourTicks(t0, t1, 600, 64);
	assert.ok(ticks.every((t) => t % H === 0));
	const px = ((ticks[1] - ticks[0]) / (t1 - t0)) * 600;
	assert.ok(px >= 64, `ticks ${px}px apart`);
	assert.ok(hourTicks(t0, t1, 1600, 64).length > ticks.length, "a wider chart gets more labels");
});

import { doseScale, spreadLabels } from "../js/charts.js";

test("the dose axis runs to 100% once a burn is near, and hugs a small dose otherwise", () => {
	assert.deepEqual(doseScale(100), { top: 100, burnShown: true });
	assert.deepEqual(doseScale(64), { top: 100, burnShown: true });
	assert.deepEqual(doseScale(41), { top: 100, burnShown: true }, "close to a burn, the burn line is on the chart");
	assert.deepEqual(doseScale(2), { top: 4, burnShown: false });
	for (const peak of [0, 0.03, 0.4, 1.9, 7, 13, 33, 49, 59]) {
		const { top, burnShown } = doseScale(peak);
		assert.ok(top >= peak * 1.2 || top === 100, `${peak}% under a top of ${top}%`);
		assert.ok(top <= Math.max(1, peak * 3), `${peak}% lost under a top of ${top}%`);
		assert.equal(burnShown, top === 100);
	}
	assert.equal(doseScale(NaN).top, 1);
});

test("every scaled top splits into four readable gridline steps", () => {
	for (let peak = 0; peak < 60; peak += 0.25) {
		const step = doseScale(peak).top / 4;
		assert.ok(Number.isInteger(step * 4) && Number.isInteger(step * 100), `step ${step}`);
	}
});

test("labels that end at the same height are moved apart, in order, inside the chart", () => {
	const ys = spreadLabels([100, 100, 100, 100], 11, 20, 120);
	const sorted = ys.slice().sort((a, b) => a - b);
	for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 11 - 1e-9);
	assert.ok(Math.max(...ys) <= 120 && Math.min(...ys) >= 20);
	assert.deepEqual(spreadLabels([30, 80], 11, 0, 200), [30, 80], "labels already apart stay put");
	const crowded = spreadLabels([118, 119, 120], 11, 0, 120);
	assert.ok(crowded[2] <= 120 && crowded[0] < crowded[1] && crowded[1] < crowded[2], "pushed up from the floor, order kept");
});
