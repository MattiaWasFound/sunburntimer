/* Where the UV number comes from, and whether it is still true.
 *
 * THE ONE RULE THIS MODULE EXISTS FOR: nothing in this app may compute a burn
 * time from a UV number that was not fetched, typed, or explicitly
 * acknowledged within the last UV_FRESH_MS. A sunburn calculator that quietly
 * uses yesterday's UV is worse than one that refuses, because it answers in
 * the same confident voice either way and the user is outside, not reading a
 * console.
 *
 * That matters here in a way it did not before the service worker: the app
 * shell now opens with no network at all, so "the page loaded" no longer
 * implies "the data is live". Every path out of this module therefore carries
 * its own provenance, and `findOptimalTimeSlicing` refuses a source whose
 * `usable` is false rather than trusting its caller to have checked.
 *
 * The three provenances, and nothing else:
 *   forecast      Open-Meteo's hourly series, stored with the wall-clock time
 *                 it was fetched at (store.js persists both).
 *   acknowledged  the same series, past its window, after the user answered
 *                 "use the reading from <time>" — the acknowledgement is itself
 *                 timestamped and ages out on the same clock.
 *   manual        a UV index the user read off a weather app or a sign and
 *                 typed in, held flat for MANUAL_HORIZON_HOURS.
 */

import { formatInTimeZone, formatAge } from "./utils.js";

/* How long a UV number describes "now".
 *
 * Open-Meteo's UV index is an HOURLY forecast: one value per clock hour, and
 * `current.uv_index` is that hour's value, not a live radiometer reading. So a
 * number stops describing the sun outside at the next hour boundary at the
 * latest — one hour is the resolution of the underlying data, and a window
 * shorter than the data's own step would only ever refuse readings that are
 * still the best answer that exists. It is also roughly the timescale over
 * which the UV index actually moves near solar noon (a unit or two per hour at
 * mid latitudes in summer), so an hour-old number is wrong by about the width
 * of a UV band.
 *
 * The same window governs a typed number and an acknowledgement, deliberately:
 * "the UV is 7" said an hour ago is exactly as stale as a forecast fetched an
 * hour ago, and an acknowledgement that never expired would be a permanent
 * opt-out of this whole module. */
export const UV_FRESH_MS = 60 * 60 * 1000;

/* A typed UV index is a single number with no shape over time, so it is held
 * flat. Twelve hours is past any real exposure session and past the evening
 * cutoff in calculations.js from any daytime start, which means the horizon
 * never becomes the thing that ends the calculation — the damage threshold or
 * the evening does. It is not a forecast and the UI never calls it one. */
export const MANUAL_HORIZON_HOURS = 12;

export const UV_SOURCE_MODES = ["live", "acknowledged", "manual", "stale", "expired", "none"];

/* Does this hourly series still say anything about `atMs`?
 *
 * calculations.js walks pairs of hourly points and skips every slice that ends
 * before the start time, so a series whose last point is already in the past
 * yields ZERO slices — and zero slices renders as "Sunburn unlikely", the most
 * dangerous wrong answer this app can give. That failure is silent by
 * construction, so it is checked here instead of being left to look like a
 * result. Two points is the minimum `createSlices` can interpolate between. */
export function forecastCovers(hourly, atMs) {
	if (!Array.isArray(hourly) || hourly.length < 2) return false;
	return hourly[hourly.length - 1].dt * 1000 > atMs;
}

export function forecastEndsAt(hourly) {
	if (!Array.isArray(hourly) || hourly.length === 0) return null;
	return hourly[hourly.length - 1].dt * 1000;
}

function manualHourly(uvIndex, fromMs) {
	// Whole hours from the hour containing `fromMs`, so the first slice starts
	// at or before the exposure start and createSlices has something to clip.
	const startMs = Math.floor(fromMs / 3600000) * 3600000;
	return Array.from({ length: MANUAL_HORIZON_HOURS + 1 }, (_, i) => ({
		dt: Math.floor((startMs + i * 3600000) / 1000),
		uvi: uvIndex,
	}));
}

/* The whole decision, in one place: which UV numbers may be used right now,
 * and with what provenance. Everything that renders or computes asks this and
 * nothing re-derives it — a second copy of the freshness rule is how one
 * surface ends up honest and another does not.
 *
 * `at` is the moment the calculation is FOR (the chosen exposure start), which
 * is not `now`: a start time eight hours out is still a live calculation if
 * the reading is fresh and the forecast reaches that far.
 */
export function resolveUvSource(state, now = new Date(), at = now) {
	const nowMs = now.getTime();
	const atMs = at instanceof Date ? at.getTime() : at;
	const geo = state.geolocation || {};
	const weather = geo.weather;
	const timezone = weather?.timezone;

	const manual = state.manualUv;
	if (manual && nowMs - manual.enteredAt <= UV_FRESH_MS) {
		return {
			mode: "manual",
			usable: true,
			canAcknowledge: false,
			hourly: manualHourly(manual.uvIndex, Math.min(atMs, nowMs)),
			currentUvi: manual.uvIndex,
			readAt: manual.enteredAt,
			ageMs: nowMs - manual.enteredAt,
			timezone,
		};
	}
	// A typed number past its window is simply not a source any more; the
	// forecast underneath it gets assessed on its own merits below, which is
	// what puts the "use the reading from <time>" offer back on screen.

	const readAt = geo.weatherFetchedAt;
	if (!weather || !readAt) {
		return { mode: "none", usable: false, canAcknowledge: false, hourly: null,
			currentUvi: null, readAt: null, ageMs: null, timezone };
	}

	const ageMs = nowMs - readAt;
	const base = { hourly: weather.hourly, currentUvi: weather.current?.uvi ?? null,
		readAt, ageMs, timezone };

	// Coverage is checked before age, and it is not acknowledgeable: consent to
	// use an old reading is not consent to compute from a series that has no
	// numbers for the hours in question.
	if (!forecastCovers(weather.hourly, atMs)) {
		return { ...base, mode: "expired", usable: false, canAcknowledge: false,
			endsAt: forecastEndsAt(weather.hourly) };
	}
	if (ageMs <= UV_FRESH_MS) return { ...base, mode: "live", usable: true, canAcknowledge: false };

	const ack = state.uvAck;
	if (ack && ack.forReadAt === readAt && nowMs - ack.at <= UV_FRESH_MS) {
		return { ...base, mode: "acknowledged", usable: true, canAcknowledge: false };
	}
	return { ...base, mode: "stale", usable: false, canAcknowledge: true };
}

/* ---------- The words.
 *
 * Every string the user reads about UV provenance is written here, once. They
 * are the load-bearing part of the honesty rule — a correct refusal described
 * in vague words is still a lie — and having them in the module the tests
 * drive is what stops a later UI pass softening "expired" into "updated a
 * while ago". Times are formatted in the FORECAST's timezone, because that is
 * the clock the sun outside is on. ---------- */

function readAtLabel(source) {
	return formatInTimeZone(new Date(source.readAt), source.timezone, "h:mm a");
}

/** The one-line provenance strip shown above the results whenever they render. */
export function sourceLabel(source) {
	switch (source.mode) {
		case "live":
			return `Live UV · read at ${readAtLabel(source)}`;
		case "acknowledged":
			return `Stale UV · read at ${readAtLabel(source)}, ${formatAge(source.ageMs)}`;
		case "manual":
			return `Manual UV ${source.currentUvi} · entered at ${readAtLabel(source)}`;
		default:
			return "No UV reading";
	}
}

/** The short marker that travels with anything computed from a non-live UV. */
export function sourceBadge(source) {
	if (source.mode === "acknowledged") return "Stale reading";
	if (source.mode === "manual") return "Manual UV";
	return null;
}

/* The one refusal that is not about the reading at all.
 *
 * `findOptimalTimeSlicing` throws on a source it may not use, and that throw is
 * an ASSERTION: every caller resolves the source through this module first, so
 * reaching it means the build is inconsistent rather than the UV being old. It
 * happened for real — on 2026-08-11 sun.mattia.ninja was restarted onto a
 * server that sends no `Cache-Control`, one page load straddled the deploy, and
 * browsers ended up running a month-old js/app.js beside seven fresh modules.
 * The old app.js built the calculator's input in the old shape; the new
 * calculations.js refused it; and "refusing to calculate from a missing UV
 * source" — a sentence written for whoever edits calculations.js — was what a
 * person standing outside actually read.
 *
 * So it gets a card like every other refusal, and the exception's text stays in
 * the console where it was always meant to be. The two ways out of a stale
 * reading are not offered, because the reading was never the problem and typing
 * a UV index into a broken build lands in exactly the same place. Reloading is
 * the only thing that can help, so it is the only thing offered.
 */
export const CALCULATION_FAILED = {
	title: "This app could not work out a burn time",
	body: "Something went wrong inside the app itself — this is not about your UV reading or your location. Reloading gets the current version of the app and usually fixes it.",
	acknowledgeLabel: null,
	reloadOnly: true,
};

/* What the refusal panel says when `usable` is false — and it is TOTAL: every
 * source, including a mode this module does not recognise and no source at all,
 * resolves to copy written here. That totality is the guarantee, not a
 * courtesy: it is what lets the results area have exactly one refusal path and
 * makes "the user never sees a raw exception" a property of this function
 * rather than a promise each caller has to keep. */
export function refusalCopy(source) {
	if (!source) return CALCULATION_FAILED;
	if (source.mode === "none") {
		return {
			title: "No UV reading yet",
			body: "This app needs a UV index before it can tell you anything. Fetch the forecast for your location, or enter the UV index yourself.",
			acknowledgeLabel: null,
		};
	}
	if (source.mode === "expired") {
		const endsAt = source.endsAt
			? formatInTimeZone(new Date(source.endsAt), source.timezone, "h:mm a")
			: null;
		return {
			title: "This forecast has run out",
			body: `The stored forecast was read at ${readAtLabel(source)}, ${formatAge(source.ageMs)}` +
				(endsAt ? `, and its last hour is ${endsAt}.` : ".") +
				" It has no UV numbers for the time you asked about, so there is nothing here to calculate from. Refresh it, or enter the UV index yourself.",
			acknowledgeLabel: null,
		};
	}
	if (source.mode === "stale") {
		return {
			title: "This UV reading has expired",
			body: `It was read at ${readAtLabel(source)}, ${formatAge(source.ageMs)}. UV is an hourly forecast, so a reading this old no longer describes the sun outside — and a burn time calculated from it would look exactly like a live one. Enter the UV index yourself, or use the old reading and have every result marked as stale.`,
			acknowledgeLabel: `Use the reading from ${readAtLabel(source)}`,
		};
	}
	// live, acknowledged, manual, or something this module has never heard of.
	// The first three are USABLE, so asking them for refusal copy means the
	// calculator refused a reading this module cleared — the assertion case
	// above, not a fourth thing to write words for.
	return CALCULATION_FAILED;
}
