import {
	WMO_DESCRIPTIONS,
	FAHRENHEIT_COUNTRY_CODES,
	SWEAT_INDEX_BANDS,
} from "./config.js";

/* ---------- Timezone helpers (vanilla Intl, no date-fns-tz) ---------- */

function getTimezoneOffsetMinutes(timezone, date) {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", second: "2-digit",
		hour12: false,
	});
	const parts = dtf.formatToParts(date);
	const m = {};
	for (const p of parts) m[p.type] = p.value;
	const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
	return (asUTC - date.getTime()) / 60000;
}

export function parseLocationTime(timeStr, timezone) {
	const [datePart, timePart] = timeStr.split("T");
	const [y, mo, d] = datePart.split("-").map(Number);
	const [h, mi] = (timePart || "00:00").split(":").map(Number);
	const asUTC = Date.UTC(y, mo - 1, d, h, mi, 0);
	const offsetMin = getTimezoneOffsetMinutes(timezone, new Date(asUTC));
	return asUTC - offsetMin * 60000;
}

export function getHoursInTimezone(date, timezone) {
	if (!timezone) return date.getHours();
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone, hour: "2-digit", hour12: false,
	});
	return parseInt(dtf.format(date), 10) % 24;
}

export function getFractionalHoursInTimezone(date, timezone) {
	if (!timezone) return date.getHours() + date.getMinutes() / 60;
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour: "2-digit", minute: "2-digit", hour12: false,
	});
	const parts = dtf.formatToParts(date);
	const m = {};
	for (const p of parts) m[p.type] = p.value;
	return (parseInt(m.hour, 10) % 24) + parseInt(m.minute, 10) / 60;
}

function pad(n) { return n < 10 ? "0" + n : "" + n; }

export function formatInTimeZone(date, timezone, formatStr) {
	let year, month, day, hours, minutes;
	if (timezone) {
		const dtf = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			year: "numeric", month: "2-digit", day: "2-digit",
			hour: "2-digit", minute: "2-digit", hour12: false,
		});
		const parts = dtf.formatToParts(date);
		const m = {};
		for (const p of parts) m[p.type] = p.value;
		year = +m.year; month = +m.month; day = +m.day;
		hours = parseInt(m.hour, 10) % 24; minutes = parseInt(m.minute, 10);
	} else {
		year = date.getFullYear(); month = date.getMonth() + 1; day = date.getDate();
		hours = date.getHours(); minutes = date.getMinutes();
	}
	const ampm = hours >= 12 ? "PM" : "AM";
	const h12 = hours % 12 || 12;
	if (formatStr === "h:mm a") return `${h12}:${pad(minutes)} ${ampm}`;
	if (formatStr === "h a") return `${h12} ${ampm}`;
	if (formatStr === "h:mm") return `${h12}:${pad(minutes)}`;
	return formatStr;
}

/* ---------- Temperature ---------- */

export function getTemperatureUnitForCountry(countryCode) {
	if (!countryCode) return "celsius";
	return FAHRENHEIT_COUNTRY_CODES.has(countryCode.toUpperCase()) ? "fahrenheit" : "celsius";
}

export function formatTemperature(temperature, unit) {
	const label = unit === "fahrenheit" ? "F" : "C";
	return `${Math.round(temperature)}\u00B0${label}`;
}

function toFahrenheit(temperature, unit) {
	return unit === "fahrenheit" ? temperature : (temperature * 9) / 5 + 32;
}

/* ---------- Sweat Index ---------- */

export function calculateSweatIndex(temperature, dewPoint, unit) {
	return Math.round(toFahrenheit(temperature, unit) + toFahrenheit(dewPoint, unit));
}

export function getSweatIndexDetails(value) {
	const band = SWEAT_INDEX_BANDS.find((b) => value >= b.min) || SWEAT_INDEX_BANDS[SWEAT_INDEX_BANDS.length - 1];
	return { value, label: band.label, description: band.description, badgeClass: band.badgeClass, textClass: band.textClass };
}

/* ---------- UV Index colors ---------- */

export function getUVIndexColor(uvIndex) {
	if (uvIndex < 3) return { bg: "#dcfce7", text: "#166534", label: "Low" };
	if (uvIndex < 6) return { bg: "#fef9c3", text: "#854d0e", label: "Moderate" };
	if (uvIndex < 8) return { bg: "#ffedd5", text: "#9a3412", label: "High" };
	if (uvIndex < 11) return { bg: "#fee2e2", text: "#991b1b", label: "Very High" };
	return { bg: "#f3e8ff", text: "#6b21a8", label: "Extreme" };
}

export function getUVRiskLevel(uvIndex) {
	if (uvIndex < 3) return "Low";
	if (uvIndex < 6) return "Moderate";
	if (uvIndex < 8) return "High";
	if (uvIndex < 11) return "Very High";
	return "Extreme";
}

export function getAQIColor(aqi) {
	if (aqi <= 50) return { bg: "#dcfce7", text: "#166534" };
	if (aqi <= 100) return { bg: "#fef9c3", text: "#854d0e" };
	if (aqi <= 150) return { bg: "#ffedd5", text: "#9a3412" };
	if (aqi <= 200) return { bg: "#fee2e2", text: "#991b1b" };
	if (aqi <= 300) return { bg: "#f3e8ff", text: "#6b21a8" };
	return { bg: "#7f1d1d", text: "#fef2f2" };
}

/* ---------- Weather description / icon ---------- */

export function getWeatherDescription(code) {
	if (!Number.isFinite(code)) return "Unknown";
	return WMO_DESCRIPTIONS[String(Math.trunc(code))] || "Unknown";
}

export function getWeatherIconName(code) {
	if (!Number.isFinite(code)) return "cloud";
	const c = Math.trunc(code);
	const inRange = (min, max) => c >= min && c <= max;
	if (c === 0) return { name: "sun", color: "#f59e0b" };
	if (c === 1 || c === 2) return { name: "cloud-sun", color: "#f59e0b" };
	if (c === 3) return { name: "cloud", color: "#64748b" };
	if (c === 13 || c === 17 || c === 29 || inRange(95, 99)) return { name: "cloud-lightning", color: "#7c3aed" };
	if (c === 18) return { name: "wind", color: "#64748b" };
	if (c === 19) return { name: "tornado", color: "#334155" };
	if (inRange(10, 12) || c === 28 || inRange(40, 49)) return { name: "cloud-fog", color: "#64748b" };
	if (inRange(20, 21) || inRange(24, 25) || inRange(50, 59)) return { name: "cloud-drizzle", color: "#0284c7" };
	if (inRange(60, 67) || inRange(80, 82) || inRange(91, 92) || c === 94) return { name: "cloud-rain", color: "#0369a1" };
	if (inRange(22, 23) || inRange(36, 39) || inRange(68, 78) || inRange(83, 86) || c === 93) return { name: "cloud-snow", color: "#0e7490" };
	if (c === 27 || c === 79 || inRange(87, 90)) return { name: "cloud-hail", color: "#155e75" };
	if (inRange(4, 9)) return { name: "wind", color: "#78716c" };
	return { name: "cloud", color: "#f97316" };
}

/* ---------- Duration formatting ---------- */

export function formatDuration(diffMs) {
	const hours = Math.floor(diffMs / (1000 * 60 * 60));
	const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
	if (hours === 0) return `${minutes} minutes`;
	if (minutes === 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
	return `${hours}h ${minutes}m`;
}

export function formatDurationShort(ms) {
	const totalMins = Math.round(ms / (1000 * 60));
	const hours = Math.floor(totalMins / 60);
	const mins = totalMins % 60;
	if (hours === 0) return `${mins}m`;
	return `${hours}h ${mins}m`;
}

export function formatElapsedTime(ms) {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
	return `${minutes}:${pad(seconds)}`;
}

export function calculateEnvironmentalTimes(startTime, burnTime) {
	const baseDiffMs = burnTime.getTime() - startTime.getTime();
	return {
		snow: formatDuration(baseDiffMs / ENVIRONMENTAL_MULTIPLIERS_LOCAL.SNOW),
		sand: formatDuration(baseDiffMs / ENVIRONMENTAL_MULTIPLIERS_LOCAL.SAND),
		shade: formatDuration(baseDiffMs / ENVIRONMENTAL_MULTIPLIERS_LOCAL.SHADE),
	};
}

const ENVIRONMENTAL_MULTIPLIERS_LOCAL = { SNOW: 1.88, SAND: 1.15, SHADE: 0.5 };

export function formatElevation(elevation, countryCode) {
	if (countryCode === "US") {
		const feet = Math.round(elevation * 3.28084);
		return `${feet.toLocaleString()}ft`;
	}
	return `${Math.round(elevation).toLocaleString()}m`;
}

/* ---------- Relative time ---------- */

export function formatDistanceToNow(timestamp) {
	const now = Date.now();
	const diff = now - timestamp;
	const mins = Math.round(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days > 1 ? "s" : ""} ago`;
}

/* ---------- Misc ---------- */

export function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}

export function el(tag, attrs, ...children) {
	const node = document.createElement(tag);
	if (attrs) {
		for (const [key, val] of Object.entries(attrs)) {
			if (val == null || val === false) continue;
			if (key === "class") node.className = val;
			else if (key === "dataset") Object.assign(node.dataset, val);
			else if (key.startsWith("on") && typeof val === "function") node.addEventListener(key.slice(2).toLowerCase(), val);
			else if (key === "html") node.innerHTML = val;
			else node.setAttribute(key, val);
		}
	}
	for (const child of children) {
		if (child == null || child === false) continue;
		if (typeof child === "string" || typeof child === "number") node.appendChild(document.createTextNode(String(child)));
		else node.appendChild(child);
	}
	return node;
}
