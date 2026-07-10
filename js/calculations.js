import {
	CALCULATION_CONSTANTS,
	SKIN_TYPE_CONFIG,
	SPF_CONFIG,
	SPFLevel,
	SWEAT_CONFIG,
	SweatLevel,
} from "./config.js";
import { getHoursInTimezone } from "./utils.js";

const UVI_DAMAGE_FACTOR_PER_MIN = 120;

function getMedInJm2(skinType) {
	return 80 * SKIN_TYPE_CONFIG[skinType].coefficient;
}

function spfAtTime(baseSpfValue, sweatLevel, hoursFromStart) {
	if (sweatLevel === SweatLevel.LOW || baseSpfValue === 1.0) return baseSpfValue;
	const sc = SWEAT_CONFIG[sweatLevel];
	if (hoursFromStart <= sc.startHours) return baseSpfValue;
	if (hoursFromStart >= sc.startHours + sc.durationHours) return 1.0;
	const decayProgress = (hoursFromStart - sc.startHours) / sc.durationHours;
	const remaining = baseSpfValue * (1.0 - decayProgress);
	return Math.max(1.0, remaining);
}

function lowUvWeight(uvi) {
	const { LOW_UV_SMOOTHSTEP_ENABLED, LOW_UV_RAMP_LOW, LOW_UV_RAMP_HIGH } = CALCULATION_CONSTANTS;
	if (!LOW_UV_SMOOTHSTEP_ENABLED) return 1;
	const low = LOW_UV_RAMP_LOW;
	const high = LOW_UV_RAMP_HIGH;
	if (!(high > low)) return 1;
	const n = Math.max(0, Math.min(1, (uvi - low) / (high - low)));
	return n * n * (3 - 2 * n);
}

function createSlices(hourly, slicesPerHour) {
	const windows = [];
	if (!hourly || hourly.length < 2) return windows;
	const sliceMinutes = 60 / slicesPerHour;
	for (let i = 0; i < hourly.length - 1; i++) {
		const cur = hourly[i];
		const next = hourly[i + 1];
		const baseTs = cur.dt * 1000;
		for (let j = 0; j < slicesPerHour; j++) {
			const startMs = baseTs + j * sliceMinutes * 60000;
			const endMs = baseTs + (j + 1) * sliceMinutes * 60000;
			const fStart = j / slicesPerHour;
			const fEnd = (j + 1) / slicesPerHour;
			windows.push({
				start: new Date(startMs),
				end: new Date(endMs),
				uviStart: cur.uvi * (1 - fStart) + next.uvi * fStart,
				uviEnd: cur.uvi * (1 - fEnd) + next.uvi * fEnd,
			});
		}
	}
	return windows;
}

function shouldStopCalculation(totalDamage, currentTime, pointCount, timezone) {
	if (totalDamage >= CALCULATION_CONSTANTS.DAMAGE_THRESHOLD) return true;
	const hour = getHoursInTimezone(currentTime, timezone);
	if (pointCount > CALCULATION_CONSTANTS.MIN_POINTS_FOR_EVENING_STOP && hour >= CALCULATION_CONSTANTS.EVENING_CUTOFF_HOUR) return true;
	return false;
}

function generateAdvice(input, points) {
	const advice = [];
	if (input.spfLevel !== "NONE") {
		advice.push("Reapply sunscreen every 2 hours, after swimming, or excessive sweating");
	}
	const last = points[points.length - 1];
	if (!last) return advice;
	const finalDamage = (last.totalDamageAtStart || 0) + (last.burnCost || 0);
	if (finalDamage < CALCULATION_CONSTANTS.SAFETY_THRESHOLD) {
		if (input.spfLevel === "NONE") return advice;
		advice.push("With these precautions you can spend the rest of the day out in the sun, enjoy! \u2600\uFE0F");
	} else {
		if (input.spfLevel === "NONE") advice.push("You should try again with sunscreen");
		else if (input.spfLevel === "SPF_50_PLUS") advice.push("Limit your time in the sun today");
		else advice.push("Try using a stronger sunscreen or limit your time in the sun today");
	}
	return advice;
}

function calculateBurnTimeWithSlices(input, slicesPerHour) {
	const sliceWindows = createSlices(input.weather.hourly, slicesPerHour);
	const medInJm2 = getMedInJm2(input.skinType);
	const baseSpfValue = SPF_CONFIG[input.spfLevel]?.coefficient ?? SPF_CONFIG[SPFLevel.NONE].coefficient;
	const startMs = input.currentTime.getTime();
	const threshold = CALCULATION_CONSTANTS.DAMAGE_THRESHOLD;
	const points = [];
	let totalDamage = 0;
	let pointCount = 0;
	let burnTime;

	for (const slice of sliceWindows) {
		if (slice.end.getTime() <= startMs) continue;
		const effStartMs = Math.max(slice.start.getTime(), startMs);
		const effEndMs = slice.end.getTime();
		const minutes = (effEndMs - effStartMs) / 60000;
		if (minutes <= 0) continue;

		const sliceDurMs = slice.end.getTime() - slice.start.getTime();
		const startFraction = sliceDurMs > 0 ? (effStartMs - slice.start.getTime()) / sliceDurMs : 0;
		const uviAtEffStart = slice.uviStart * (1 - startFraction) + slice.uviEnd * startFraction;
		const uviAtEnd = slice.uviEnd;

		const hoursAtEffStart = (effStartMs - startMs) / 3600000;
		const hoursAtEnd = (effEndMs - startMs) / 3600000;
		const spfAtEffStart = spfAtTime(baseSpfValue, input.sweatLevel, hoursAtEffStart);
		const spfAtEnd = spfAtTime(baseSpfValue, input.sweatLevel, hoursAtEnd);

		const irrStart = (uviAtEffStart / Math.max(1, spfAtEffStart)) * lowUvWeight(uviAtEffStart);
		const irrEnd = (uviAtEnd / Math.max(1, spfAtEnd)) * lowUvWeight(uviAtEnd);
		const avgIrr = 0.5 * (irrStart + irrEnd);

		let damageAdded = (UVI_DAMAGE_FACTOR_PER_MIN * avgIrr * minutes) / medInJm2;

		const displaySlice = {
			datetime: new Date(effStartMs),
			uvIndex: 0.5 * (uviAtEffStart + uviAtEnd),
		};

		if (!burnTime && totalDamage + damageAdded >= threshold) {
			const ratePerMin = damageAdded / minutes;
			const minsToThreshold = (threshold - totalDamage) / ratePerMin;
			damageAdded = threshold - totalDamage;
			burnTime = new Date(effStartMs + minsToThreshold * 60000);
		}

		points.push({
			slice: displaySlice,
			burnCost: damageAdded,
			totalDamageAtStart: totalDamage,
		});
		totalDamage += damageAdded;
		pointCount++;

		if (burnTime || shouldStopCalculation(totalDamage, displaySlice.datetime, pointCount, input.weather.timezone)) break;
	}

	return {
		startTime: points[0]?.slice.datetime,
		burnTime,
		points,
		timeSlices: slicesPerHour,
		advice: generateAdvice(input, points),
	};
}

export function findOptimalTimeSlicing(input) {
	const sliceOptions = [30, 12, 6, 4];
	for (const slicesPerHour of sliceOptions) {
		const result = calculateBurnTimeWithSlices(input, slicesPerHour);
		if (result.points.length <= CALCULATION_CONSTANTS.MAX_CALCULATION_POINTS) return result;
	}
	return calculateBurnTimeWithSlices(input, 4);
}
