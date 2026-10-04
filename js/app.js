import { getState, subscribe, actions, isReadyToCalculate } from "./store.js";
import { findOptimalTimeSlicing } from "./calculations.js";
import { fetchWeatherData, getCurrentPosition, reverseGeocode, searchLocations } from "./services.js";
import { drawBurnChart, drawUVChart, renderUVLegend } from "./charts.js";
import { resolveUvSource, sourceLabel, sourceBadge, refusalCopy, UV_FRESH_MS } from "./uv_source.js";
import { uvBand, effectiveStart, summarizeAnswer, durationParts, skyPhase, dayWindow } from "./answer.js";
import {
	FitzpatrickType, SKIN_TYPE_CONFIG, SPFLevel, SPF_CONFIG,
	SweatLevel, SWEAT_CONFIG, SWEAT_INDEX_BANDS,
} from "./config.js";
import {
	el, formatInTimeZone, getFractionalHoursInTimezone,
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
// Draws the charts of the last render into their canvases; resize re-runs it.
let drawCharts = null;

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
	const state = getState();
	const answer = computeAnswer(state);
	renderTopbar(state);
	syncSettings(state);
	renderHero(state, answer);
	renderDetails(state, answer);
	setSky(state);
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
		const result = findOptimalTimeSlicing({
			uvSource: source,
			timezone: source.timezone,
			placeName: state.geolocation.placeName,
			currentTime: startTime,
			skinType: state.skinType,
			spfLevel: state.spfLevel,
			sweatLevel: state.sweatLevel || SweatLevel.LOW,
		});
		currentCalculation = result;
		return { kind: "answer", source, result, startTime };
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
		hero.className = "hero is-refusal";
		renderRefusal(hero, answer.failed ? null : answer.source);
		return;
	}

	if (answer.kind === "waiting") {
		if (geo.status === "error") {
			hero.className = "hero is-refusal";
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
			hero.className = "hero";
			hero.append(
				el("p", { class: "hero-lead" }, "Where are you?"),
				el("p", { class: "hero-sub" }, "The answer depends on the UV where you are."),
				el("div", { class: "hero-foot" },
					el("button", { class: "btn btn-primary", type: "button", onclick: openPlaceSheet }, "Choose a place")),
			);
			return;
		}
		hero.className = "hero is-loading";
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
	hero.className = `hero band-${band.key}${live ? "" : " is-stale"}${timer.startTime !== null ? " has-timer" : ""}`;

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
		? ["from ", el("strong", {}, new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(startTime)), " "]
		: [];
	if (summary.kind === "burn") {
		hero.append(
			el("p", { class: "hero-lead" }, "Safe in the sun for"),
			durationNumber(summary.safeMs),
			el("p", { class: "hero-sub" }, ...from,
				"until ", el("strong", {}, formatInTimeZone(summary.burnTime, tz, "h:mm a")),
				summary.highRisk ? " — then find shade" : ""),
			el("p", { class: "hero-env" },
				`Shade ${summary.envTimes.shade} · Beach ${summary.envTimes.sand} · Snow ${summary.envTimes.snow}`),
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
function segmented(container, options, onPick) {
	for (const option of options) {
		const button = el("button", {
			class: "seg-item", type: "button", "aria-pressed": "false", dataset: { value: option.value },
			title: option.title || null, "aria-label": option.aria || null,
		}, ...option.content);
		button.addEventListener("click", () => onPick(option.value));
		container.append(button);
	}
}

function buildSettings() {
	segmented(document.getElementById("seg-skin"), Object.values(FitzpatrickType).map((type) => {
		const swatch = el("span", { class: "skin-swatch" });
		swatch.style.background = SKIN_TYPE_CONFIG[type].color;
		return { value: type, content: [swatch, type], aria: `Type ${type}, ${SKIN_TYPE_CONFIG[type].subtitle}`, title: SKIN_TYPE_CONFIG[type].subtitle };
	}), (type) => actions.setSkinType(type));

	segmented(document.getElementById("seg-spf"), Object.values(SPFLevel).map((level) => ({
		value: level,
		content: [level === SPFLevel.NONE ? "None" : SPF_CONFIG[level].label.replace("SPF ", "")],
		aria: level === SPFLevel.NONE ? "No sunscreen" : SPF_CONFIG[level].label,
	})), (level) => actions.setSPFLevel(level));

	const sweatWords = { [SweatLevel.LOW]: "None", [SweatLevel.MEDIUM]: "Some", [SweatLevel.HIGH]: "Lots" };
	segmented(document.getElementById("seg-sweat"), Object.values(SweatLevel).map((level) => ({
		value: level, content: [sweatWords[level]], aria: `${sweatWords[level]} sweating`,
	})), (level) => actions.setSweatLevel(level));

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

function syncSettings(state) {
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
		? new Intl.DateTimeFormat("en-US", { timeZone: state.geolocation.weather?.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(planned)
		: "Later…";
	const input = document.getElementById("start-input");
	if (document.activeElement !== input) input.value = toLocalInputValue(isPlanned ? planned : new Date());
	input.min = toLocalInputValue(new Date());
	const lastForecast = state.geolocation.weather?.hourly?.at(-1);
	if (lastForecast) input.max = toLocalInputValue(new Date(lastForecast.dt * 1000));
}

function openSkinGuide(event) {
	event.preventDefault();
	const guide = document.getElementById("skin-guide");
	guide.open = true;
	guide.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Details: charts, the sun, conditions ---------- */

function renderDetails(state, answer) {
	const details = document.getElementById("details");
	details.replaceChildren();
	const geo = state.geolocation;
	drawCharts = null;

	if (answer.kind === "answer") {
		const { source, result, startTime } = answer;
		const tz = source.timezone;
		const hours = dayWindow(source.hourly, startTime.getTime(), tz);
		const peak = hours.reduce((best, h) => (h.uvi > best.uvi ? h : best), hours[0]);
		// "Current" is the reading's own word for itself; when the reading is
		// not live it is labelled by the hour it was read, never as what is
		// happening outside right now.
		const currentLabel = source.mode === "live" ? "Now"
			: source.mode === "manual" ? "Entered"
			: `At ${formatInTimeZone(new Date(source.readAt), tz, "h:mm a")}`;
		details.append(el("section", { class: "card span-2" },
			el("div", { class: "card-head" },
				el("h2", { class: "card-title" }, "UV through the day"),
				el("span", { class: "card-meta" }, `${currentLabel} ${source.currentUvi.toFixed(1)} · Peak ${peak.uvi.toFixed(1)} at ${formatInTimeZone(new Date(peak.dt * 1000), tz, "h a")}`)),
			el("div", { class: "chart-wrap" }, el("canvas", { id: "uv-chart", role: "img", "aria-label": "UV index by hour" })),
			el("div", { class: "uv-legend", id: "uv-legend" }),
		));
		details.append(el("section", { class: "card" },
			el("div", { class: "card-head" },
				el("h2", { class: "card-title" }, "Your burn dose"),
				el("span", { class: "card-meta" }, result.burnTime ? "Reaches 100% — a burn" : "100% is a burn")),
			el("div", { class: "chart-wrap tall" }, el("canvas", { id: "burn-chart", role: "img", "aria-label": "Burn dose over time" })),
			el("p", { class: "chart-note" }, "How the dose builds from your start time, for your skin type and sunscreen."),
		));
		// The UV chart is handed the RESOLVED series, not the stored weather:
		// with a hand-typed index there is no stored series at all, and with an
		// acknowledged one the chart must plot exactly the numbers the burn
		// time came from.
		drawCharts = () => {
			drawBurnChart(document.getElementById("burn-chart"), result, tz);
			drawUVChart(document.getElementById("uv-chart"), { hourly: hours }, result, tz, currentTimeTick);
			renderUVLegend(document.getElementById("uv-legend"));
		};
	}
	if (geo.weather) details.append(renderConditions(state, geo.weather, geo.weatherFetchedAt));
	const sun = renderSunCard(state);
	if (sun) details.append(sun);
	if (drawCharts) requestAnimationFrame(drawCharts);
}

function readAtText(readAt, tz) {
	return `Read at ${formatInTimeZone(new Date(readAt), tz, "h:mm a")} · ${formatDistanceToNow(readAt)}`;
}

function renderConditions(state, weather, readAt) {
	// Every number on this card is a measurement with a time on it, and the
	// app opens offline on readings that may be hours old: it is "current"
	// only while it is live.
	const live = readAt != null && Date.now() - readAt <= UV_FRESH_MS;
	const tz = weather.timezone;
	const unit = state.units || weather.temperatureUnit;
	const card = el("section", { class: `card${live ? "" : " is-stale"}` });
	card.append(el("div", { class: "card-head" },
		el("h2", { class: "card-title" }, live ? "Weather now" : "Last weather read"),
		el("span", { class: "card-meta" }, `${state.geolocation.placeName || ""}${weather.elevation != null ? ` · ${formatElevation(weather.elevation, state.geolocation.countryCode || "US")}` : ""}`),
	));

	const units = el("div", { class: "seg units", role: "group", "aria-label": "Temperature unit" });
	segmented(units, [
		{ value: "celsius", content: ["°C"], aria: "Celsius" },
		{ value: "fahrenheit", content: ["°F"], aria: "Fahrenheit" },
	], (value) => actions.setUnits(value));
	pressValue(units, unit);
	card.append(el("div", { class: "conditions-head", style: "margin-top:10px" },
		el("span", { html: weatherIconSvg(weather.current.weather[0]?.id, 28) }),
		el("div", {},
			el("p", { class: "weather-desc" }, weather.current.weather[0]?.description || "Clear"),
			readAt != null ? el("p", { class: `read-at${live ? "" : " stale"}`, dataset: { readAt: String(readAt), tz: tz || "" } }, readAtText(readAt, tz)) : null),
		units,
	));

	const grid = el("div", { class: "conditions" });
	const stat = (label, value, desc) => el("div", {},
		el("p", { class: "condition-label" }, label),
		el("p", { class: "condition-value" }, value),
		desc ? el("p", { class: "condition-desc" }, desc) : null);
	grid.append(stat("Temperature", formatTemperature(weather.current.temp, weather.temperatureUnit, unit)));
	grid.append(stat("UV index", String(weather.current.uvi), uvBand(weather.current.uvi).label));
	if (weather.current.dewPoint !== undefined) {
		grid.append(stat("Dew point", formatTemperature(weather.current.dewPoint, weather.temperatureUnit, unit)));
		const si = getSweatIndexDetails(calculateSweatIndex(weather.current.temp, weather.current.dewPoint, weather.temperatureUnit));
		grid.append(stat("Sweat index", String(si.value), si.label));
	}
	if (weather.aqi) grid.append(stat("Air quality", `AQI ${weather.aqi.us_aqi}`, aqiLabel(weather.aqi.us_aqi)));
	card.append(grid);
	return card;
}

function aqiLabel(aqi) {
	if (aqi <= 50) return "Good";
	if (aqi <= 100) return "Moderate";
	if (aqi <= 150) return "Unhealthy for some";
	if (aqi <= 200) return "Unhealthy";
	if (aqi <= 300) return "Very unhealthy";
	return "Hazardous";
}

function renderSunCard(state) {
	const geo = state.geolocation;
	if (!geo.weather || !geo.position) return null;
	const w = geo.weather;
	const tz = w.timezone;
	const sunriseTime = new Date(w.sunrise);
	const sunsetTime = new Date(w.sunset);
	const nextSunriseTime = w.nextSunrise ? new Date(w.nextSunrise) : null;
	// Sunrise and sunset come from the stored forecast's FIRST day, so once
	// that day is over they describe yesterday: the arc would place the sun by
	// yesterday's clock and the card would state a wrong "sunset in". A stored
	// reading can legitimately be that old now that the app opens offline, so
	// the card removes itself rather than drawing a stale sky.
	if (nextSunriseTime && currentTimeTick.getTime() >= nextSunriseTime.getTime()) return null;
	const totalDuration = sunsetTime.getTime() - sunriseTime.getTime();

	const latitude = geo.position.latitude;
	const dayOfYear = Math.floor((sunriseTime.getTime() - new Date(sunriseTime.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
	const declination = -23.45 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
	const maxElevation = 90 - Math.abs(latitude - declination);
	const zenithScale = Math.max(0.2, Math.min(1, maxElevation / 75));

	const now = currentTimeTick.getTime();
	const isDay = now >= sunriseTime.getTime() && now <= sunsetTime.getTime();
	let remaining = "";
	if (isDay) remaining = `Sunset in ${formatDurationShort(sunsetTime.getTime() - now)}`;
	else if (now < sunriseTime.getTime()) remaining = `Sunrise in ${formatDurationShort(sunriseTime.getTime() - now)}`;
	else if (nextSunriseTime) remaining = `Sunrise in ${formatDurationShort(nextSunriseTime.getTime() - now)}`;

	const sunriseHour = getFractionalHoursInTimezone(sunriseTime, tz);
	const sunsetHour = getFractionalHoursInTimezone(sunsetTime, tz);
	const width = 280, height = 100;
	const centerX = width / 2, centerY = height - 10;
	const startX = 25, endX = width - 25;
	const controlY = centerY - Math.round(30 + 45 * zenithScale) * 1.3;
	const t = Math.max(0, Math.min(1, (getFractionalHoursInTimezone(now, tz) - sunriseHour) / (sunsetHour - sunriseHour)));
	const bez = (p, a, b, c) => (1 - p) * (1 - p) * a + 2 * (1 - p) * p * b + p * p * c;
	const sunX = bez(t, startX, centerX, endX);
	const sunY = bez(t, centerY, controlY, centerY);
	const arc = Array.from({ length: 31 }, (_, i) => `${bez(i / 30, startX, centerX, endX)},${bez(i / 30, centerY, controlY, centerY)}`);

	const card = el("section", { class: "card sun-card span-2" });
	card.append(el("div", { class: "card-head" },
		el("h2", { class: "card-title" }, "The sun today"),
		el("span", { class: "card-meta" }, remaining)));
	const svg = el("div", { class: "sun-svg-wrap" });
	svg.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
		<line x1="10" y1="${centerY}" x2="${width - 10}" y2="${centerY}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="4 3"/>
		<polyline points="${arc.join(" ")}" fill="none" stroke="var(--uv-moderate)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="${isDay ? 1 : 0.4}"/>
		${isDay ? `<circle cx="${sunX}" cy="${sunY}" r="16" fill="var(--uv-moderate)" opacity="0.25"/><circle cx="${sunX}" cy="${sunY}" r="9" fill="var(--uv-moderate)"/>` : ""}
	</svg>`;
	card.append(svg);
	card.append(el("div", { class: "sun-labels" },
		el("span", { html: icon("sunrise", 16) + `<span>${formatInTimeZone(sunriseTime, tz, "h:mm a")}</span>` }),
		el("span", {}, isDay ? `${formatDurationShort(totalDuration)} of daylight` : `Night · ${formatInTimeZone(currentTimeTick, tz, "h:mm a")}`),
		el("span", { html: `<span>${formatInTimeZone(sunsetTime, tz, "h:mm a")}</span>` + icon("sunset", 16) }),
	));
	return card;
}

/* ---------- Place sheet ---------- */

let placeSheetOpenedAt = 0;

function openPlaceSheet() {
	const dialog = document.getElementById("place-dialog");
	const state = getState();
	const w = state.geolocation.weather;
	setPlaceNote(state.geolocation.placeName
		? `Now: ${state.geolocation.placeName}${w?.elevation != null ? ` · ${formatElevation(w.elevation, state.geolocation.countryCode || "US")} elevation` : ""}`
		: "");
	placeSheetOpenedAt = performance.now();
	dialog.showModal();
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
	document.getElementById("place-close").addEventListener("click", () => dialog.close());
	// A tap on the backdrop closes the sheet — but not the compatibility click
	// that a touch which OPENED it can deliver to whatever it just mounted.
	dialog.addEventListener("click", (e) => {
		if (e.target !== dialog || performance.now() - placeSheetOpenedAt < 350) return;
		const r = dialog.getBoundingClientRect();
		if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
	});
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

		if (state.geolocation.weather) {
			const sun = document.querySelector(".sun-card");
			const fresh = renderSunCard(state);
			if (sun && fresh) sun.replaceWith(fresh);
			else if (sun) sun.remove();
			const uvCanvas = document.getElementById("uv-chart");
			if (uvCanvas && currentCalculation) {
				const source = resolveUvSource(state, currentTimeTick, effectiveStart(state.activityStart, new Date()));
				if (source.usable) drawUVChart(uvCanvas, { hourly: dayWindow(source.hourly, effectiveStart(state.activityStart, new Date()).getTime(), source.timezone) }, currentCalculation, source.timezone, currentTimeTick);
			}
			setSky(state);
		}
		for (const node of document.querySelectorAll(".read-at[data-read-at]")) {
			node.textContent = readAtText(Number(node.dataset.readAt), node.dataset.tz || undefined);
		}
		const when = document.querySelector(".hero-when");
		if (when && when.textContent.startsWith("Now") && state.geolocation.weather) {
			when.textContent = `Now · ${formatInTimeZone(currentTimeTick, state.geolocation.weather.timezone, "h:mm a")}`;
		}
	}, 60000);

	// Redraw the charts at their new width, into the canvases already there.
	// Height-only resizes (a phone's URL bar sliding away) are ignored, and
	// nothing is rebuilt: a rebuild mid-capture or mid-scroll shows empty
	// canvases for a frame.
	let resizeFrame = 0;
	let lastWidth = innerWidth;
	window.addEventListener("resize", () => {
		if (innerWidth === lastWidth) return;
		lastWidth = innerWidth;
		cancelAnimationFrame(resizeFrame);
		resizeFrame = requestAnimationFrame(() => drawCharts?.());
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
