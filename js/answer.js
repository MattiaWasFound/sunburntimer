/* What the hero says, decided in one place and with no DOM.
 *
 * app.js renders these facts and nothing else re-derives them: the UV band a
 * reading falls in (which is also the hero's colour), the moment the answer is
 * for, the one-line verdict a calculation turns into, and where the sun is in
 * its day (which is the page's colour). Each is a pure function of its
 * arguments so tests/answer.test.js can pin them without a browser.
 */

import { CALCULATION_CONSTANTS, ENVIRONMENTAL_MULTIPLIERS } from "./config.js";
import { getHoursInTimezone } from "./utils.js";

/* The WHO UV bands. `key` is the CSS token suffix (--uv-<key>) and the only
 * name the stylesheet and the charts know a band by. */
const UV_BANDS = [
	{ below: 3, key: "low", label: "Low" },
	{ below: 6, key: "moderate", label: "Moderate" },
	{ below: 8, key: "high", label: "High" },
	{ below: 11, key: "very-high", label: "Very high" },
	{ below: Infinity, key: "extreme", label: "Extreme" },
];

export function uvBand(uvi) {
	const value = Number.isFinite(uvi) ? uvi : 0;
	return UV_BANDS.find((band) => value < band.below);
}

/* The moment the answer is for. A chosen start that has already passed is
 * "now", never a calculation for a moment that is over: the page stays open
 * for hours outdoors, and a 14:00 plan is still on screen at 15:00. */
export function effectiveStart(activityStart, now = new Date()) {
	if (!activityStart) return now;
	const chosen = new Date(activityStart);
	if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= now.getTime()) return now;
	return chosen;
}

/* A calculation result as the sentence a person reads.
 *
 *   kind      "burn": the burn dose is reached at `burnTime`, `safeMs` from the
 *             start; "unlikely": it is not reached before the calculation stops
 *             (the evening cutoff, or the next day).
 *   highRisk  the burn comes fast, in high-UV hours, and the dose does get
 *             reached — the case the old results card turned orange for.
 *   envTimes  the same dose on sand, snow and in full shade, for "burn" only.
 *   tip       the one line of advice worth the hero's space. With sunscreen
 *             on, the calculator's first line is always the reapply reminder,
 *             which the sweat note already says, so the hero takes the next.
 */
export function summarizeAnswer(result, timezone, withSunscreen = false) {
	const { burnTime, startTime, points, advice } = result;
	const tip = (withSunscreen ? advice[1] : advice[0]) || null;
	let finalDamage = 0;
	if (points.length > 0) {
		const last = points[points.length - 1];
		finalDamage = (last.totalDamageAtStart || 0) + (last.burnCost || 0);
	}
	const nextDay = !!(startTime && burnTime) &&
		new Date(burnTime).getDate() !== new Date(startTime).getDate();
	if (!startTime || !burnTime || nextDay) {
		return { kind: "unlikely", burnTime: null, safeMs: null, highRisk: false, envTimes: null,
			tip, finalDamage };
	}
	const safeMs = burnTime.getTime() - startTime.getTime();
	const highRisk = finalDamage >= CALCULATION_CONSTANTS.SAFETY_THRESHOLD &&
		safeMs / 3600000 < CALCULATION_CONSTANTS.HIGH_RISK_TIME_LIMIT_HOURS &&
		getHoursInTimezone(burnTime, timezone) < CALCULATION_CONSTANTS.EVENING_RISK_CUTOFF_HOUR;
	const envTimes = {
		shade: shortDuration(safeMs / ENVIRONMENTAL_MULTIPLIERS.SHADE),
		sand: shortDuration(safeMs / ENVIRONMENTAL_MULTIPLIERS.SAND),
		snow: shortDuration(safeMs / ENVIRONMENTAL_MULTIPLIERS.SNOW),
	};
	return { kind: "burn", burnTime, safeMs, highRisk, envTimes,
		tip, finalDamage };
}

/* The big number: hours and minutes, short enough to read at arm's length.
 * Returned in parts so the units can be set smaller than the digits. */
export function durationParts(ms) {
	const total = Math.max(0, Math.round(ms / 60000));
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	if (hours === 0) return [[String(minutes), "min"]];
	if (minutes === 0) return [[String(hours), hours === 1 ? "hour" : "hours"]];
	return [[String(hours), "h"], [String(minutes).padStart(2, "0"), "m"]];
}

/* "4h 55m", "3h", "45m": the compact form for a line of three. */
export function shortDuration(ms) {
	return durationParts(ms).map(([value, unit]) => `${Number(value)}${unit[0]}`).join(" ");
}

/* Where the sun is in its day, as one of six names the stylesheet colours the
 * page by. Night once it has set, and night again before it rises. */
export function skyPhase(nowMs, sunriseMs, sunsetMs) {
	if (!Number.isFinite(sunriseMs) || !Number.isFinite(sunsetMs) || sunsetMs <= sunriseMs) return "midday";
	if (nowMs < sunriseMs || nowMs > sunsetMs) return "night";
	const p = (nowMs - sunriseMs) / (sunsetMs - sunriseMs);
	if (p < 0.15) return "dawn";
	if (p < 0.35) return "morning";
	if (p < 0.65) return "midday";
	if (p < 0.85) return "afternoon";
	return "dusk";
}

/* The hours a "UV today" chart should show: the day the answer is for, from
 * the hour before the UV rises to the hour after it falls. The stored forecast
 * covers three days, and three humps on a phone-wide chart hide the one that
 * matters. Falls back to the whole series rather than drawing nothing. */
export function dayWindow(hourly, atMs, timezone) {
	if (!Array.isArray(hourly) || hourly.length < 2) return hourly;
	const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
	const key = day.format(new Date(atMs));
	const same = hourly.filter((h) => day.format(new Date(h.dt * 1000)) === key);
	const first = same.findIndex((h) => h.uvi > 0);
	if (first < 0) return same.length >= 2 ? same : hourly;
	let last = same.length - 1;
	while (last > first && !(same[last].uvi > 0)) last--;
	const out = same.slice(Math.max(0, first - 1), Math.min(same.length, last + 2));
	return out.length >= 2 ? out : hourly;
}
