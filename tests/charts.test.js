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
