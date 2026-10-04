/* Where the sun is in the sky, from a time and a place. No DOM, no network.
 *
 * The sun card draws the sun's real height through the day rather than a
 * decorative arc, because the height is the physics behind the UV number: the
 * lower the sun, the longer its light's path through the ozone and the weaker
 * the UV. It is also the one thing a person outside can check for themselves —
 * the shadow rule ("if your shadow is shorter than you are, the UV is strong")
 * is the WHO's own rule of thumb, and it is a statement about solar elevation.
 *
 * The low-precision almanac algorithm (US Naval Observatory, "Approximate Solar
 * Coordinates"): good to about 0.01° in declination and well under a degree in
 * elevation for any year this app will see, which is far finer than a person
 * can tell from a shadow. Refraction near the horizon is ignored on purpose:
 * it moves sunrise by a couple of minutes, and the card takes sunrise and
 * sunset from the forecast anyway. */

const RAD = Math.PI / 180;

/* The sun's elevation above the horizon in degrees, negative below it. */
export function solarElevation(date, latitude, longitude) {
	const ms = date instanceof Date ? date.getTime() : Number(date);
	// Days since J2000.0 (2000-01-01 12:00 UTC).
	const d = ms / 86400000 - 10957.5;
	const g = (357.529 + 0.98560028 * d) * RAD;          // mean anomaly
	const q = 280.459 + 0.98564736 * d;                   // mean longitude, degrees
	const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD; // ecliptic longitude
	const e = (23.439 - 0.00000036 * d) * RAD;            // obliquity of the ecliptic
	const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
	const dec = Math.asin(Math.sin(e) * Math.sin(L));
	// Greenwich mean sidereal time, in radians, then the local hour angle.
	const gmst = ((18.697374558 + 24.06570982441908 * d) % 24) * 15 * RAD;
	const hourAngle = gmst + longitude * RAD - ra;
	const lat = latitude * RAD;
	const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
	return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/* How long a person's shadow is, as a multiple of their height. Infinite (no
 * shadow worth the name) at or below the horizon. */
export function shadowRatio(elevationDeg) {
	if (!(elevationDeg > 0)) return Infinity;
	return 1 / Math.tan(elevationDeg * RAD);
}

/* Sunrise and sunset between t0 and t1, found where the sun's centre crosses
 * -0.833° (the standard definition: the upper limb on the horizon, with average
 * refraction), so they agree with a forecast's sunrise and sunset to within a
 * minute or two. Computed rather than read from the forecast because the
 * forecast gives them for its first day only, and the chart can be for tomorrow.
 * Either is null when it does not happen in the window (polar day or night). */
export function sunTimes(t0, t1, latitude, longitude) {
	const STEP = 120000, HORIZON = -0.833;
	let rise = null, set = null;
	let prevT = t0, prevE = solarElevation(t0, latitude, longitude) - HORIZON;
	for (let t = t0 + STEP; t <= t1; t += STEP) {
		const e = solarElevation(t, latitude, longitude) - HORIZON;
		if ((prevE < 0) !== (e < 0)) {
			const crossing = prevT + (STEP * prevE) / (prevE - e);
			if (e >= 0 && rise == null) rise = crossing;
			if (e < 0 && rise != null && set == null) set = crossing;
		}
		prevT = t; prevE = e;
	}
	return { sunrise: rise, sunset: set };
}
