/* The honest-staleness rule, asserted against the real modules.
 *
 * This is the suite that matters. Everything else this app does is arithmetic
 * on numbers somebody else measured; this is the one place it can lie to a
 * person standing in the sun, by answering a question about right now with a
 * number from three hours ago in exactly the same confident voice.
 *
 * The interesting failure is therefore NOT "the calculator is wrong". It is
 * "the calculator answered when it should have refused" — so most of what
 * follows drives the refusal, and the last group proves the refusal cannot be
 * walked around by calling the calculator directly.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
	UV_FRESH_MS, MANUAL_HORIZON_HOURS, resolveUvSource, forecastCovers,
	sourceLabel, sourceBadge, refusalCopy, CALCULATION_FAILED,
} from "../js/uv_source.js";
import { findOptimalTimeSlicing } from "../js/calculations.js";
import { weatherAt, stateWith } from "./harness.js";

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);      // a summer noon, UTC
const now = () => new Date(NOW);

function calcInput(source, extra = {}) {
	return {
		uvSource: source,
		timezone: source?.timezone,
		currentTime: now(),
		skinType: "II",
		spfLevel: "NONE",
		sweatLevel: "LOW",
		...extra,
	};
}

// --- fresh ------------------------------------------------------------------

test("a reading fetched just now is live and usable", () => {
	const state = stateWith({ weather: weatherAt(NOW), weatherFetchedAt: NOW - 60_000 });
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "live");
	assert.equal(source.usable, true);
	assert.equal(source.readAt, NOW - 60_000);
});

test("the freshness window is the hourly step of the data itself", () => {
	// Not a round number chosen for taste: the UV index this app consumes is an
	// hourly forecast, so an hour is the resolution below which a window would
	// refuse readings that are still the best answer in existence.
	assert.equal(UV_FRESH_MS, 60 * 60 * 1000);
});

test("a reading one second inside the window is still live, one second outside is not", () => {
	const weather = weatherAt(NOW);
	const inside = resolveUvSource(stateWith({ weather, weatherFetchedAt: NOW - UV_FRESH_MS + 1000 }), now());
	const outside = resolveUvSource(stateWith({ weather, weatherFetchedAt: NOW - UV_FRESH_MS - 1000 }), now());
	assert.equal(inside.mode, "live");
	assert.equal(outside.mode, "stale");
});

// --- stale ------------------------------------------------------------------

test("a reading past the window is refused, not silently used", () => {
	const state = stateWith({ weather: weatherAt(NOW), weatherFetchedAt: NOW - 3 * 3600_000 });
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "stale");
	assert.equal(source.usable, false);
	assert.equal(source.canAcknowledge, true);
});

test("the refusal names the hour the reading was taken, and offers both ways out", () => {
	const state = stateWith({ weather: weatherAt(NOW), weatherFetchedAt: NOW - 3 * 3600_000 });
	const copy = refusalCopy(resolveUvSource(state, now()));
	assert.equal(copy.title, "This UV reading has expired");
	assert.match(copy.body, /read at 9:00 AM/);
	assert.match(copy.body, /hourly forecast/);
	assert.equal(copy.acknowledgeLabel, "Use the reading from 9:00 AM");
});

test("acknowledging a stale reading makes it usable and keeps it marked", () => {
	const weather = weatherAt(NOW);
	const readAt = NOW - 3 * 3600_000;
	const state = stateWith({ weather, weatherFetchedAt: readAt,
		uvAck: { forReadAt: readAt, at: NOW - 60_000 } });
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "acknowledged");
	assert.equal(source.usable, true);
	assert.equal(sourceBadge(source), "Stale reading");
	assert.match(sourceLabel(source), /^Stale UV · read at 9:00 AM, 3 hours ago$/);
});

test("an acknowledgement of a DIFFERENT reading does not carry over", () => {
	// A refresh changes weatherFetchedAt; the old consent must not silently
	// apply to whatever the app fetched next.
	const weather = weatherAt(NOW);
	const state = stateWith({ weather, weatherFetchedAt: NOW - 3 * 3600_000,
		uvAck: { forReadAt: NOW - 9 * 3600_000, at: NOW - 60_000 } });
	assert.equal(resolveUvSource(state, now()).mode, "stale");
});

test("an acknowledgement expires on the same clock as the reading", () => {
	// Otherwise one tap would be a permanent opt-out of this whole module: an
	// app left open all afternoon would keep computing from a morning reading.
	const weather = weatherAt(NOW);
	const readAt = NOW - 3 * 3600_000;
	const state = stateWith({ weather, weatherFetchedAt: readAt,
		uvAck: { forReadAt: readAt, at: NOW - UV_FRESH_MS - 1000 } });
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "stale");
	assert.equal(source.usable, false);
});

// --- ran out ----------------------------------------------------------------

test("a forecast that no longer reaches the moment asked about cannot be acknowledged at all", () => {
	// Zero usable slices renders as "Sunburn unlikely" — the most dangerous
	// wrong answer this app can give, and a silent one. Consent to an old
	// reading is not consent to extrapolate past the end of one.
	const weather = weatherAt(NOW - 48 * 3600_000, { hours: 12 });
	const readAt = NOW - 48 * 3600_000;
	const state = stateWith({ weather, weatherFetchedAt: readAt,
		uvAck: { forReadAt: readAt, at: NOW - 60_000 } });
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "expired");
	assert.equal(source.usable, false);
	assert.equal(source.canAcknowledge, false);
	assert.equal(refusalCopy(source).acknowledgeLabel, null);
	assert.equal(refusalCopy(source).title, "This forecast has run out");
});

test("coverage is judged against the CHOSEN start time, not against now", () => {
	// A start time eight hours out is a live calculation if the reading is
	// fresh and the forecast reaches that far — and a refusal if it does not.
	const weather = weatherAt(NOW, { hours: 6 });
	const state = stateWith({ weather, weatherFetchedAt: NOW - 60_000 });
	assert.equal(resolveUvSource(state, now(), now()).mode, "live");
	assert.equal(resolveUvSource(state, now(), new Date(NOW + 8 * 3600_000)).mode, "expired");
});

test("forecastCovers refuses a series too short to interpolate", () => {
	assert.equal(forecastCovers([], NOW), false);
	assert.equal(forecastCovers([{ dt: (NOW + 3600_000) / 1000, uvi: 5 }], NOW), false);
	assert.equal(forecastCovers(undefined, NOW), false);
});

test("no reading at all is its own refusal", () => {
	const source = resolveUvSource(stateWith({}), now());
	assert.equal(source.mode, "none");
	assert.equal(source.usable, false);
	assert.equal(refusalCopy(source).title, "No UV reading yet");
});

// --- a number the user typed ------------------------------------------------

test("a hand-typed UV index is usable, flat, and labelled as the user's own", () => {
	const state = stateWith({ manualUv: { uvIndex: 8, enteredAt: NOW - 60_000 } });
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "manual");
	assert.equal(source.usable, true);
	assert.equal(source.currentUvi, 8);
	assert.equal(sourceBadge(source), "Manual UV");
	assert.equal(source.hourly.length, MANUAL_HORIZON_HOURS + 1);
	assert.ok(source.hourly.every((h) => h.uvi === 8));
});

test("a hand-typed index goes stale on the same clock as a fetched one", () => {
	const state = stateWith({ manualUv: { uvIndex: 8, enteredAt: NOW - UV_FRESH_MS - 1000 } });
	assert.equal(resolveUvSource(state, now()).usable, false);
});

test("a typed index that has aged out falls back to judging the forecast underneath it", () => {
	// It must not mask the stored reading: the point of ageing it out is to put
	// the "use the reading from <time>" offer back on screen.
	const state = stateWith({
		weather: weatherAt(NOW), weatherFetchedAt: NOW - 3 * 3600_000,
		manualUv: { uvIndex: 8, enteredAt: NOW - UV_FRESH_MS - 1000 },
	});
	const source = resolveUvSource(state, now());
	assert.equal(source.mode, "stale");
	assert.equal(source.canAcknowledge, true);
});

test("a typed index wins over a live forecast while it is fresh", () => {
	// The user overrode the app on purpose; until it ages out, that stands.
	const state = stateWith({
		weather: weatherAt(NOW), weatherFetchedAt: NOW - 60_000,
		manualUv: { uvIndex: 3, enteredAt: NOW - 60_000 },
	});
	assert.equal(resolveUvSource(state, now()).mode, "manual");
});

// --- the calculator will not be talked round --------------------------------

test("the calculator refuses every unusable source rather than trusting its caller", () => {
	const weather = weatherAt(NOW);
	for (const [label, state] of [
		["stale", stateWith({ weather, weatherFetchedAt: NOW - 3 * 3600_000 })],
		["expired", stateWith({ weather: weatherAt(NOW - 48 * 3600_000, { hours: 12 }),
			weatherFetchedAt: NOW - 48 * 3600_000 })],
		["none", stateWith({})],
	]) {
		const source = resolveUvSource(state, now());
		assert.throws(() => findOptimalTimeSlicing(calcInput(source)),
			/refusing to calculate/, `${label} was calculated from`);
	}
	assert.throws(() => findOptimalTimeSlicing(calcInput(undefined)), /refusing to calculate/);
});

test("a live source calculates, and the result carries its provenance", () => {
	const state = stateWith({ weather: weatherAt(NOW, { uvi: 9 }), weatherFetchedAt: NOW - 60_000 });
	const result = findOptimalTimeSlicing(calcInput(resolveUvSource(state, now())));
	assert.equal(result.sourceMode, "live");
	assert.equal(result.readAt, NOW - 60_000);
	assert.ok(result.points.length > 0, "a live forecast should produce a curve");
	assert.ok(result.burnTime instanceof Date, "UV 9 with no sunscreen should reach the threshold");
});

test("a result computed from an acknowledged reading says so, so nothing downstream can lose it", () => {
	// The marker travels WITH the numbers. A chart or a running timer handed
	// this object cannot render it without also having the provenance.
	const readAt = NOW - 3 * 3600_000;
	const state = stateWith({ weather: weatherAt(NOW, { uvi: 9 }), weatherFetchedAt: readAt,
		uvAck: { forReadAt: readAt, at: NOW - 60_000 } });
	const result = findOptimalTimeSlicing(calcInput(resolveUvSource(state, now())));
	assert.equal(result.sourceMode, "acknowledged");
	assert.equal(result.readAt, readAt);
});

test("a hand-typed index produces a real curve, not an empty one", () => {
	// The flat series has to be usable by createSlices from the current time:
	// an off-by-one on the horizon would yield zero slices and read as
	// "Sunburn unlikely" — the same silent failure as an expired forecast.
	const state = stateWith({ manualUv: { uvIndex: 11, enteredAt: NOW - 60_000 } });
	const result = findOptimalTimeSlicing(calcInput(resolveUvSource(state, now())));
	assert.ok(result.points.length > 0);
	assert.equal(result.sourceMode, "manual");
	assert.ok(result.burnTime instanceof Date, "UV 11 with no sunscreen must reach the threshold");
});

// --- the words --------------------------------------------------------------

test("a live reading is never described with a word that could mean stale", () => {
	const state = stateWith({ weather: weatherAt(NOW), weatherFetchedAt: NOW });
	const source = resolveUvSource(state, now());
	assert.equal(sourceLabel(source), "Live UV · read at 12:00 PM");
	assert.equal(sourceBadge(source), null);
});

test("every way the results area can refuse has words written for it", () => {
	// refusalCopy is TOTAL, and that is the guarantee behind "the user never
	// reads an exception": the results area has one refusal path, and it cannot
	// be handed a state this function has no answer for. The last three entries
	// are the ones that used to fall through to the stale branch and format a
	// time from a reading that was not there.
	const weather = weatherAt(NOW);
	const sources = [
		resolveUvSource(stateWith({}), now()),
		resolveUvSource(stateWith({ weather, weatherFetchedAt: NOW - 3 * 3600_000 }), now()),
		resolveUvSource(stateWith({ weather: weatherAt(NOW - 48 * 3600_000, { hours: 12 }),
			weatherFetchedAt: NOW - 48 * 3600_000 }), now()),
		resolveUvSource(stateWith({ weather, weatherFetchedAt: NOW - 60_000 }), now()),
		{ mode: "a-mode-a-later-pass-invented", usable: false },
		null,
	];
	for (const source of sources) {
		const copy = refusalCopy(source);
		const label = source ? source.mode : "no source at all";
		assert.ok(copy?.title && copy?.body, `${label} has no refusal copy`);
		for (const line of [copy.title, copy.body]) {
			assert.doesNotMatch(line, /undefined|NaN|Invalid Date|\[object/, label);
			assert.doesNotMatch(line, /refusing to calculate/, `${label} shows the internal assertion`);
		}
	}
});

test("the calculator's assertion stays in the console, and the user gets a card", () => {
	// findOptimalTimeSlicing throws for a caller that skipped the check, and
	// that must stay true — it is the last line of the honesty rule. What
	// changed is where the sentence lands: a browser running one stale ES module
	// beside seven fresh ones once tripped this exact branch, and the message
	// itself was what a person outside read.
	let thrown;
	try { findOptimalTimeSlicing(calcInput(undefined)); } catch (error) { thrown = error; }
	assert.match(thrown.message, /refusing to calculate from a missing UV source/);

	const copy = refusalCopy(null);
	assert.equal(copy, CALCULATION_FAILED);
	assert.ok(!copy.body.includes(thrown.message));
	// A broken build has no way out through the UV: a typed index goes through
	// the same calculator and lands right back here.
	assert.equal(copy.acknowledgeLabel, null);
	assert.equal(copy.reloadOnly, true);
});

test("every provenance a user can see states the time the number was read", () => {
	// The contract for the whole feature, in one assertion: no matter which way
	// the app got its UV, the strip says when.
	const readAt = NOW - 3 * 3600_000;
	const sources = [
		resolveUvSource(stateWith({ weather: weatherAt(NOW), weatherFetchedAt: NOW - 60_000 }), now()),
		resolveUvSource(stateWith({ weather: weatherAt(NOW), weatherFetchedAt: readAt,
			uvAck: { forReadAt: readAt, at: NOW - 60_000 } }), now()),
		resolveUvSource(stateWith({ manualUv: { uvIndex: 8, enteredAt: readAt + 2 * 3600_000 } }), now()),
	];
	for (const source of sources) {
		assert.match(sourceLabel(source), /\d{1,2}:\d{2} (AM|PM)/, source.mode);
	}
});
