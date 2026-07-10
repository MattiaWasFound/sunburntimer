import { getState, subscribe, actions, isReadyToCalculate } from "./store.js";
import { findOptimalTimeSlicing } from "./calculations.js";
import { fetchWeatherData, getCurrentPosition, reverseGeocode, searchLocations } from "./services.js";
import { drawBurnChart, drawUVChart, renderUVLegend } from "./charts.js";
import {
	FitzpatrickType, SKIN_TYPE_CONFIG, SPFLevel, SPF_CONFIG,
	SweatLevel, SWEAT_CONFIG, CALCULATION_CONSTANTS, SWEAT_INDEX_BANDS,
} from "./config.js";
import {
	el, formatInTimeZone, getHoursInTimezone, getFractionalHoursInTimezone,
	formatDuration, formatDurationShort, formatElapsedTime, calculateEnvironmentalTimes,
	formatElevation, formatTemperature, getTemperatureUnitForCountry,
	calculateSweatIndex, getSweatIndexDetails, getUVIndexColor, getUVRiskLevel,
	getAQIColor, getWeatherDescription, getWeatherIconName, formatDistanceToNow,
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
	return icon(ic.name, size || 32, ic.color);
}

/* ================================================================ */
/*  Timer state (module-scoped, not persisted)                      */
/* ================================================================ */

let timer = { isRunning: false, startTime: null, elapsedMs: 0, accumulatedDamage: 0 };
let timerInterval = null;
let currentTimeTick = new Date();
let currentTimeInterval = null;
let currentCalculation = null;

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
	const hasPreloadedPrefs = !!(state.skinType && state.spfLevel);

	renderSteps(state, hasPreloadedPrefs);
	renderResults(state);
}

function renderSteps(state, hasPreloadedPrefs) {
	const step1Body = document.getElementById("step1-body");
	const step2Body = document.getElementById("step2-body");
	const step3Body = document.getElementById("step3-body");

	if (step1Body) {
		step1Body.innerHTML = "";
		step1Body.appendChild(renderSkinTypeSelector(state));
	}
	if (step2Body) {
		step2Body.innerHTML = "";
		step2Body.appendChild(renderSPFSection(state));
	}

	// Auto-expand/collapse
	const step1 = document.getElementById("step1");
	const step2 = document.getElementById("step2");
	const step3 = document.getElementById("step3");
	if (step1 && step2 && step3) {
		if (!hasPreloadedPrefs) {
			setAccordionOpen("step1", true);
			setAccordionOpen("step2", true);
			setAccordionOpen("step3", true);
		}
	}

	updateStepHeaders(state);
	if (step3Body) {
		step3Body.innerHTML = "";
		step3Body.appendChild(renderLocationSection(state));
	}
}

function setAccordionOpen(id, open) {
	const item = document.getElementById(id);
	if (!item) return;
	const body = item.querySelector(".accordion-body");
	const trigger = item.querySelector(".accordion-trigger");
	if (open) {
		body.classList.add("open");
		trigger.classList.add("open");
	} else {
		body.classList.remove("open");
		trigger.classList.remove("open");
	}
}

function toggleAccordion(id) {
	const item = document.getElementById(id);
	if (!item) return;
	const body = item.querySelector(".accordion-body");
	const trigger = item.querySelector(".accordion-trigger");
	body.classList.toggle("open");
	trigger.classList.toggle("open");
}

function updateStepHeaders(state) {
	const skinBadge = document.getElementById("step1-badge");
	const spfBadge = document.getElementById("step2-badge");
	const locBadge = document.getElementById("step3-badge");

	if (skinBadge) {
		skinBadge.style.display = state.skinType ? "" : "none";
		if (state.skinType) skinBadge.textContent = `Type ${state.skinType}`;
	}
	if (spfBadge) {
		spfBadge.style.display = state.spfLevel ? "" : "none";
		if (state.spfLevel) {
			let txt = SPF_CONFIG[state.spfLevel].label;
			if (state.spfLevel !== SPFLevel.NONE && state.sweatLevel) txt += ` \u00B7 ${SWEAT_CONFIG[state.sweatLevel].label} activity`;
			spfBadge.textContent = txt;
		}
	}
	if (locBadge) {
		const completed = state.geolocation.status === "completed";
		locBadge.style.display = completed ? "" : "none";
		if (completed && state.geolocation.placeName && state.geolocation.weather) {
			locBadge.innerHTML = "";
			const w = state.geolocation.weather;
			const parts = [];
			parts.push(makeBadge(state.geolocation.placeName, "badge-outline badge-truncate"));
			const uvc = getUVIndexColor(w.current.uvi);
			parts.push(makeBadge(`UV ${w.current.uvi}`, "badge-uv", { backgroundColor: uvc.bg, color: uvc.text }));
			if (w.aqi) {
				const ac = getAQIColor(w.aqi.us_aqi);
				parts.push(makeBadge(`AQI ${w.aqi.us_aqi}`, "badge-uv", { backgroundColor: ac.bg, color: ac.text }));
			}
			const locDiv = el("div", { class: "badge-row" }, ...parts);
			locBadge.appendChild(locDiv);
			if (state.geolocation.lastFetched || w.current.dt) {
				const ts = state.geolocation.lastFetched || w.current.dt * 1000;
				locBadge.appendChild(el("div", { class: "updated-time" }, `Updated ${formatDistanceToNow(ts)}`));
			}
		}
	}

	// Step 3 loading state
	const step3Trigger = document.getElementById("step3")?.querySelector(".accordion-trigger");
	if (step3Trigger) {
		const loading = state.geolocation.status === "fetching_location" || state.geolocation.status === "fetching_weather";
		step3Trigger.classList.toggle("loading", loading);
	}
}

function makeBadge(text, cls, style) {
	const b = el("span", { class: cls || "badge" }, text);
	if (style) Object.assign(b.style, style);
	return b;
}

/* ---------- Step 1: Skin Type ---------- */

function renderSkinTypeSelector(state) {
	const wrap = el("div", { class: "skin-type-scroll-wrap" });
	const scroll = el("div", { class: "skin-type-scroll" });
	for (const type of Object.values(FitzpatrickType)) {
		const cfg = SKIN_TYPE_CONFIG[type];
		const selected = state.skinType === type;
		const card = el("div", {
			class: `skin-type-card${selected ? " selected" : ""}`,
			dataset: { type },
			onclick: () => { actions.setSkinType(type); scrollCardIntoView(scroll, type); },
			role: "button",
			tabindex: "0",
		});
		const stripe = el("div", { class: "skin-stripe" });
		stripe.style.backgroundColor = cfg.color;
		card.appendChild(stripe);
		const content = el("div", { class: "skin-card-content" });
		const header = el("div", { class: "skin-card-header" });
		const headerLeft = el("div", { class: "skin-card-header-left" });
		headerLeft.appendChild(el("span", { class: "skin-emoji" }, cfg.emoji));
		headerLeft.appendChild(el("span", { class: "skin-type-badge" }, `Type ${type}`));
		headerLeft.appendChild(el("span", { class: "skin-subtitle" }, cfg.subtitle));
		header.appendChild(headerLeft);
		if (selected) {
			header.appendChild(el("div", { class: "check-circle" }));
			header.lastChild.innerHTML = icon("check", 16, "#fff");
		}
		content.appendChild(header);
		content.appendChild(el("div", { class: "skin-description" }, cfg.description));
		const attrs = el("div", { class: "skin-attrs" });
		attrs.appendChild(makeAttr("Hair", cfg.hairColors.join(", ")));
		attrs.appendChild(makeAttr("Eyes", cfg.eyeColors.join(", ")));
		attrs.appendChild(makeAttr("Freckles", cfg.freckles));
		content.appendChild(attrs);
		card.appendChild(content);
		scroll.appendChild(card);
	}
	wrap.appendChild(scroll);
	wrap.appendChild(el("div", { class: "skin-scroll-hint" }, "Swipe to browse skin types"));
	return wrap;
}

function makeAttr(label, value) {
	return el("div", { class: "skin-attr" },
		el("div", { class: "skin-attr-label" }, label),
		el("div", { class: "skin-attr-value" }, value),
	);
}

function scrollCardIntoView(scroll, type) {
	const card = scroll.querySelector(`[data-type="${type}"]`);
	if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

/* ---------- Step 2: SPF + Sweat ---------- */

function renderSPFSection(state) {
	const wrap = el("div", { class: "step-inner" });
	const grid = el("div", { class: "spf-grid" });
	for (const level of Object.values(SPFLevel)) {
		const cfg = SPF_CONFIG[level];
		const selected = state.spfLevel === level;
		const card = el("div", {
			class: `selectable-card${selected ? " selected" : ""}`,
			onclick: () => actions.setSPFLevel(level),
			role: "button", tabindex: "0",
		});
		const badgeText = level === SPFLevel.NONE ? "0" : cfg.label.replace("SPF ", "");
		const inner = el("div", { class: "selectable-card-inner" });
		const left = el("div", { class: "selectable-card-left" });
		left.appendChild(el("span", { class: `spf-badge${selected ? " selected" : ""}` }, badgeText));
		left.appendChild(el("span", { class: "selectable-card-label" }, cfg.label));
		inner.appendChild(left);
		if (selected) {
			const check = el("div", { class: "check-circle primary" });
			check.innerHTML = icon("check", 16, "#fff");
			inner.appendChild(check);
		}
		card.appendChild(inner);
		grid.appendChild(card);
	}
	wrap.appendChild(grid);

	if (state.spfLevel !== undefined && state.spfLevel !== SPFLevel.NONE) {
		wrap.appendChild(el("div", { class: "alert alert-sun", html: icon("sun", 16, "#f59e0b") },
			el("div", { class: "alert-text" },
				el("strong", {}, "Remember: "),
				document.createTextNode("Reapply sunscreen every 2 hours or after swimming, sweating, or towel drying."),
			),
		));
		wrap.appendChild(el("h4", { class: "section-subtitle" }, "Activity Level"));
		wrap.appendChild(renderSweatSelector(state));
	}
	return wrap;
}

function renderSweatSelector(state) {
	const wrap = el("div", { class: "step-inner" });
	wrap.appendChild(el("p", { class: "muted-text" }, "How much will you be sweating? This affects how quickly your sunscreen wears off."));
	const list = el("div", { class: "sweat-list" });
	for (const level of Object.values(SweatLevel)) {
		const cfg = SWEAT_CONFIG[level];
		const selected = state.sweatLevel === level;
		const descriptions = {
			[SweatLevel.LOW]: "Minimal activity, no sweating",
			[SweatLevel.MEDIUM]: "Light exercise, some sweating",
			[SweatLevel.HIGH]: "Heavy exercise, profuse sweating",
		};
		const dropletCount = { [SweatLevel.LOW]: 0, [SweatLevel.MEDIUM]: 1, [SweatLevel.HIGH]: 3 }[level];
		const card = el("div", {
			class: `selectable-card${selected ? " selected" : ""}`,
			onclick: () => actions.setSweatLevel(level),
			role: "button", tabindex: "0",
		});
		const inner = el("div", { class: "selectable-card-inner" });
		const left = el("div", { class: "selectable-card-left" });
		const iconWrap = el("div", { class: `sweat-icon-wrap${selected ? " selected" : ""}` });
		for (let i = 0; i < 3; i++) {
			const drop = el("span", { class: i < dropletCount ? "sweat-drop active" : "sweat-drop inactive" });
			drop.innerHTML = icon("droplets", 12, selected ? "#fff" : (i < dropletCount ? "#f97316" : "rgba(0,0,0,0.15)"));
			iconWrap.appendChild(drop);
		}
		left.appendChild(iconWrap);
		const textWrap = el("div", { class: "sweat-text" });
		textWrap.appendChild(el("div", { class: "selectable-card-label" }, cfg.label));
		textWrap.appendChild(el("div", { class: "muted-text small" }, descriptions[level]));
		if (level !== SweatLevel.LOW) textWrap.appendChild(el("span", { class: "badge badge-outline badge-small" }, `SPF degrades after ${cfg.startHours}h`));
		left.appendChild(textWrap);
		inner.appendChild(left);
		if (selected) {
			const check = el("div", { class: "check-circle primary" });
			check.innerHTML = icon("check", 16, "#fff");
			inner.appendChild(check);
		}
		card.appendChild(inner);
		list.appendChild(card);
	}
	wrap.appendChild(list);
	if (state.sweatLevel && state.sweatLevel !== SweatLevel.LOW) {
		wrap.appendChild(el("div", { class: "alert alert-warning", html: icon("alertTriangle", 16, "#ca8a04") },
			el("div", { class: "alert-text" },
				el("strong", {}, "Note: "),
				document.createTextNode("Your sunscreen protection will gradually decrease due to sweating. Consider reapplying more frequently."),
			),
		));
	}
	return wrap;
}

/* ---------- Step 3: Location ---------- */

function renderLocationSection(state) {
	const wrap = el("div", { class: "step-inner location-section" });
	const btn = el("button", {
		class: "btn btn-outline btn-dashed location-btn",
		onclick: handleCurrentLocation,
		disabled: isLoading(state),
	});
	btn.innerHTML = icon("mapPin", 20) + "<span>Use Current Location</span>";
	wrap.appendChild(btn);

	const divider = el("div", { class: "divider" },
		el("div", { class: "divider-line" }),
		el("span", { class: "divider-text" }, "or"),
		el("div", { class: "divider-line" }),
	);
	wrap.appendChild(divider);

	wrap.appendChild(renderLocationSearch(isLoading(state)));

	const statusEl = renderLocationStatus(state);
	if (statusEl) wrap.appendChild(statusEl);
	return wrap;
}

function isLoading(state) {
	return state.geolocation.status === "fetching_location" || state.geolocation.status === "fetching_weather";
}

function renderLocationSearch(disabled) {
	const container = el("div", { class: "location-search" });
	const inputWrap = el("div", { class: "search-input-wrap" });
	inputWrap.innerHTML = icon("search", 16, "#94a3b8");
	const input = el("input", {
		type: "text", class: "search-input", placeholder: "Search for a city...",
		disabled: disabled ? "" : null, "aria-label": "Search for a city",
	});
	inputWrap.appendChild(input);
	const spinner = el("div", { class: "search-spinner" });
	spinner.innerHTML = icon("loader", 16, "#94a3b8");
	spinner.style.display = "none";
	inputWrap.appendChild(spinner);
	container.appendChild(inputWrap);

	const dropdown = el("div", { class: "search-dropdown" });
	dropdown.style.display = "none";
	container.appendChild(dropdown);

	let debounceTimer = null;
	let abortCtrl = null;
	let activeIndex = -1;
	let currentResults = [];

	input.addEventListener("input", () => {
		clearTimeout(debounceTimer);
		const q = input.value;
		if (q.length < 2) { dropdown.style.display = "none"; currentResults = []; return; }
		spinner.style.display = "";
		debounceTimer = setTimeout(async () => {
			if (abortCtrl) abortCtrl.abort();
			abortCtrl = new AbortController();
			try {
				const results = await searchLocations(q, abortCtrl.signal);
				currentResults = results;
				activeIndex = -1;
				renderDropdown(dropdown, results, activeIndex);
				spinner.style.display = "none";
			} catch (e) {
				if (e.name !== "AbortError") { spinner.style.display = "none"; }
			}
		}, 300);
	});

	input.addEventListener("keydown", (e) => {
		if (dropdown.style.display === "none") return;
		if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, currentResults.length - 1); renderDropdown(dropdown, currentResults, activeIndex); }
		else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); renderDropdown(dropdown, currentResults, activeIndex); }
		else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); selectLocation(currentResults[activeIndex]); input.value = ""; dropdown.style.display = "none"; }
		else if (e.key === "Escape") { dropdown.style.display = "none"; }
	});

	document.addEventListener("mousedown", (e) => {
		if (!container.contains(e.target)) dropdown.style.display = "none";
	});

	function selectLocation(result) {
		const position = { latitude: result.latitude, longitude: result.longitude };
		const placeName = result.admin1 ? `${result.name}, ${result.admin1}` : result.name;
		actions.setPosition(position, placeName, result.countryCode);
		actions.setGeolocationStatus("fetching_weather");
		fetchWeatherData(position, result.countryCode)
			.then((weather) => actions.setWeather(weather))
			.catch((err) => actions.setGeolocationError(err.message || "Failed to fetch weather"));
	}

	function renderDropdown(dd, results, active) {
		dd.innerHTML = "";
		if (results.length === 0) { dd.style.display = "none"; return; }
		dd.style.display = "";
		results.forEach((r, i) => {
			const parts = [r.name];
			if (r.admin1) parts.push(r.admin1);
			parts.push(r.country);
			const item = el("div", { class: `search-result${i === active ? " active" : ""}` }, parts.join(", "));
			item.addEventListener("mousedown", (e) => { e.preventDefault(); selectLocation(r); input.value = ""; dd.style.display = "none"; });
			dd.appendChild(item);
		});
	}

	return container;
}

function renderLocationStatus(state) {
	const geo = state.geolocation;
	switch (geo.status) {
		case "blank":
			return el("div", { class: "card card-body location-blank" },
				el("div", { class: "location-blank-icon", html: icon("mapPin", 48, "#94a3b8") }),
				el("p", { class: "muted-text" }, "Choose your location to get weather data"),
			);
		case "fetching_location":
			return el("div", { class: "location-status loading-bar" },
				el("div", { class: "loading-row" },
					el("div", { class: "spinner blue", html: icon("loader", 20, "#2563eb") }),
					el("span", { class: "loading-text" }, "Getting your location..."),
				),
				renderLoadingWeatherCard(),
			);
		case "fetching_weather":
			return el("div", { class: "location-status loading-bar" },
				el("div", { class: "loading-row" },
					el("div", { class: "spinner blue", html: icon("loader", 20, "#2563eb") }),
					el("span", { class: "loading-text" }, "Fetching weather data..."),
				),
				renderLoadingWeatherCard(),
			);
		case "completed":
			return renderCompletedLocation(geo);
		case "error":
			return el("div", { class: "alert alert-error" },
				el("div", { html: icon("alertCircle", 20, "#dc2626") }),
				el("div", {},
					el("p", { class: "alert-title" }, "Error"),
					el("p", { class: "alert-desc" }, geo.error || "An error occurred"),
				),
			);
		default:
			return null;
	}
}

function renderLoadingWeatherCard() {
	return el("div", { class: "card card-body weather-loading" },
		el("div", { class: "weather-card-row" },
			el("div", { class: "weather-card-left" },
				el("div", { class: "weather-card-icon gray", html: icon("cloud", 32, "#cbd5e1") }),
				el("div", {},
					el("p", { class: "muted-text small" }, "Current Weather"),
					el("p", { class: "muted-text small" }, "Loading..."),
				),
			),
			el("div", { class: "weather-card-right" },
				el("p", { class: "weather-temp gray" }, "--\u00B0"),
				el("p", { class: "muted-text small" }, "Loading..."),
			),
		),
	);
}

function renderCompletedLocation(geo) {
	const wrap = el("div", { class: "location-completed" });
	const status = el("div", { class: "location-completed-bar" });
	status.appendChild(el("div", { html: icon("checkCircle", 20, "#16a34a") }));
	const textDiv = el("div", { class: "location-completed-text" });
	textDiv.appendChild(el("span", { class: "location-place-name" }, geo.placeName || ""));
	if (geo.weather) textDiv.appendChild(el("p", { class: "muted-text small" }, `${formatElevation(geo.weather.elevation, geo.countryCode || "US")} elevation`));
	status.appendChild(textDiv);
	const changeBtn = el("button", { class: "btn btn-outline btn-sm", onclick: () => actions.setGeolocationStatus("blank") }, "Change");
	changeBtn.innerHTML = icon("edit", 16) + "<span>Change</span>";
	status.appendChild(changeBtn);
	wrap.appendChild(status);
	if (geo.weather) wrap.appendChild(renderCurrentConditions(geo.weather));
	return wrap;
}

function renderCurrentConditions(weather) {
	const card = el("div", { class: "card card-body current-conditions" });
	const row = el("div", { class: "cc-row" });
	const left = el("div", { class: "cc-left" });
	const wIcon = getWeatherIconName(weather.current.weather[0]?.id);
	const iconDiv = el("div", { class: "cc-icon" });
	iconDiv.innerHTML = weatherIconSvg(weather.current.weather[0]?.id, 32);
	left.appendChild(iconDiv);
	left.appendChild(el("div", {},
		el("p", { class: "muted-text small" }, "Current Weather"),
		el("p", { class: "cc-weather-desc" }, weather.current.weather[0]?.description || "Clear"),
	));
	row.appendChild(left);

	const grid = el("div", { class: "cc-grid" });
	grid.appendChild(makeStat("Temp", formatTemperature(weather.current.temp, weather.temperatureUnit)));
	if (weather.current.dewPoint !== undefined) grid.appendChild(makeStat("Dew point", formatTemperature(weather.current.dewPoint, weather.temperatureUnit)));
	grid.appendChild(makeStat("UV Index", String(weather.current.uvi)));
	if (weather.current.dewPoint !== undefined) {
		const si = getSweatIndexDetails(calculateSweatIndex(weather.current.temp, weather.current.dewPoint, weather.temperatureUnit));
		const statDiv = el("div", {});
		statDiv.appendChild(el("p", { class: "cc-stat-label" }, "Sweat Index"));
		statDiv.appendChild(el("p", { class: "cc-stat-value" }, String(si.value)));
		statDiv.appendChild(el("p", { class: `cc-stat-desc ${si.textClass}` }, si.description));
		grid.appendChild(statDiv);
	}
	row.appendChild(grid);
	card.appendChild(row);
	return card;
}

function makeStat(label, value) {
	return el("div", {},
		el("p", { class: "cc-stat-label" }, label),
		el("p", { class: "cc-stat-value" }, value),
	);
}

/* ---------- Results ---------- */

function renderResults(state) {
	const container = document.getElementById("results");
	if (!container) return;

	if (!isReadyToCalculate() || !state.geolocation.weather || !state.geolocation.placeName || !state.skinType || !state.spfLevel) {
		container.style.display = "none";
		return;
	}

	const input = {
		weather: state.geolocation.weather,
		placeName: state.geolocation.placeName,
		currentTime: new Date(),
		skinType: state.skinType,
		spfLevel: state.spfLevel,
		sweatLevel: state.sweatLevel || "LOW",
	};
	const result = findOptimalTimeSlicing(input);
	currentCalculation = result;

	container.style.display = "";
	container.innerHTML = "";

	const header = el("div", { class: "results-header" });
	header.appendChild(el("h2", {}, "Safe Sun Exposure Time"));
	const refreshBtn = el("button", {
		class: "btn btn-outline",
		onclick: handleRefresh,
		disabled: state.geolocation.status === "fetching_weather" ? "" : null,
	});
	const spinClass = state.geolocation.status === "fetching_weather" ? " spinning" : "";
	refreshBtn.innerHTML = icon("refresh", 16) + `<span>Refresh</span>`;
	if (spinClass) refreshBtn.querySelector("svg").classList.add("spinning");
	header.appendChild(refreshBtn);
	container.appendChild(header);

	container.appendChild(renderResultsDisplay(result, state.geolocation.weather?.timezone));

	const chartsGrid = el("div", { class: "charts-grid" });
	const burnCard = el("div", { class: "card chart-card" });
	burnCard.appendChild(el("div", { class: "card-header" },
		el("span", { class: "card-title" }, "Skin Damage Over Time"),
		result.burnTime ? el("span", { class: "burn-threshold-badge" }, "Burn threshold reached") : null,
	));
	const burnCanvasWrap = el("div", { class: "chart-canvas-wrap" });
	const burnCanvas = el("canvas", { id: "burn-chart" });
	burnCanvasWrap.appendChild(burnCanvas);
	burnCard.appendChild(burnCanvasWrap);
	burnCard.appendChild(el("p", { class: "chart-desc muted-text small" }, "This chart shows how skin damage accumulates over time based on UV exposure, your skin type, and sun protection factors."));
	chartsGrid.appendChild(burnCard);

	const uvCard = el("div", { class: "card chart-card" });
	const uvHeader = el("div", { class: "card-header" });
	uvHeader.appendChild(el("span", { class: "card-title" }, "UV Index Throughout the Day"));
	const uvStats = el("div", { class: "uv-stats" });
	const currentUV = state.geolocation.weather.current.uvi;
	const maxUV = Math.max(...state.geolocation.weather.hourly.map((h) => h.uvi));
	uvStats.appendChild(el("div", { class: "uv-stat" }, el("p", { class: "uv-stat-label" }, "Current"), el("p", { class: `uv-stat-value ${getUVColorClass(currentUV)}` }, currentUV.toFixed(1))));
	uvStats.appendChild(el("div", { class: "uv-stat" }, el("p", { class: "uv-stat-label" }, "Peak"), el("p", { class: `uv-stat-value ${getUVColorClass(maxUV)}` }, maxUV.toFixed(1))));
	uvHeader.appendChild(uvStats);
	uvCard.appendChild(uvHeader);
	const uvCanvasWrap = el("div", { class: "chart-canvas-wrap chart-sm" });
	const uvCanvas = el("canvas", { id: "uv-chart" });
	uvCanvasWrap.appendChild(uvCanvas);
	uvCard.appendChild(uvCanvasWrap);
	const legend = el("div", { class: "uv-legend", id: "uv-legend" });
	uvCard.appendChild(legend);
	uvCard.appendChild(el("p", { class: "chart-desc muted-text small" }, "The UV Index measures the strength of ultraviolet radiation. Higher values indicate greater risk of sunburn and need for protection."));
	chartsGrid.appendChild(uvCard);
	container.appendChild(chartsGrid);

	container.appendChild(renderSunPositionCard(state));
	container.appendChild(renderTimerCard(result));

	// Draw charts after DOM is attached
	requestAnimationFrame(() => {
		drawBurnChart(document.getElementById("burn-chart"), result, state.geolocation.weather?.timezone);
		drawUVChart(document.getElementById("uv-chart"), state.geolocation.weather, result, state.geolocation.weather?.timezone, currentTimeTick);
		renderUVLegend(document.getElementById("uv-legend"));
	});
}

function getUVColorClass(uv) {
	if (uv < 3) return "text-green";
	if (uv < 6) return "text-yellow";
	if (uv < 8) return "text-orange";
	if (uv < 11) return "text-red";
	return "text-purple";
}

function renderResultsDisplay(result, timezone) {
	const { burnTime, startTime, points, advice } = result;
	const card = el("div", { class: "card card-body results-display" });
	const center = el("div", { class: "results-center" });

	let finalDamage = 0;
	if (points.length > 0) {
		const last = points[points.length - 1];
		finalDamage = (last.totalDamageAtStart || 0) + (last.burnCost || 0);
	}

	let safeTime = null;
	if (startTime && burnTime) {
		const isNextDay = new Date(burnTime).getDate() !== new Date(startTime).getDate();
		safeTime = isNextDay ? "unlikely" : formatDuration(burnTime.getTime() - startTime.getTime());
	}

	const envTimes = (startTime && burnTime && safeTime !== "unlikely") ? calculateEnvironmentalTimes(startTime, burnTime) : null;

	const isHighRisk = (() => {
		if (safeTime === "unlikely") return false;
		const isDamageHigh = finalDamage >= CALCULATION_CONSTANTS.SAFETY_THRESHOLD;
		const isQuickBurn = burnTime && startTime ? (burnTime.getTime() - startTime.getTime()) / (1000 * 60 * 60) < CALCULATION_CONSTANTS.HIGH_RISK_TIME_LIMIT_HOURS : false;
		const burnHour = burnTime ? getHoursInTimezone(burnTime, timezone) : 0;
		const isHighUVPeriod = burnTime ? burnHour < CALCULATION_CONSTANTS.EVENING_RISK_CUTOFF_HOUR : true;
		return isDamageHigh && isQuickBurn && isHighUVPeriod;
	})();

	const iconDiv = el("div", { class: "results-icon" });
	iconDiv.innerHTML = isHighRisk ? icon("sun", 32, "#f97316") : icon("checkCircle", 32, "#16a34a");

	const textDiv = el("div", { class: "results-text" });
	if (burnTime && safeTime && safeTime !== "unlikely") {
		textDiv.appendChild(el("p", { class: "results-safe-time" }, `Safe for ${safeTime}`));
		textDiv.appendChild(el("p", { class: "results-burn-time" },
			isHighRisk ? `Use sunscreen by ${formatInTimeZone(burnTime, timezone, "h:mm a")}, sun damage may occur after` : `Until ${formatInTimeZone(burnTime, timezone, "h:mm a")}`,
		));
		if (envTimes) {
			textDiv.appendChild(el("p", { class: "results-env-times" }, `Full shade: ${envTimes.shade} \u00B7 Beach: ${envTimes.sand} \u00B7 Snow: ${envTimes.snow}`));
		}
	} else {
		textDiv.appendChild(el("p", { class: "results-safe-time green" }, "Sunburn unlikely"));
	}
	center.appendChild(iconDiv);
	center.appendChild(textDiv);

	if (advice.length > 0) {
		center.appendChild(el("p", { class: "results-advice" }, advice[0]));
	}
	card.appendChild(center);
	return card;
}

/* ---------- Sun Position Card ---------- */

function renderSunPositionCard(state) {
	const geo = state.geolocation;
	if (!geo.weather || !geo.position) return el("div", {});
	const w = geo.weather;
	const tz = w.timezone;
	const sunriseTime = new Date(w.sunrise);
	const sunsetTime = new Date(w.sunset);
	const nextSunriseTime = w.nextSunrise ? new Date(w.nextSunrise) : null;
	const totalDuration = sunsetTime.getTime() - sunriseTime.getTime();
	const daylightHours = formatDurationShort(totalDuration);

	const latitude = geo.position.latitude;
	const dayOfYear = Math.floor((sunriseTime.getTime() - new Date(sunriseTime.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
	const declination = -23.45 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
	const maxElevation = 90 - Math.abs(latitude - declination);
	const zenithScale = Math.max(0.2, Math.min(1, maxElevation / 75));

	const now = currentTimeTick.getTime();
	const currentProgress = Math.max(0, Math.min(1, (now - sunriseTime.getTime()) / totalDuration));
	const isDay = now >= sunriseTime.getTime() && now <= sunsetTime.getTime();

	let timeRemainingStr = "";
	if (isDay) {
		timeRemainingStr = `Sunset in ${formatDurationShort(sunsetTime.getTime() - now)}`;
	} else if (now < sunriseTime.getTime()) {
		timeRemainingStr = `Sunrise in ${formatDurationShort(sunriseTime.getTime() - now)}`;
	} else if (nextSunriseTime) {
		timeRemainingStr = `Sunrise in ${formatDurationShort(nextSunriseTime.getTime() - now)}`;
	}

	const sunriseHour = getFractionalHoursInTimezone(sunriseTime, tz);
	const sunsetHour = getFractionalHoursInTimezone(sunsetTime, tz);

	const width = 280, height = 100;
	const centerX = width / 2;
	const centerY = height - 10;
	const startX = 25, endX = width - 25;
	const peakHeight = Math.round(30 + 45 * zenithScale);
	const controlY = centerY - peakHeight * 1.3;

	const arcProgress = Math.max(0, Math.min(1, (getFractionalHoursInTimezone(now, tz) - sunriseHour) / (sunsetHour - sunriseHour)));
	const t = arcProgress;
	const sunX = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * centerX + t * t * endX;
	const sunY = (1 - t) * (1 - t) * centerY + 2 * (1 - t) * t * controlY + t * t * centerY;

	const arcPoints = [];
	for (let i = 0; i <= 30; i++) {
		const pt = i / 30;
		const px = (1 - pt) * (1 - pt) * startX + 2 * (1 - pt) * pt * centerX + pt * pt * endX;
		const py = (1 - pt) * (1 - pt) * centerY + 2 * (1 - pt) * pt * controlY + pt * pt * centerY;
		arcPoints.push(`${px},${py}`);
	}

	const bgClass = (() => {
		if (!isDay) return "sun-pos-night";
		const p = currentProgress;
		if (p < 0.15) return "sun-pos-dawn";
		if (p < 0.35) return "sun-pos-morning";
		if (p < 0.65) return "sun-pos-midday";
		if (p < 0.85) return "sun-pos-afternoon";
		return "sun-pos-dusk";
	})();

	const card = el("div", { class: `card sun-position-card ${bgClass}` });
	const header = el("div", { class: "card-header sun-pos-header" });
	const titleLeft = el("div", { class: "sun-pos-title-left" });
	titleLeft.appendChild(el("span", { class: "sun-pos-title" }, "Sun Position"));
	header.appendChild(titleLeft);
	const titleRight = el("div", { class: "sun-pos-title-right" });
	if (timeRemainingStr) titleRight.appendChild(el("span", { class: `sun-pos-remaining ${isDay ? "" : "night"}` }, timeRemainingStr));
	titleRight.appendChild(el("span", { class: `sun-pos-daylight ${isDay ? "" : "night"}` }, `${daylightHours} of daylight`));
	header.appendChild(titleRight);
	card.appendChild(header);

	const svgContainer = el("div", { class: "sun-pos-svg-wrap" });
	const gradId = "sun-grad-" + Date.now();
	const glowId = "sun-glow-" + Date.now();
	let svgHtml = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
		<line x1="10" y1="${centerY}" x2="${width - 10}" y2="${centerY}" stroke="${isDay ? '#d1d5db' : '#475569'}" stroke-width="1" stroke-dasharray="4 2"/>
		<polyline points="${arcPoints.join(' ')}" fill="none" stroke="url(#${gradId})" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
		<defs>
			<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
				<stop offset="0%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ea580c"/>
			</linearGradient>
			<radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
				<stop offset="0%" stop-color="#fbbf24" stop-opacity="1"/><stop offset="70%" stop-color="#f59e0b" stop-opacity="0.6"/><stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
			</radialGradient>
		</defs>`;
	if (isDay) {
		svgHtml += `<g style="transform-origin:${sunX}px ${sunY}px">
			<circle cx="${sunX}" cy="${sunY}" r="18" fill="url(#${glowId})"/>
			<circle cx="${sunX}" cy="${sunY}" r="10" fill="#fbbf24" stroke="#f59e0b" stroke-width="2" class="sun-pulse"/>
		</g>`;
	}
	svgHtml += `</svg>`;
	svgContainer.innerHTML = svgHtml;
	card.appendChild(svgContainer);

	const labels = el("div", { class: "sun-pos-labels" });
	const leftLabel = el("div", { class: "sun-pos-label-left" });
	leftLabel.innerHTML = icon("sunrise", 16, isDay ? "#f59e0b" : "#64748b");
	leftLabel.appendChild(el("span", { class: `sun-pos-time ${isDay ? "" : "night"}` }, formatInTimeZone(sunriseTime, tz, "h:mm a")));
	labels.appendChild(leftLabel);

	const centerLabel = el("div", { class: "sun-pos-label-center" });
	if (isDay) {
		centerLabel.appendChild(el("span", { class: "sun-pos-progress" }, `${Math.round(currentProgress * 100)}% through the day`));
	} else {
		centerLabel.appendChild(el("span", { class: "sun-pos-progress night" }, `Now ${formatInTimeZone(currentTimeTick, tz, "h:mm a")} \u00B7 Night`));
	}
	labels.appendChild(centerLabel);

	const rightLabel = el("div", { class: "sun-pos-label-right" });
	rightLabel.innerHTML = icon("sunset", 16, isDay ? "#f59e0b" : "#64748b");
	rightLabel.appendChild(el("span", { class: `sun-pos-time ${isDay ? "" : "night"}` }, formatInTimeZone(sunsetTime, tz, "h:mm a")));
	labels.appendChild(rightLabel);
	card.appendChild(labels);

	return card;
}

/* ---------- Timer Card ---------- */

function renderTimerCard(result) {
	const card = el("div", { class: "card timer-card", id: "timer-card" });
	const header = el("div", { class: "card-header" });
	header.appendChild(el("div", { class: "timer-title" },
		el("span", { html: icon("clock", 20) }),
		el("span", {}, "Sun Exposure Timer"),
	));
	const riskStatus = getRiskStatus(timer.accumulatedDamage);
	header.appendChild(el("span", { class: `badge ${timer.accumulatedDamage > 75 ? "badge-danger" : "badge-secondary"}`, id: "timer-status-badge" }, riskStatus.status));
	card.appendChild(header);

	const body = el("div", { class: "card-body timer-body", id: "timer-body" });
	card.appendChild(body);
	populateTimerBody(body, result);
	return card;
}

function renderTimer() {
	if (!currentCalculation) return;
	const body = document.getElementById("timer-body");
	if (!body) return;
	body.innerHTML = "";
	populateTimerBody(body, currentCalculation);
	const badge = document.getElementById("timer-status-badge");
	if (badge) {
		const rs = getRiskStatus(timer.accumulatedDamage);
		badge.textContent = rs.status;
		badge.className = `badge ${timer.accumulatedDamage > 75 ? "badge-danger" : "badge-secondary"}`;
	}
}

function populateTimerBody(body, result) {
	const riskStatus = getRiskStatus(timer.accumulatedDamage);
	const burnTime = result.burnTime;
	const remainingTime = burnTime && timer.startTime ? Math.max(0, burnTime.getTime() - (timer.startTime.getTime() + timer.elapsedMs)) : null;

	body.appendChild(el("div", { class: "timer-display" },
		el("div", { class: "timer-elapsed" }, formatElapsedTime(timer.elapsedMs)),
		timer.startTime ? el("p", { class: "timer-started-at" }, `Started at ${formatInTimeZone(timer.startTime, undefined, "h:mm a")}`) : null,
	));

	const progressWrap = el("div", { class: "timer-progress-wrap" });
	progressWrap.appendChild(el("div", { class: "timer-progress-labels" },
		el("span", { class: "muted-text" }, "Skin Damage"),
		el("span", { class: `timer-damage-value ${riskStatus.textColor}` }, `${timer.accumulatedDamage.toFixed(1)}%`),
	));
	const progressBar = el("div", { class: "progress-bar" });
	const fill = el("div", { class: `progress-fill ${riskStatus.color}` });
	fill.style.width = `${Math.min(timer.accumulatedDamage, 100)}%`;
	progressBar.appendChild(fill);
	progressWrap.appendChild(progressBar);
	if (burnTime && remainingTime !== null) {
		progressWrap.appendChild(el("p", { class: "timer-remaining" }, remainingTime > 0 ? `${formatElapsedTime(remainingTime)} until burn threshold` : "Burn threshold reached!"));
	}
	body.appendChild(progressWrap);

	const controls = el("div", { class: "timer-controls" });
	if (!timer.isRunning && timer.startTime === null) {
		const btn = el("button", { class: "btn btn-green", onclick: handleTimerStart });
		btn.innerHTML = icon("play", 16) + "<span>Start Timer</span>";
		controls.appendChild(btn);
	}
	if (timer.isRunning) {
		const btn = el("button", { class: "btn btn-outline", onclick: handleTimerPause });
		btn.innerHTML = icon("pause", 16) + "<span>Pause</span>";
		controls.appendChild(btn);
	}
	if (!timer.isRunning && timer.startTime !== null) {
		const btn = el("button", { class: "btn btn-green", onclick: handleTimerResume });
		btn.innerHTML = icon("play", 16) + "<span>Resume</span>";
		controls.appendChild(btn);
	}
	if (timer.startTime !== null) {
		const btn = el("button", { class: "btn btn-danger", onclick: handleTimerStop });
		btn.innerHTML = icon("square", 16) + "<span>Stop</span>";
		controls.appendChild(btn);
	}
	body.appendChild(controls);

	if (timer.accumulatedDamage > 50) {
		const warnClass = timer.accumulatedDamage > 90 ? "alert-critical" : timer.accumulatedDamage > 75 ? "alert-warning" : "alert-caution";
		const title = timer.accumulatedDamage > 90 ? "Critical: Seek shade immediately!" : timer.accumulatedDamage > 75 ? "Warning: Consider seeking shade soon" : "Caution: Monitor your exposure time";
		const desc = timer.accumulatedDamage > 90 ? "You are at high risk of sunburn. Move to shade and apply more sunscreen." : "Your sun exposure is getting significant. Consider taking a break in the shade.";
		body.appendChild(el("div", { class: `alert ${warnClass}` },
			el("div", { html: icon("alertTriangle", 16, "#ca8a04") }),
			el("div", {},
				el("p", { class: "alert-title" }, title),
				el("p", { class: "alert-desc" }, desc),
			),
		));
	} else if (timer.accumulatedDamage < 25 && timer.isRunning) {
		body.appendChild(el("div", { class: "alert alert-success" },
			el("div", { html: icon("checkCircle", 16, "#16a34a") }),
			el("div", {},
				el("p", { class: "alert-title" }, "You're doing great!"),
				el("p", { class: "alert-desc" }, "Your current sun exposure is within safe limits. Enjoy your time outdoors!"),
			),
		));
	}
}

function getRiskStatus(damage) {
	if (damage < 25) return { status: "Safe", color: "bg-green", textColor: "text-green-700" };
	if (damage < 50) return { status: "Caution", color: "bg-yellow", textColor: "text-yellow-700" };
	if (damage < 75) return { status: "Warning", color: "bg-orange", textColor: "text-orange-700" };
	if (damage < 95) return { status: "Danger", color: "bg-red", textColor: "text-red-700" };
	return { status: "Critical", color: "bg-red-dark", textColor: "text-red-800" };
}

function handleTimerStart() {
	timer = { isRunning: true, startTime: new Date(), elapsedMs: 0, accumulatedDamage: 0 };
	startTimerInterval();
	renderTimer();
}
function handleTimerPause() { timer.isRunning = false; stopTimerInterval(); renderTimer(); }
function handleTimerResume() { timer.isRunning = true; startTimerInterval(); renderTimer(); }
function handleTimerStop() {
	timer = { isRunning: false, startTime: null, elapsedMs: 0, accumulatedDamage: 0 };
	stopTimerInterval(); renderTimer();
}

/* ---------- Event Handlers ---------- */

async function handleCurrentLocation() {
	try {
		actions.setGeolocationStatus("fetching_location");
		const position = await getCurrentPosition();
		const { placeName, countryCode } = await reverseGeocode(position);
		actions.setPosition(position, placeName, countryCode);
		actions.setGeolocationStatus("fetching_weather");
		const weather = await fetchWeatherData(position, countryCode);
		actions.setWeather(weather);
	} catch (err) {
		actions.setGeolocationError(err.message || "Failed to get location");
	}
}

async function handleRefresh() {
	const state = getState();
	if (!state.geolocation.position) return;
	try {
		actions.setGeolocationStatus("fetching_weather");
		const weather = await fetchWeatherData(state.geolocation.position, state.geolocation.countryCode || "US");
		actions.setWeather(weather);
	} catch (err) {
		actions.setGeolocationError(err.message || "Failed to fetch weather");
	}
}

/* ---------- Init ---------- */

function init() {
	// Accordion triggers
	document.querySelectorAll(".accordion-trigger").forEach((trigger) => {
		trigger.addEventListener("click", () => {
			const item = trigger.closest(".accordion-item");
			if (item) toggleAccordion(item.id);
		});
	});

	// Math explanation toggle
	const mathTrigger = document.getElementById("math-trigger");
	if (mathTrigger) {
		mathTrigger.addEventListener("click", () => {
			const body = document.getElementById("math-body");
			mathTrigger.classList.toggle("open");
			body.classList.toggle("open");
		});
	}

	// Subscribe to store changes
	subscribe(() => render());

	// Current time ticker (for relative time + sun position)
	currentTimeInterval = setInterval(() => {
		currentTimeTick = new Date();
		const state = getState();
		if (state.geolocation.status === "completed" && state.geolocation.weather) {
			const sunCard = document.querySelector(".sun-position-card");
			if (sunCard) {
				sunCard.replaceWith(renderSunPositionCard(state));
			}
			const uvCanvas = document.getElementById("uv-chart");
			if (uvCanvas) {
				drawUVChart(uvCanvas, state.geolocation.weather, currentCalculation, state.geolocation.weather?.timezone, currentTimeTick);
			}
		}
		const updatedEl = document.querySelector(".updated-time");
		if (updatedEl && state.geolocation.lastFetched) {
			updatedEl.textContent = `Updated ${formatDistanceToNow(state.geolocation.lastFetched)}`;
		}
	}, 60000);

	// Refresh weather for saved location on load
	const state = getState();
	if (state.geolocation.status === "completed" && state.geolocation.position && !state.geolocation.weather) {
		const position = state.geolocation.position;
		actions.setGeolocationStatus("fetching_weather");
		fetchWeatherData(position, state.geolocation.countryCode || "US")
			.then((weather) => actions.setWeather(weather))
			.catch((err) => actions.setGeolocationError(err.message || "Failed to refresh weather data"));
	}

	// Initial render
	render();
}

document.addEventListener("DOMContentLoaded", init);
