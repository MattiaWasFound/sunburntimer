import { getState, subscribe, actions, isReadyToCalculate } from "./store.js";
import { findOptimalTimeSlicing } from "./calculations.js";
import { fetchWeatherData, getCurrentPosition, reverseGeocode, searchLocations } from "./services.js";
import { drawUVChart, drawDoseChart, drawSunChart, drawTempChart } from "./charts.js";
import { resolveUvSource, sourceLabel, sourceBadge, refusalCopy, UV_FRESH_MS } from "./uv_source.js";
import { uvBand, effectiveStart, summarizeAnswer, durationParts, shortDuration, skyPhase, dayWindow } from "./answer.js";
import { solarElevation, shadowRatio, sunTimes } from "./solar.js";
import {
	FitzpatrickType, SKIN_TYPE_CONFIG, SPFLevel, SPF_CONFIG,
	SweatLevel, SWEAT_CONFIG, SWEAT_INDEX_BANDS,
} from "./config.js";
import {
	el, formatInTimeZone, dateFormatter,
	formatDurationShort, formatElapsedTime,
	formatElevation, formatTemperature,
	calculateSweatIndex, getSweatIndexDetails,
	getWeatherIconName, formatDistanceToNow,
} from "./utils.js";

/* ================================================================ */
/*  Icons (inline SVG)                                              */
/* ================================================================ */

const ICONS = {
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
	refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
	alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
	alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
	mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
	loader: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>',
	cloud: '<path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 16.7"/>',
	edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
	search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
	square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
	clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	sunrise: '<path d="M12 2v8M4.93 10.93l1.41 1.41"/><path d="M2 18h1.67M20.33 18H22M17.66 12.34l1.41-1.41M22 22H2"/><path d="m8 6 4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
	sunset: '<path d="M12 10V2M4.93 10.93l1.41 1.41"/><path d="M2 18h1.67M20.33 18H22M17.66 12.34l1.41-1.41M22 22H2"/><path d="m16 6-4 4-4-4M16 18a4 4 0 0 0-8 0"/>',
	calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
	activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
	shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
	user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
	droplets: '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
	info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
	cloudSun: '<path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2M19.07 4.93l-1.41 1.41M15.95 8.05A4.5 4.5 0 0 0 8.5 8.5"/><path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 16.7"/>',
	cloudRain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6M8 14v6M12 16v6"/>',
	cloudSnow: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
	cloudLightning: '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
	cloudFog: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M5 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM9 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM13 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>',
	cloudDrizzle: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>',
	cloudHail: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M6 17h.01M10 17h.01M14 17h.01M18 17h.01M8 21h.01M12 21h.01M16 21h.01"/>',
	wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.8 4.4A2 2 0 1 1 11 8H2"/>',
	tornado: '<path d="M21 4H3M15 8H3M17 12H3M13 16H3M11 20H3"/>',
};

function icon(name, size, color, stroke) {
	const s = size || 20;
	const paths = ICONS[name] || ICONS.cloud;
	const sw = stroke || 2;
	const strokeAttr = color ? `style="color:${color}"` : "";
	return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${strokeAttr}>${paths}</svg>`;
}

function weatherIconSvg(code, size) {
	const ic = getWeatherIconName(code);
	// utils.js names icons in kebab-case ("cloud-sun"); ICONS keys are camelCase.
	const name = String(ic.name || ic).replace(/-(\w)/g, (_, c) => c.toUpperCase());
	return icon(name, size || 32, ic.color);
}

/* ================================================================ */
/*  Timer state (module-scoped, not persisted)                      */
/* ================================================================ */

// `source` is a snapshot of where the UV came from at the moment Start was
// pressed. It is kept on the timer rather than read live so that a timer
// started from a stale or hand-typed reading keeps saying so for its whole
// life — a running clock is the most convincing thing on the page, and it must
// never look live when its numbers are not.
let timer = { isRunning: false, startTime: null, elapsedMs: 0, accumulatedDamage: 0, source: null };
let timerInterval = null;
let currentTimeTick = new Date();
let currentCalculation = null;
let lastRenderedSourceMode = null;
// Bumped on every render: anything cached against the last answer (the UV
// chart's what-if) keys on it, so a changed setting can never hit a stale entry.
let lastRenderStamp = 0;

function startTimerInterval() {
	stopTimerInterval();
	timerInterval = setInterval(() => {
		if (!timer.startTime) return;
		timer.elapsedMs = Date.now() - timer.startTime.getTime();
		timer.accumulatedDamage = calculateRealTimeDamage(timer.elapsedMs, timer.startTime);
		renderTimer();
	}, 1000);
}

function stopTimerInterval() {
	if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function calculateRealTimeDamage(elapsedMs, startTime) {
	if (!currentCalculation) return 0;
	const points = currentCalculation.points;
	const currentTime = new Date(startTime.getTime() + elapsedMs);
	let totalDamage = 0;
	for (let i = 0; i < points.length; i++) {
		const point = points[i];
		if (point.slice.datetime <= currentTime) {
			totalDamage += point.burnCost;
		} else {
			const prev = points[i - 1];
			if (prev && prev.slice.datetime <= startTime) {
				const sliceDur = point.slice.datetime.getTime() - prev.slice.datetime.getTime();
				const elapsedInSlice = currentTime.getTime() - prev.slice.datetime.getTime();
				const partial = (elapsedInSlice / sliceDur) * point.burnCost;
				totalDamage += Math.min(partial, point.burnCost);
			}
			break;
		}
	}
	return Math.min(totalDamage, 100);
}

/* ================================================================ */
/*  Rendering                                                       */
/* ================================================================ */

function render() {
	lastRenderStamp++;
	const state = getState();
	const answer = computeAnswer(state);
	renderTopbar(state);
	syncSettings(state, answer);
	renderHero(state, answer);
	renderTiles(state, answer);
	setSky(state);
}

/* The calculator's input for these settings, this reading and this start. The
 * answer, every what-if under the settings and the UV chart's cursor all go
 * through it, so they cannot disagree about what "your settings" are. */
function calcInput(state, source, startTime, override = {}) {
	return {
		uvSource: source,
		timezone: source.timezone,
		placeName: state.geolocation.placeName,
		currentTime: startTime,
		skinType: state.skinType,
		spfLevel: state.spfLevel,
		sweatLevel: state.sweatLevel || SweatLevel.LOW,
		...override,
	};
}

/* The answer each other option would give, holding the rest of the settings:
 * what the settings show under every option, and the dose chart's faint lines.
 * A failure here costs the comparison, never the answer. */
function variantsFor(state, source, startTime) {
	const run = (override) => {
		try { return findOptimalTimeSlicing(calcInput(state, source, startTime, override)); } catch { return null; }
	};
	const sweat = state.sweatLevel || SweatLevel.LOW;
	return {
		skin: Object.fromEntries(Object.values(FitzpatrickType).map((type) => [type, run({ skinType: type })])),
		spf: Object.fromEntries(Object.values(SPFLevel).map((level) => [level, run({ spfLevel: level, sweatLevel: level === SPFLevel.NONE ? SweatLevel.LOW : sweat })])),
		sweat: Object.fromEntries(Object.values(SweatLevel).map((level) => [level, run({ sweatLevel: level })])),
	};
}

/* The one place that decides what the hero is: a loading shape, a place to
 * choose, an error, a refusal, or an answer. Everything below renders the
 * verdict and decides nothing.
 *
 *   { kind: "waiting" }                          inputs or a reading are missing
 *   { kind: "refusal", source, failed }          a reading exists and may not be used
 *   { kind: "answer", source, result, startTime }
 */
function computeAnswer(state) {
	if (!isReadyToCalculate()) {
		lastRenderedSourceMode = null;
		currentCalculation = null;
		return { kind: "waiting" };
	}
	const startTime = effectiveStart(state.activityStart, new Date());
	const source = resolveUvSource(state, currentTimeTick, startTime);
	lastRenderedSourceMode = source.mode;

	// THE REFUSAL. Nothing past this point runs on a UV number the app is not
	// allowed to use; the hero says what is wrong, when the number was read,
	// and the two ways out — never a burn time computed anyway.
	if (!source.usable) {
		currentCalculation = null;
		return { kind: "refusal", source, failed: false };
	}
	// The calculator's own refusal, caught and given the same card as every
	// other one. `findOptimalTimeSlicing` throws on a source it may not use,
	// which cannot happen from here — the check above already ran — so a throw
	// means this build is inconsistent, and the message inside it is written
	// for whoever edits calculations.js. It reached a user once (one stale ES
	// module after a deploy served with no Cache-Control) by
	// unwinding out of a render and into the weather fetch's catch, which
	// posted it as a LOCATION error. store.js no longer lets an exception make
	// that journey; this stops it being an exception at all.
	try {
		const result = findOptimalTimeSlicing(calcInput(state, source, startTime));
		currentCalculation = result;
		return { kind: "answer", source, result, startTime, variants: variantsFor(state, source, startTime) };
	} catch (error) {
		console.error("Refusing to render a burn time: the calculation failed.", error);
		currentCalculation = null;
		return { kind: "refusal", source, failed: true };
	}
}

function renderTopbar(state) {
	const name = state.geolocation.placeName || "Choose a place";
	const label = document.getElementById("place-name");
	if (label.textContent !== name) label.textContent = name;
	document.getElementById("place-button").title = name;
}

/* The page's colour is where the sun is in its day at the place being asked
 * about. A stored forecast's sunrise and sunset are its first day's, so they
 * are rolled forward to the day containing now before being compared. */
function setSky(state) {
	const w = state.geolocation.weather;
	let phase = "midday";
	if (w?.sunrise && w?.sunset) {
		const now = currentTimeTick.getTime();
		let rise = new Date(w.sunrise).getTime();
		let set = new Date(w.sunset).getTime();
		while (rise + 86400000 <= now) { rise += 86400000; set += 86400000; }
		phase = skyPhase(now, rise, set);
	}
	if (document.documentElement.dataset.sky !== phase) document.documentElement.dataset.sky = phase;
}

/* ---------- The hero ---------- */

function renderHero(state, answer) {
	const hero = document.getElementById("hero");
	const geo = state.geolocation;
	const loading = geo.status === "fetching_location" || geo.status === "fetching_weather";
	hero.replaceChildren();

	if (answer.kind === "refusal") {
		hero.className = "hero tile-hero is-refusal";
		renderRefusal(hero, answer.failed ? null : answer.source);
		return;
	}

	if (answer.kind === "waiting") {
		if (geo.status === "error") {
			hero.className = "hero tile-hero is-refusal";
			hero.append(
				el("p", { class: "refusal-title" }, "Could not get the forecast"),
				el("p", { class: "refusal-body" }, geo.error || "Something went wrong fetching the weather."),
				el("div", { class: "refusal-actions" },
					geo.position ? el("button", { class: "btn btn-primary", type: "button", onclick: handleRefresh }, "Try again") : null,
					el("button", { class: "btn btn-quiet", type: "button", onclick: openPlaceSheet }, "Choose a place"),
				),
				el("div", { class: "refusal-choices" }, manualUvForm()),
			);
			return;
		}
		if (!loading && geo.status !== "completed") {
			hero.className = "hero tile-hero";
			hero.append(
				el("p", { class: "hero-lead" }, "Where are you?"),
				el("p", { class: "hero-sub" }, "The answer depends on the UV where you are."),
				el("div", { class: "hero-foot" },
					el("button", { class: "btn btn-primary", type: "button", onclick: openPlaceSheet }, "Choose a place")),
			);
			return;
		}
		hero.className = "hero tile-hero is-loading";
		hero.append(
			el("div", { class: "hero-top" }, el("span", { class: "chip" }, "UV …")),
			el("p", { class: "hero-lead" }, geo.status === "fetching_location"
				? "Finding where you are…"
				: `Reading the UV for ${geo.placeName || "your place"}…`),
			el("p", { class: "hero-number" }, "–:––"),
		);
		return;
	}

	const { source, result, startTime } = answer;
	const tz = source.timezone;
	const live = source.mode === "live";
	const band = uvBand(source.currentUvi);
	const summary = summarizeAnswer(result, tz, state.spfLevel !== SPFLevel.NONE);
	hero.className = `hero tile-hero band-${band.key}${live ? "" : " is-stale"}${timer.startTime !== null ? " has-timer" : ""}`;

	// "UV 7" with no time on it IS a claim about right now, so a reading that
	// is not live carries its own hour wherever it is shown.
	const uvText = live
		? `UV ${source.currentUvi} · ${band.label}`
		: `UV ${source.currentUvi} at ${formatInTimeZone(new Date(source.readAt), tz, "h:mm a")}`;
	const top = el("div", { class: "hero-top" }, el("span", { class: "chip hero-uv" }, el("span", { class: "chip-dot" }), uvText));
	if (timer.startTime === null) {
		top.append(el("button", { class: "btn btn-quiet btn-small", type: "button", dataset: { timer: "start" }, onclick: handleTimerStart, "aria-label": "Start timer",
			html: icon("play", 14) + "<span>Start timer</span>" }));
	}
	hero.append(top);

	const planned = state.activityStart && startTime.getTime() > Date.now();
	const from = planned
		? ["from ", el("strong", {}, dateFormatter("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(startTime)), " "]
		: [];
	if (summary.kind === "burn") {
		hero.append(
			el("p", { class: "hero-lead" }, "Safe in the sun for"),
			durationNumber(summary.safeMs),
			el("p", { class: "hero-sub" }, ...from,
				"until ", el("strong", {}, formatInTimeZone(summary.burnTime, tz, "h:mm a")),
				summary.highRisk ? " — then find shade" : ""),
			el("div", { class: "hero-env", "aria-label": "The same dose elsewhere" },
				...[["In the shade", summary.envTimes.shade], ["On a beach", summary.envTimes.sand], ["On snow", summary.envTimes.snow]]
					.map(([where, time]) => el("span", { class: "env" }, el("span", { class: "env-where" }, where), el("span", { class: "env-time" }, time)))),
		);
	} else {
		const last = result.points.at(-1);
		hero.append(
			el("p", { class: "hero-lead" }, "With these settings"),
			el("p", { class: "hero-number is-words" }, "Sunburn unlikely"),
			last ? el("p", { class: "hero-sub" }, ...from,
				`about ${Math.round(summary.finalDamage)}% of a burn dose by `,
				el("strong", {}, formatInTimeZone(last.slice.datetime, tz, "h:mm a"))) : null,
		);
	}
	if (planned) {
		hero.append(el("button", { class: "link-btn", type: "button", onclick: () => actions.setActivityStart(null) }, "Start now instead"));
	}
	if (summary.tip) hero.append(el("p", { class: "hero-advice" }, summary.tip));

	const foot = el("div", { class: "hero-foot" }, provenance(source));
	if (source.mode !== "manual") foot.append(refreshButton(geo.status === "fetching_weather"));
	hero.append(foot);
	if (timer.startTime !== null) {
		const body = el("div", { class: "hero-timer", id: "timer-body" });
		populateTimerBody(body, result);
		hero.append(body);
	}
}

/* The big number, with its units set smaller than its digits. */
function durationNumber(ms) {
	const number = el("p", { class: "hero-number" });
	for (const [value, unit] of durationParts(ms)) {
		number.append(value, el("span", { class: "unit" }, unit));
	}
	return number;
}

function provenance(source) {
	const badge = sourceBadge(source);
	return el("span", { class: `provenance provenance-${source.mode}` },
		el("span", { class: "provenance-dot" }),
		el("span", {}, sourceLabel(source)),
		badge ? el("span", { class: "chip chip-stale" }, badge) : null,
	);
}

function refreshButton(spinning) {
	const button = el("button", {
		class: "icon-btn", type: "button", onclick: handleRefresh, "aria-label": "Refresh the forecast",
		title: "Refresh the forecast", disabled: spinning ? "" : null, html: icon("refresh", 18),
	});
	if (spinning) button.querySelector("svg").classList.add("spinning");
	return button;
}

/* The only way the hero is allowed to say no. `source` is null when the
 * calculator failed rather than the reading: refusalCopy is total and answers
 * that with CALCULATION_FAILED. */
function renderRefusal(hero, source) {
	const copy = refusalCopy(source);
	hero.append(
		el("div", { class: "hero-top" }, el("span", { class: "chip chip-stale", html: icon("alertTriangle", 14) + "<span>No answer yet</span>" })),
		el("p", { class: "refusal-title" }, copy.title),
		el("p", { class: "refusal-body" }, copy.body),
	);

	// A broken build gets no ways out, because it has none: a hand-typed UV
	// index goes through the same calculator and lands back here, and the
	// forecast was never what was wrong. Reloading is the only move that can
	// change the outcome, so it is the only one offered.
	if (copy.reloadOnly) {
		hero.append(el("div", { class: "refusal-actions" },
			el("button", { class: "btn btn-primary", type: "button", onclick: () => location.reload() }, "Reload the app")));
		return;
	}

	const choices = el("div", { class: "refusal-choices" }, manualUvForm());
	// Way out 2: the old number, explicitly. Only offered when the series
	// still covers the hours being asked about — consent to an old reading is
	// not consent to extrapolate past the end of one.
	if (copy.acknowledgeLabel) {
		choices.append(el("div", {},
			el("button", { class: "btn btn-quiet btn-block", type: "button", onclick: () => actions.acknowledgeStaleUv() }, copy.acknowledgeLabel),
			el("p", { class: "muted small", style: "margin-top:6px" }, "Every result stays marked as stale."),
		));
	}
	hero.append(choices, el("div", { class: "refusal-actions" },
		el("button", { class: "btn btn-quiet", type: "button", onclick: handleRefresh }, "Try to refresh the forecast")));
}

/* Way out 1: your own number. An input rather than a slider because the user
 * is copying a figure off a weather app or a beach sign, and a typed 7 is
 * unambiguous in a way a dragged one is not. inputmode="decimal" raises the
 * number pad without the spinner's stepper on desktop. */
function manualUvForm() {
	const input = el("input", {
		type: "number", class: "manual-input", min: "0", max: "20", step: "0.1",
		inputmode: "decimal", placeholder: "0.0", id: "manual-uv",
	});
	const button = el("button", { class: "btn btn-primary", type: "button" }, "Use this UV index");
	button.onclick = () => {
		const value = Number.parseFloat(input.value);
		if (!Number.isFinite(value) || value < 0 || value > 20) {
			input.classList.add("invalid");
			input.focus();
			return;
		}
		actions.setManualUv(value);
	};
	input.addEventListener("input", () => input.classList.remove("invalid"));
	input.addEventListener("keydown", (e) => { if (e.key === "Enter") button.onclick(); });
	return el("div", {},
		el("label", { class: "manual-label", for: "manual-uv" }, "UV index right now"),
		el("div", { class: "manual-row" }, input, button),
	);
}

/* ---------- The timer, inside the hero ---------- */

function timerSourceNote() {
	// The running timer's own provenance line. It is derived from the snapshot
	// taken at Start, not from the current source, so pausing at the moment a
	// reading ages out cannot quietly relabel a stale run as a live one.
	if (!timer.source || timer.source.mode === "live") return null;
	if (timer.source.mode === "manual") {
		return `Timing against the UV index you entered at ${formatInTimeZone(new Date(timer.source.readAt), timer.source.timezone, "h:mm a")}.`;
	}
	return `Timing against a stale reading from ${formatInTimeZone(new Date(timer.source.readAt), timer.source.timezone, "h:mm a")}. The real UV has moved since.`;
}

function renderTimer() {
	if (!currentCalculation) return;
	const body = document.getElementById("timer-body");
	if (!body) return;
	body.replaceChildren();
	populateTimerBody(body, currentCalculation);
}

function populateTimerBody(body, result) {
	const damage = timer.accumulatedDamage;
	const risk = getRiskStatus(damage);
	const burnTime = result.burnTime;
	const remaining = burnTime && timer.startTime ? Math.max(0, burnTime.getTime() - (timer.startTime.getTime() + timer.elapsedMs)) : null;

	const btns = el("span", { class: "btns" });
	if (timer.isRunning) {
		btns.append(el("button", { class: "icon-btn", type: "button", onclick: handleTimerPause, "aria-label": "Pause timer", title: "Pause", html: icon("pause", 18) }));
	} else {
		btns.append(el("button", { class: "icon-btn", type: "button", onclick: handleTimerResume, "aria-label": "Resume timer", title: "Resume", html: icon("play", 18) }));
	}
	btns.append(el("button", { class: "icon-btn", type: "button", onclick: handleTimerStop, "aria-label": "Stop timer", title: "Stop", html: icon("square", 18) }));
	body.append(el("div", { class: "timer-row" },
		el("span", { class: "timer-elapsed" }, formatElapsedTime(timer.elapsedMs)),
		el("span", { class: "timer-since" }, `${timer.isRunning ? "out" : "paused"} · since ${formatInTimeZone(timer.startTime, timer.source?.timezone, "h:mm a")}`),
		btns,
	));

	const fill = el("div", { class: `meter-fill ${risk.fill}` });
	fill.style.width = `${Math.min(damage, 100)}%`;
	body.append(el("div", { class: "meter", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100",
		"aria-valuenow": damage.toFixed(0), "aria-label": "Burn dose so far" }, fill));
	body.append(el("p", { class: "timer-status" },
		el("strong", {}, risk.status), ` · ${damage.toFixed(1)}% of a burn dose`,
		burnTime && remaining !== null ? (remaining > 0 ? ` · ${formatElapsedTime(remaining)} to go` : " · burn threshold reached") : ""));

	const note = timerSourceNote();
	if (note) body.append(el("p", { class: "timer-source-note" }, note));
	if (damage > 50) {
		body.append(el("p", { class: "timer-alert" }, damage > 90
			? "Seek shade now — you are at high risk of sunburn. Move to shade and apply more sunscreen."
			: damage > 75 ? "Consider seeking shade soon — your exposure is getting significant."
			: "Keep an eye on your exposure time."));
	}
}

function getRiskStatus(damage) {
	if (damage < 25) return { status: "Safe", fill: "" };
	if (damage < 50) return { status: "Caution", fill: "dose-caution" };
	if (damage < 75) return { status: "Warning", fill: "dose-warning" };
	if (damage < 95) return { status: "Danger", fill: "dose-danger" };
	return { status: "Critical", fill: "dose-danger" };
}

function handleTimerStart() {
	const state = getState();
	const source = resolveUvSource(state, new Date());
	timer = {
		isRunning: true, startTime: new Date(), elapsedMs: 0, accumulatedDamage: 0,
		source: { mode: source.mode, readAt: source.readAt, timezone: source.timezone },
	};
	startTimerInterval();
	render();
}
function handleTimerPause() { timer.isRunning = false; stopTimerInterval(); renderTimer(); }
function handleTimerResume() { timer.isRunning = true; startTimerInterval(); renderTimer(); }
function handleTimerStop() {
	timer = { isRunning: false, startTime: null, elapsedMs: 0, accumulatedDamage: 0, source: null };
	stopTimerInterval(); render();
}

/* ---------- Settings: built once, kept in step ---------- */

/* One segmented control. Built once so a pick never re-creates the button
 * under the finger (focus and keyboard position survive); syncSettings sets
 * which segment is pressed. */
function segmented(container, options, onPick, { whatIf = false } = {}) {
	for (const option of options) {
		const content = whatIf
			? [el("span", { class: "seg-main" }, ...option.content), el("small", { class: "seg-what" })]
			: option.content;
		const button = el("button", {
			class: `seg-item${whatIf ? " has-what" : ""}`, type: "button", "aria-pressed": "false", dataset: { value: option.value },
			title: option.title || null, "aria-label": option.aria || null,
		}, ...content);
		button.addEventListener("click", () => onPick(option.value));
		container.append(button);
	}
}

function buildSettings() {
	segmented(document.getElementById("seg-skin"), Object.values(FitzpatrickType).map((type) => {
		const swatch = el("span", { class: "skin-swatch" });
		swatch.style.background = SKIN_TYPE_CONFIG[type].color;
		return { value: type, content: [swatch, type], aria: `Type ${type}, ${SKIN_TYPE_CONFIG[type].subtitle}`, title: SKIN_TYPE_CONFIG[type].subtitle };
	}), (type) => actions.setSkinType(type), { whatIf: true });

	segmented(document.getElementById("seg-spf"), Object.values(SPFLevel).map((level) => ({
		value: level,
		content: [level === SPFLevel.NONE ? "None" : SPF_CONFIG[level].label.replace("SPF ", "")],
		aria: level === SPFLevel.NONE ? "No sunscreen" : SPF_CONFIG[level].label,
	})), (level) => actions.setSPFLevel(level), { whatIf: true });

	const sweatWords = { [SweatLevel.LOW]: "None", [SweatLevel.MEDIUM]: "Some", [SweatLevel.HIGH]: "Lots" };
	segmented(document.getElementById("seg-sweat"), Object.values(SweatLevel).map((level) => ({
		value: level, content: [sweatWords[level]], aria: `${sweatWords[level]} sweating`,
	})), (level) => actions.setSweatLevel(level), { whatIf: true });

	segmented(document.getElementById("units"), [
		{ value: "celsius", content: ["°C"], aria: "Celsius" },
		{ value: "fahrenheit", content: ["°F"], aria: "Fahrenheit" },
	], (value) => actions.setUnits(value));
	for (const opener of [document.getElementById("how-button"), ...document.querySelectorAll("[data-open]")]) {
		opener.addEventListener("click", () => openDialog(document.getElementById(opener.dataset.open || "how-dialog")));
	}
	for (const dialog of document.querySelectorAll("dialog")) wireDialog(dialog);

	document.getElementById("start-now").addEventListener("click", () => actions.setActivityStart(null));
	const input = document.getElementById("start-input");
	// The native picker sits invisibly over the "Later…" segment, so one tap
	// opens it on a phone; showPicker() does the same for a desktop click,
	// which would otherwise only focus one field of the date.
	input.addEventListener("click", () => { try { input.showPicker?.(); } catch { /* not allowed here: the field still edits */ } });
	document.getElementById("skin-help").addEventListener("click", openSkinGuide);
	input.addEventListener("change", () => {
		if (!input.value) actions.setActivityStart(null);
		else actions.setActivityStart(new Date(input.value).toISOString());
	});

	// The skin guide is the old carousel's detail (hair, eyes, freckles), one
	// row per type and selectable, behind a disclosure instead of in the way.
	const guide = document.getElementById("skin-guide-list");
	for (const type of Object.values(FitzpatrickType)) {
		const cfg = SKIN_TYPE_CONFIG[type];
		const swatch = el("span", { class: "skin-swatch" });
		swatch.style.background = cfg.color;
		guide.append(el("button", { class: "skin-row", type: "button", "aria-pressed": "false", dataset: { value: type },
			onclick: () => actions.setSkinType(type) },
			swatch,
			el("span", { class: "skin-row-title" }, `Type ${type} · ${cfg.subtitle}`),
			el("span", { class: "skin-row-desc" },
				`${cfg.description}. Hair: ${cfg.hairColors.join(", ").toLowerCase()}. Eyes: ${cfg.eyeColors.join(", ").toLowerCase()}. Freckles: ${cfg.freckles.toLowerCase()}.`),
		));
	}

	const bands = document.getElementById("sweat-bands");
	for (const band of [...SWEAT_INDEX_BANDS].reverse()) {
		bands.append(el("div", { class: "sweat-band" }, el("b", {}, band.rangeLabel), band.label));
	}
}

function pressValue(container, value) {
	for (const button of container.querySelectorAll("[data-value]")) {
		button.setAttribute("aria-pressed", String(button.dataset.value === value));
	}
}

function toLocalInputValue(date) {
	const pad = (n) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* Under each option, the answer it would give: "all day" when it would not
 * reach a burn dose, blank when there is no answer to compare against. */
function whatText(result, tz) {
	if (!result) return "";
	const summary = summarizeAnswer(result, tz);
	return summary.kind === "burn" ? shortDuration(summary.safeMs) : "all day";
}

function syncSettings(state, answer) {
	const variants = answer?.kind === "answer" ? answer.variants : null;
	const tz = answer?.source?.timezone;
	for (const [id, key] of [["seg-skin", "skin"], ["seg-spf", "spf"], ["seg-sweat", "sweat"]]) {
		for (const button of document.getElementById(id).children) {
			const what = button.querySelector(".seg-what");
			const muted = key === "sweat" && state.spfLevel === SPFLevel.NONE;
			const text = variants && !muted ? whatText(variants[key]?.[button.dataset.value], tz) : "";
			if (what && what.textContent !== text) what.textContent = text;
		}
	}
	pressValue(document.getElementById("units"), state.units || state.geolocation.weather?.temperatureUnit || "celsius");
	pressValue(document.getElementById("seg-skin"), state.skinType);
	pressValue(document.getElementById("skin-guide-list"), state.skinType);
	pressValue(document.getElementById("seg-spf"), state.spfLevel);
	const sweat = document.getElementById("seg-sweat");
	const noScreen = state.spfLevel === SPFLevel.NONE;
	pressValue(sweat, noScreen ? null : state.sweatLevel);
	for (const button of sweat.children) button.disabled = noScreen;

	const skin = SKIN_TYPE_CONFIG[state.skinType];
	const skinNote = document.getElementById("note-skin");
	skinNote.textContent = skin ? `${skin.subtitle} · ${skin.description.toLowerCase()}` : "";
	const sweatCfg = SWEAT_CONFIG[state.sweatLevel];
	document.getElementById("note-sweat").textContent = noScreen
		? "Sweat only matters with sunscreen on"
		: state.sweatLevel === SweatLevel.LOW || !sweatCfg
			? "Reapply every 2 hours, and after swimming"
			: `Sweat wears it off after ${sweatCfg.startHours}h`;

	const planned = state.activityStart ? effectiveStart(state.activityStart, new Date()) : null;
	const isPlanned = !!planned && planned.getTime() > Date.now();
	document.getElementById("start-now").setAttribute("aria-pressed", String(!isPlanned));
	document.getElementById("start-later").dataset.pressed = String(isPlanned);
	document.getElementById("start-later-label").textContent = isPlanned
		? dateFormatter("en-US", { timeZone: state.geolocation.weather?.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(planned)
		: "Later…";
	const input = document.getElementById("start-input");
	if (document.activeElement !== input) input.value = toLocalInputValue(isPlanned ? planned : new Date());
	input.min = toLocalInputValue(new Date());
	const lastForecast = state.geolocation.weather?.hourly?.at(-1);
	if (lastForecast) input.max = toLocalInputValue(new Date(lastForecast.dt * 1000));
}

function openSkinGuide(event) {
	event.preventDefault();
	openDialog(document.getElementById("skin-dialog"));
}

/* Every dialog here is a native <dialog>: Escape, focus trapping and the
 * backdrop come from the browser. A tap on the backdrop closes it — but not
 * the compatibility click that a touch which OPENED it can deliver to whatever
 * it just mounted. */
function openDialog(dialog) {
	dialog.dataset.openedAt = String(performance.now());
	dialog.showModal();
}

function wireDialog(dialog) {
	dialog.addEventListener("click", (e) => {
		if (e.target.closest("[data-close]")) { dialog.close(); return; }
		if (e.target !== dialog || performance.now() - Number(dialog.dataset.openedAt || 0) < 350) return;
		const r = dialog.getBoundingClientRect();
		if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
	});
}

/* ---------- The tiles: UV, dose, sun, weather ---------- */

/* What the last render decided, kept so a cursor move, a resize or the minute
 * tick can redraw the tiles without recomputing the answer. */
let view = null;
/* Each chart's last mapping from pointer x to time (charts.js returns it). */
const charts = {};
/* The ONE moment every chart draws, in ms, or null. Pointing at any chart sets
 * it; leaving clears it. A touch leaves it where the finger lifted (there is no
 * hover to clear it), until a tap somewhere else. */
let cursor = null;
let cursorPinned = false;
let tileFrame = 0;

let cursorFrame = 0;

/* A cursor move only moves the overlays and rewrites the readouts; a resize
 * redraws the charts. Each is batched to the next frame. */
function setCursor(t, pinned = cursorPinned) {
	const next = t == null ? null : Math.round(t / 60000) * 60000;
	cursorPinned = next != null && pinned;
	if (next === cursor) return;
	cursor = next;
	if (!cursorFrame) cursorFrame = requestAnimationFrame(() => { cursorFrame = 0; showCursor(); });
}

function scheduleTiles() {
	if (!tileFrame) tileFrame = requestAnimationFrame(() => { tileFrame = 0; drawTiles(); });
}

/* The dose a calculation accumulates, as points a chart can draw: 0% at the
 * start, the running total at the end of every slice, and the burn itself. */
function doseSeries(result) {
	const pts = result.points;
	if (!pts.length) return [];
	const series = [{ t: pts[0].slice.datetime.getTime(), dose: 0 }];
	for (let i = 1; i < pts.length; i++) series.push({ t: pts[i].slice.datetime.getTime(), dose: pts[i].totalDamageAtStart });
	const last = pts[pts.length - 1];
	const end = result.burnTime ? result.burnTime.getTime() : last.slice.datetime.getTime() + 3600000 / (result.timeSlices || 4);
	series.push({ t: end, dose: Math.min(100, last.totalDamageAtStart + last.burnCost) });
	return series;
}

/* Decides what each tile shows; drawTiles only draws it. */
function renderTiles(state, answer) {
	const geo = state.geolocation;
	const weather = geo.weather;
	view = { answer, countryCode: geo.countryCode, tz: weather?.timezone, uv: null, dose: null, sun: null, temps: null, weather, readAt: geo.weatherFetchedAt, units: state.units || weather?.temperatureUnit };

	if (answer.kind === "answer") {
		const { source, result, startTime } = answer;
		view.tz = source.timezone;
		view.uv = { hours: dayWindow(source.hourly, startTime.getTime(), source.timezone),
			start: startTime.getTime(), burnAt: result.burnTime ? result.burnTime.getTime() : null, result, source };
		const label = (level) => level === SPFLevel.NONE ? "No SPF" : SPF_CONFIG[level].label;
		const series = [{ label: label(state.spfLevel), points: doseSeries(result), current: true }];
		for (const [level, other] of Object.entries(answer.variants?.spf || {})) {
			if (level !== state.spfLevel && other) series.push({ label: label(level), points: doseSeries(other), current: false });
		}
		view.dose = { series, result };
	}

	// The sun and the temperature are drawn on the same day as the UV: the day
	// the answer is for, which is tomorrow when a start is planned for then.
	const anchor = view.uv ? (view.uv.hours[0].dt + view.uv.hours[view.uv.hours.length - 1].dt) * 500 : Date.now();
	if (geo.position) {
		const { latitude, longitude } = geo.position;
		const { sunrise, sunset } = sunTimes(anchor - 12 * 3600000, anchor + 12 * 3600000, latitude, longitude);
		const margin = 45 * 60000;
		view.sun = {
			elevationAt: (t) => solarElevation(t, latitude, longitude),
			sunrise, sunset,
			t0: sunrise != null ? sunrise - margin : anchor - 12 * 3600000,
			t1: sunset != null ? sunset + margin : anchor + 12 * 3600000,
		};
	}
	if (weather?.hourly?.length) {
		const window = view.uv
			? [view.uv.hours[0].dt, view.uv.hours[view.uv.hours.length - 1].dt]
			: (() => { const day = dayWindow(weather.hourly, Date.now(), weather.timezone); return [day[0].dt, day[day.length - 1].dt]; })();
		const hours = weather.hourly.filter((h) => h.dt >= window[0] && h.dt <= window[1]);
		if (hours.length >= 2) view.temps = hours;
	}
	drawTiles();
}

const hoverable = matchMedia("(hover: hover)");

/* Draws the four charts. Runs on a render, a tile resize and the minute tick,
 * never on a cursor move, then shows the cursor over them. */
function drawTiles() {
	if (!view) return;
	const now = Date.now();
	const tz = view.tz;
	const at = (t) => formatInTimeZone(new Date(t), tz, "h:mm a");
	const clear = (id) => { const c = document.getElementById(id); c.getContext("2d").clearRect(0, 0, c.width, c.height); };
	const empty = (id, text) => { const node = document.getElementById(id); node.textContent = text; node.hidden = !text; };
	const waiting = view.answer.kind === "waiting" ? "Choose a place to see the day." : "Appears once there is a UV reading the app may use.";

	charts.uv = view.uv ? drawUVChart(document.getElementById("uv-chart"), { hours: view.uv.hours, tz, now, start: view.uv.start, burnAt: view.uv.burnAt }) : null;
	if (!view.uv) clear("uv-chart");
	empty("uv-empty", view.uv ? "" : waiting);
	if (charts.uv) {
		// When the UV is 3 or more: the WHO's line for protecting skin.
		const f = charts.uv.valueAt;
		let from = null, to = null, peak = { t: charts.uv.t0, v: -1 };
		for (let t = charts.uv.t0; t <= charts.uv.t1; t += 300000) {
			const v = f(t);
			if (v >= 3) { if (from == null) from = t; to = t; }
			if (v > peak.v) peak = { t, v };
		}
		charts.uv.summary = `${from != null ? `Protect ${at(from)}–${at(to)} · ` : ""}Peak ${peak.v.toFixed(1)} at ${at(peak.t)}`;
	}

	charts.dose = view.dose ? drawDoseChart(document.getElementById("dose-chart"), { series: view.dose.series, dayEnd: view.uv.hours[view.uv.hours.length - 1].dt * 1000, tz }) : null;
	if (!view.dose) clear("dose-chart");
	empty("dose-empty", view.dose ? "" : waiting);
	document.getElementById("dose-foot").textContent = view.dose ? "Faint lines: the same day with the other sunscreens" : "";

	charts.sun = view.sun ? drawSunChart(document.getElementById("sun-chart"), { ...view.sun, now, tz }) : null;
	empty("sun-empty", view.sun ? "" : "Choose a place to see the sun.");
	document.getElementById("shadow-row").hidden = !view.sun;

	const w = view.weather;
	const live = view.readAt != null && now - view.readAt <= UV_FRESH_MS;
	view.formatTemp = (temp) => formatTemperature(temp, w?.temperatureUnit, view.units);
	charts.temp = view.temps ? drawTempChart(document.getElementById("temp-chart"), { hours: view.temps, tz, now, format: view.formatTemp }) : null;
	if (!view.temps) clear("temp-chart");
	empty("temp-empty", view.temps || w ? "" : "Choose a place to see the weather.");
	document.getElementById("weather-title").textContent = w && !live ? "Last weather read" : "Weather";
	document.getElementById("weather-card").classList.toggle("is-stale", !!w && !live);
	view.live = live;
	weatherShown = null;
	showCursor();
}

/* The cursor overlay of each chart, made once by wireChart. */
const overlays = {};
/* Which hour the weather tile last showed, so a cursor move inside one hour
 * does not rebuild it. Reset by every drawTiles. */
let weatherShown = null;

/* The cursor and everything that reads it: four overlays moved with
 * transforms, and the tiles' readouts. Runs on every cursor move, so it draws
 * no canvas and reads layout once (the pills' widths, all together). */
function showCursor() {
	if (!view) return;
	const now = Date.now();
	const tz = view.tz;
	const at = (t) => formatInTimeZone(new Date(t), tz, "h:mm a");
	const setText = (id, text) => { const node = document.getElementById(id); if (node.textContent !== text) node.textContent = text; };

	/* The overlays: write every label, read every width, then place. */
	const placed = [];
	for (const key of ["uv", "dose", "sun", "temp"]) {
		const map = charts[key], o = overlays[key];
		const inside = !!map && cursor != null && cursor >= map.t0 && cursor <= map.t1;
		o.root.hidden = !inside;
		if (!inside) continue;
		const p = map.point(cursor);
		if (o.pill.textContent !== p.label) o.pill.textContent = p.label;
		placed.push({ o, map, p, x: map.xAt(cursor) });
	}
	for (const item of placed) item.width = item.o.pill.offsetWidth;
	for (const { o, map, p, x, width } of placed) {
		o.line.style.transform = `translate(${x}px, ${map.top}px)`;
		o.line.style.height = `${map.bottom - map.top}px`;
		o.dot.hidden = p.y == null;
		if (p.y != null) {
			o.dot.style.transform = `translate(${x}px, ${p.y}px)`;
			o.dot.style.setProperty("--dot", p.color);
			o.dot.classList.toggle("is-sun", !!p.sun);
		}
		o.pill.style.transform = `translateX(${Math.max(2, Math.min(map.width - width - 2, x - width / 2))}px)`;
	}

	/* UV: the value under the cursor and what a start then would give you. */
	{
		let meta = "", foot = "", plan = null;
		const map = charts.uv;
		if (map) {
			if (cursor != null && cursor >= map.t0 && cursor <= map.t1) {
				const what = cursor > now + 300000 ? whatIf(cursor) : null;
				meta = what ? `Start at ${at(cursor)} → ${what}` : `${uvBand(map.valueAt(cursor)).label} at ${at(cursor)}`;
				if (cursor <= now + 300000) foot = "Already past — a start can only be planned ahead";
				else if (hoverable.matches) foot = `Click to plan your start for ${at(cursor)}`;
				else plan = cursor; // touch: a tap reads the chart, so planning is a button
			} else {
				meta = map.summary;
				foot = hoverable.matches ? "Point at the day to read it · click a time to plan your start" : "Drag across the day to read it · tap Plan to start then";
			}
		}
		setText("uv-meta", meta);
		const footNode = document.getElementById("uv-foot");
		const key = plan != null ? `plan:${plan}` : `text:${foot}`;
		if (footNode.dataset.key !== key) {
			footNode.dataset.key = key;
			footNode.replaceChildren(plan != null
				? el("button", { class: "btn btn-quiet btn-small", type: "button", onclick: () => planStart(plan) }, `Plan start ${at(plan)}`)
				: foot);
		}
	}

	/* Dose: the dose by the cursor's time. */
	{
		let meta = "";
		const map = charts.dose;
		if (map) {
			const d = cursor != null && cursor >= map.t0 ? map.doseAt(cursor) : null;
			if (d != null) meta = `${Math.round(d)}% by ${at(cursor)} · ${shortDuration(cursor - map.t0)} out`;
			else if (cursor != null && cursor < map.t0) meta = `Before your start at ${at(map.t0)}`;
			else if (view.dose.result.burnTime) meta = `Burn at ${at(view.dose.result.burnTime.getTime())}`;
			else meta = "Under a burn dose today";
		}
		setText("dose-meta", meta);
	}

	/* Sun: when it sets, and your shadow at the cursor (or now). */
	{
		const sun = view.sun;
		let meta = "";
		if (sun?.sunrise != null && sun?.sunset != null) {
			if (now < sun.sunrise) meta = `Sunrise in ${formatDurationShort(sun.sunrise - now)}`;
			else if (now < sun.sunset) meta = `Sunset in ${formatDurationShort(sun.sunset - now)}`;
			else meta = `${formatDurationShort(sun.sunset - sun.sunrise)} of daylight`;
		}
		setText("sun-meta", meta);
		if (sun) {
			const t = cursor ?? now;
			const e = sun.elevationAt(t);
			const ratio = shadowRatio(e);
			const shape = document.getElementById("shadow-shape");
			const rx = Number.isFinite(ratio) ? Math.max(2, Math.min(42, ratio * 15)) : 0;
			shape.setAttribute("rx", String(rx));
			shape.setAttribute("cx", String(8 + rx));
			const when = cursor != null ? at(t) : "Now";
			setText("shadow-text", !(e > 0)
				? `${when}: the sun is down, no UV.`
				: `${when}: your shadow is ${ratio < 10 ? ratio.toFixed(1) : "over 10"}× your height. ${ratio < 1 ? "Shorter than you: strong UV." : "Longer than you: weaker UV."}`);
		}
	}

	/* Weather: now, or the forecast for the hour under the cursor. */
	{
		const w = view.weather;
		const nowBox = document.getElementById("weather-now");
		const stats = document.getElementById("weather-stats");
		const hour = w && cursor != null && view.temps
			? view.temps.reduce((best, h) => (Math.abs(h.dt * 1000 - cursor) < Math.abs(best.dt * 1000 - cursor) ? h : best))
			: null;
		const key = !w ? "none" : hour ? `hour:${hour.dt}` : "now";
		if (key !== weatherShown) {
			weatherShown = key;
			if (!w) { nowBox.replaceChildren(); stats.replaceChildren(); }
			else {
				const fmt = view.formatTemp;
				const shown = hour || w.current;
				nowBox.replaceChildren(
					el("span", { class: "weather-icon", html: weatherIconSvg(shown.weather?.[0]?.id, 34) }),
					el("span", { class: "weather-temp" }, fmt(shown.temp)),
					el("span", { class: "weather-what" },
						el("span", { class: "weather-desc" }, shown.weather?.[0]?.description || "Clear"),
						hour
							? el("span", { class: "read-at" }, `Forecast for ${formatInTimeZone(new Date(hour.dt * 1000), tz, "h a")}`)
							: el("span", { class: `read-at${view.live ? "" : " stale"}`, dataset: { readAt: String(view.readAt), tz: tz || "" } }, readAtText(view.readAt, tz))),
				);
				const stat = (label, value, desc) => el("div", { class: "stat" },
					el("span", { class: "stat-label" }, label), el("span", { class: "stat-value" }, value), desc ? el("span", { class: "stat-desc" }, desc) : null);
				const parts = [];
				if (shown.dewPoint !== undefined) {
					parts.push(stat("Dew point", fmt(shown.dewPoint)));
					const si = getSweatIndexDetails(calculateSweatIndex(shown.temp, shown.dewPoint, w.temperatureUnit));
					parts.push(stat("Sweat index", String(si.value), si.label));
				}
				if (!hour && w.aqi) parts.push(stat("Air quality", `AQI ${w.aqi.us_aqi}`, aqiLabel(w.aqi.us_aqi)));
				if (hour) parts.push(stat("UV index", hour.uvi.toFixed(1), uvBand(hour.uvi).label));
				if (w.elevation != null && parts.length < 3) parts.push(stat("Elevation", formatElevation(w.elevation, view.countryCode || "US")));
				stats.replaceChildren(...parts);
			}
		}
	}
}

/* The answer for a start at `t`, with the user's own settings: what the UV
 * chart's cursor says before you commit to it. Cached per 5 minutes so a slow
 * drag does not recompute the same answer. */
const whatIfCache = new Map();
function whatIf(t) {
	const answer = view?.answer;
	if (answer?.kind !== "answer") return null;
	const key = `${Math.round(t / 300000)}|${answer.result.startTime?.getTime()}|${lastRenderStamp}`;
	if (whatIfCache.has(key)) return whatIfCache.get(key);
	if (whatIfCache.size > 300) whatIfCache.clear();
	const state = getState();
	const start = new Date(Math.round(t / 300000) * 300000);
	const source = resolveUvSource(state, currentTimeTick, start);
	let text = null;
	if (source.usable) {
		try {
			const result = findOptimalTimeSlicing({ ...calcInput(state, source, start) });
			const summary = summarizeAnswer(result, source.timezone);
			text = summary.kind === "burn" ? `safe for ${shortDuration(summary.safeMs)}` : "sunburn unlikely";
		} catch { text = null; }
	}
	whatIfCache.set(key, text);
	return text;
}

function planStart(t) {
	if (view?.answer.kind !== "answer" || !view.uv) return;
	const rounded = Math.round(t / 300000) * 300000;
	if (rounded <= Date.now() + 300000) { actions.setActivityStart(null); return; }
	const last = view.uv.hours[view.uv.hours.length - 1].dt * 1000;
	setCursor(null, false);
	actions.setActivityStart(new Date(Math.min(rounded, last)).toISOString());
}

/* Pointer and keyboard on one chart. The pointer moves the shared cursor; a
 * mouse click on the UV chart plans a start there. Touch drags horizontally
 * across a chart (touch-action: pan-y in the stylesheet keeps vertical page
 * scrolling), and a vertical pan cancels the drag. */
function wireChart(key, onPick) {
	const wrap = document.getElementById(`${key}-wrap`);
	const canvas = document.getElementById(`${key}-chart`);
	const line = el("i", { class: "cursor-line" }), dot = el("i", { class: "cursor-dot" }), pill = el("span", { class: "cursor-pill" });
	const root = el("div", { class: "cursor", "aria-hidden": "true" }, line, dot, pill);
	root.hidden = true;
	wrap.append(root);
	overlays[key] = { root, line, dot, pill };
	const timeAt = (e) => {
		const rect = canvas.getBoundingClientRect();
		return charts[key]?.timeAt(e.clientX - rect.left) ?? null;
	};
	let pressed = false;
	let lastPointer = "mouse";
	canvas.addEventListener("pointerdown", (e) => {
		lastPointer = e.pointerType;
		pressed = true;
		if (e.pointerType !== "mouse") setCursor(timeAt(e), true);
	});
	canvas.addEventListener("pointermove", (e) => {
		if (e.pointerType === "mouse") setCursor(timeAt(e), false);
		else if (pressed) setCursor(timeAt(e), true);
	});
	const release = () => { pressed = false; };
	canvas.addEventListener("pointerup", release);
	canvas.addEventListener("pointercancel", release);
	canvas.addEventListener("pointerleave", (e) => {
		release();
		if (e.pointerType === "mouse" && !cursorPinned) setCursor(null, false);
	});
	if (onPick) {
		canvas.addEventListener("click", (e) => {
			if (lastPointer !== "mouse") return;
			const t = timeAt(e);
			if (t != null) onPick(t);
		});
	}
	wrap.addEventListener("keydown", (e) => {
		const map = charts[key];
		if (!map) return;
		const step = e.shiftKey ? 3600000 : 900000;
		const from = cursor ?? Math.max(map.t0, Math.min(map.t1, Date.now()));
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			setCursor(Math.max(map.t0, Math.min(map.t1, from + (e.key === "ArrowRight" ? step : -step))), true);
		} else if (e.key === "Home" || e.key === "End") {
			e.preventDefault();
			setCursor(e.key === "Home" ? map.t0 : map.t1, true);
		} else if (e.key === "Enter" && onPick && cursor != null) {
			e.preventDefault();
			onPick(cursor);
		} else if (e.key === "Escape" && cursor != null) {
			setCursor(null, false);
		}
	});
	wrap.addEventListener("blur", () => { if (cursorPinned && !pressed) setCursor(null, false); });
	// A tile's canvas follows its tile: the bento resizes tiles in both
	// directions, so a width-only window listener is not enough.
	new ResizeObserver(scheduleTiles).observe(wrap);
}

function readAtText(readAt, tz) {
	return `Read at ${formatInTimeZone(new Date(readAt), tz, "h:mm a")} · ${formatDistanceToNow(readAt)}`;
}

function aqiLabel(aqi) {
	if (aqi <= 50) return "Good";
	if (aqi <= 100) return "Moderate";
	if (aqi <= 150) return "Unhealthy for some";
	if (aqi <= 200) return "Unhealthy";
	if (aqi <= 300) return "Very unhealthy";
	return "Hazardous";
}

/* ---------- Place sheet ---------- */

function openPlaceSheet() {
	const dialog = document.getElementById("place-dialog");
	const state = getState();
	const w = state.geolocation.weather;
	setPlaceNote(state.geolocation.placeName
		? `Now: ${state.geolocation.placeName}${w?.elevation != null ? ` · ${formatElevation(w.elevation, state.geolocation.countryCode || "US")} elevation` : ""}`
		: "");
	openDialog(dialog);
	// A keyboard straight away on a phone would cover "Use my current
	// location"; on a desktop typing is the fast path.
	if (matchMedia("(pointer: fine)").matches) document.getElementById("place-search").focus();
}

function setPlaceNote(text, error = false) {
	const note = document.getElementById("place-note");
	note.textContent = text;
	note.classList.toggle("error", error);
}

function buildPlaceSheet() {
	const dialog = document.getElementById("place-dialog");
	const input = document.getElementById("place-search");
	const list = document.getElementById("place-results");
	const locate = document.getElementById("use-location");
	document.getElementById("place-button").addEventListener("click", openPlaceSheet);
	dialog.addEventListener("close", () => { input.value = ""; list.replaceChildren(); });

	locate.addEventListener("click", async () => {
		locate.disabled = true;
		setPlaceNote("Finding where you are…");
		try {
			const position = await getCurrentPosition();
			const { placeName, countryCode } = await reverseGeocode(position);
			dialog.close();
			loadPlace(position, placeName, countryCode);
		} catch (err) {
			// A refused or failed fix leaves the place you had: the sheet says
			// why, and the answer for the old place stays on screen.
			setPlaceNote(err.message || "Could not find your location.", true);
		} finally {
			locate.disabled = false;
		}
	});

	let debounceTimer = null;
	let abortCtrl = null;
	let activeIndex = -1;
	let results = [];

	function choose(result) {
		dialog.close();
		loadPlace({ latitude: result.latitude, longitude: result.longitude },
			result.admin1 && result.admin1 !== result.name ? `${result.name}, ${result.admin1}` : `${result.name}, ${result.country}`,
			result.countryCode);
	}

	function draw() {
		list.replaceChildren(...results.map((r, i) => {
			const item = el("li", { class: `search-result${i === activeIndex ? " active" : ""}`, role: "option",
				"aria-selected": String(i === activeIndex) },
				r.name, el("small", {}, [r.admin1, r.country].filter(Boolean).join(", ")));
			item.addEventListener("click", () => choose(r));
			return item;
		}));
	}

	input.addEventListener("input", () => {
		clearTimeout(debounceTimer);
		const q = input.value.trim();
		if (q.length < 2) { results = []; draw(); return; }
		debounceTimer = setTimeout(async () => {
			if (abortCtrl) abortCtrl.abort();
			abortCtrl = new AbortController();
			try {
				results = await searchLocations(q, abortCtrl.signal);
				activeIndex = results.length ? 0 : -1;
				setPlaceNote(results.length ? "" : "No places found.");
				draw();
			} catch (e) {
				if (e.name !== "AbortError") setPlaceNote("Search is unavailable right now.", true);
			}
		}, 250);
	});
	input.addEventListener("keydown", (e) => {
		if (!results.length) return;
		if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, results.length - 1); draw(); }
		else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); draw(); }
		else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); choose(results[activeIndex]); }
	});
}

function loadPlace(position, placeName, countryCode) {
	actions.setPosition(position, placeName, countryCode);
	actions.setGeolocationStatus("fetching_weather");
	fetchWeatherData(position, countryCode)
		.then((weather) => actions.setWeather(weather))
		.catch((err) => actions.setGeolocationError(err.message || "Failed to fetch weather"));
}

/* ---------- Event Handlers ---------- */

async function handleRefresh() {
	const state = getState();
	if (!state.geolocation.position) return;
	const hadReading = !!state.geolocation.weather;
	try {
		actions.setGeolocationStatus("fetching_weather");
		const weather = await fetchWeatherData(state.geolocation.position, state.geolocation.countryCode || "US");
		actions.setWeather(weather);
	} catch (err) {
		// Offline, this is the expected outcome. Dropping into the error state
		// would hide the stored reading and its timestamp, which is the whole
		// offline story; the refusal already explains why it cannot be used,
		// and it stays on screen with the two ways out.
		if (hadReading) actions.setGeolocationStatus("completed");
		else actions.setGeolocationError(err.message || "Failed to fetch weather");
	}
}

/* ---------- Init ---------- */

function init() {
	buildSettings();
	buildPlaceSheet();
	subscribe(() => render());

	// Current time ticker (relative times, the sun, the sky).
	setInterval(() => {
		currentTimeTick = new Date();
		const state = getState();

		// A reading goes stale while the page is open, and the page is open for
		// hours — the app is used outdoors, with the phone in a pocket. When the
		// provenance changes under a rendered result, the whole thing is redrawn
		// so the refusal appears instead of a burn time that has quietly stopped
		// being true. This is the ONLY thing that closes the window between an
		// hour-old reading and the next user interaction. A planned start that
		// has just arrived is the same kind of change: the answer is now "now".
		const startPassed = state.activityStart && new Date(state.activityStart).getTime() <= Date.now();
		if (startPassed || (isReadyToCalculate() &&
			resolveUvSource(state, currentTimeTick, effectiveStart(state.activityStart, new Date())).mode !== lastRenderedSourceMode)) {
			if (startPassed) actions.setActivityStart(null);
			else render();
			return;
		}

		// The Now line, the sun and the minutes-ago labels move with the clock.
		drawTiles();
		if (state.geolocation.weather) setSky(state);
		for (const node of document.querySelectorAll(".read-at[data-read-at]")) {
			node.textContent = readAtText(Number(node.dataset.readAt), node.dataset.tz || undefined);
		}
		const when = document.querySelector(".hero-when");
		if (when && when.textContent.startsWith("Now") && state.geolocation.weather) {
			when.textContent = `Now · ${formatInTimeZone(currentTimeTick, state.geolocation.weather.timezone, "h:mm a")}`;
		}
	}, 60000);

	// The four charts share one cursor; the UV chart also plans a start.
	wireChart("uv", planStart);
	wireChart("dose");
	wireChart("sun");
	wireChart("temp");
	// A touch leaves the cursor where it lifted; a tap anywhere that is not a
	// chart (or the Plan button under one) puts it away.
	document.addEventListener("pointerdown", (e) => {
		if (cursorPinned && !e.target.closest(".chart-wrap, .card-foot")) setCursor(null, false);
	});

	// Refresh the saved place's forecast on load unless what is stored is
	// still live. Offline this simply fails and the stored reading — with its
	// timestamp, and the refusal if it has aged out — is what the app shows;
	// online it means an installed app that has been closed for a day opens on
	// today's sun rather than on a refusal it could have answered itself.
	const state = getState();
	if (state.geolocation.status === "completed" && state.geolocation.position &&
		resolveUvSource(state, new Date()).mode !== "live") {
		const position = state.geolocation.position;
		const hadReading = !!state.geolocation.weather;
		actions.setGeolocationStatus("fetching_weather");
		fetchWeatherData(position, state.geolocation.countryCode || "US")
			.then((weather) => actions.setWeather(weather))
			.catch((err) => {
				// A failed refresh must not erase a reading the app already has:
				// the stored forecast plus its timestamp is exactly what makes
				// this app work offline, and the error state hides it.
				if (hadReading) actions.setGeolocationStatus("completed");
				else actions.setGeolocationError(err.message || "Failed to refresh weather data");
			});
	}

	render();

	// The PWA module (static/fleet_pwa.js, vendored). Started from a module,
	// never an inline <script>; fleet_pwa.js is a deferred classic script in the
	// head, so the global is already there by the time this module body runs.
	window.fleetPWA?.start({ serviceWorker: "/sw.js" });
}

document.addEventListener("DOMContentLoaded", init);
