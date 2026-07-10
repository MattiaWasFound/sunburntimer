import { parseLocationTime, isFiniteNumber, getWeatherDescription, getTemperatureUnitForCountry } from "./utils.js";

const UV_FORECAST_UNAVAILABLE_ERROR = "UV forecast is currently unavailable. Please try again later.";

/* ---------- Geolocation ---------- */

export function getCurrentPosition() {
	const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 };
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error("Geolocation not supported by this browser"));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
			(error) => {
				const msgs = {
					[error.PERMISSION_DENIED]: "This site is not allowed to use your location. Please enable location permissions in your browser settings.",
					[error.POSITION_UNAVAILABLE]: "Your device failed to discover your location. Please check that location services are enabled.",
					[error.TIMEOUT]: "Your device could not determine your position in a reasonable time. Please try again.",
				};
				reject(new Error(msgs[error.code] || "Your device failed to discover your location due to an unknown error."));
			},
			options,
		);
	});
}

export async function reverseGeocode(position) {
	try {
		const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.latitude}&longitude=${position.longitude}&localityLanguage=en`;
		const res = await fetch(url);
		if (!res.ok) throw new Error("Reverse geocoding failed");
		const data = await res.json();
		const parts = [];
		if (data.city) parts.push(data.city);
		else if (data.locality) parts.push(data.locality);
		if (data.principalSubdivision && data.countryCode === "US") parts.push(data.principalSubdivision);
		else if (data.principalSubdivision && parts.length > 0) parts.push(data.principalSubdivision);
		if (data.countryName && data.countryCode !== "US") parts.push(data.countryName);
		if (parts.length > 0) return { placeName: parts.join(", "), countryCode: data.countryCode || "US" };
		if (data.countryName) return { placeName: data.countryName, countryCode: data.countryCode || "US" };
	} catch (e) {
		console.warn("Reverse geocoding failed:", e);
	}
	return {
		placeName: `Your Current Location (${position.latitude.toFixed(2)}\u00B0, ${position.longitude.toFixed(2)}\u00B0)`,
		countryCode: "US",
	};
}

/* ---------- Geocoding (city search) ---------- */

export async function searchLocations(query, signal) {
	if (query.length < 2) return [];
	const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
	url.searchParams.set("name", query);
	url.searchParams.set("count", "5");
	url.searchParams.set("language", "en");
	url.searchParams.set("format", "json");
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error("Geocoding API error");
	const data = await res.json();
	if (!data.results) return [];
	return data.results.map((r) => ({
		id: r.id, name: r.name, admin1: r.admin1, country: r.country,
		countryCode: r.country_code, latitude: r.latitude, longitude: r.longitude,
	}));
}

/* ---------- AQI ---------- */

export async function fetchAQIData(position) {
	const lat = position.latitude.toFixed(4);
	const lon = position.longitude.toFixed(4);
	const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
	url.searchParams.set("latitude", lat);
	url.searchParams.set("longitude", lon);
	url.searchParams.set("current", "us_aqi");
	url.searchParams.set("domains", "cams_global");
	const res = await fetch(url);
	if (!res.ok) {
		if (res.status === 429) throw new Error("AQI API rate limit exceeded. Please try again later.");
		throw new Error(`AQI API error: ${res.status} ${res.statusText}`);
	}
	const data = await res.json();
	if (!data.current || data.current.us_aqi === undefined) throw new Error("Invalid AQI data received from API");
	return { us_aqi: Math.round(data.current.us_aqi) };
}

/* ---------- Weather ---------- */

function requireUvIndex(value) {
	if (!isFiniteNumber(value)) throw new Error(UV_FORECAST_UNAVAILABLE_ERROR);
	return value;
}

function getUsableHourlyLength(hourly) {
	const available = Math.min(hourly.time.length, hourly.temperature_2m.length, hourly.uv_index.length);
	let usable = 0;
	for (let i = 0; i < available; i++) {
		if (!hourly.time[i] || !isFiniteNumber(hourly.temperature_2m[i]) || !isFiniteNumber(hourly.uv_index[i])) break;
		usable++;
	}
	if (usable < 2) throw new Error(UV_FORECAST_UNAVAILABLE_ERROR);
	return usable;
}

export async function fetchWeatherData(position, countryCode) {
	const lat = position.latitude.toFixed(4);
	const lon = position.longitude.toFixed(4);
	const temperatureUnit = getTemperatureUnitForCountry(countryCode);

	const url = new URL("https://api.open-meteo.com/v1/forecast");
	const params = new URLSearchParams({
		latitude: lat,
		longitude: lon,
		current: "temperature_2m,dew_point_2m,uv_index,weather_code",
		hourly: "temperature_2m,dew_point_2m,uv_index,weather_code",
		daily: "sunrise,sunset",
		temperature_unit: temperatureUnit,
		wind_speed_unit: "mph",
		timezone: "auto",
		forecast_days: "3",
	});
	url.search = params.toString();

	const res = await fetch(url);
	if (!res.ok) {
		if (res.status === 429) throw new Error("API rate limit exceeded. Please try again later.");
		throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
	}
	const data = await res.json();
	if (!data.current || !data.hourly || !data.daily) throw new Error("Invalid weather data received from API");

	const tz = data.timezone;
	const currentUv = requireUvIndex(data.current.uv_index);
	const currentDewPoint = isFiniteNumber(data.current.dew_point_2m) ? data.current.dew_point_2m : undefined;

	const current = {
		dt: Math.floor(parseLocationTime(data.current.time, tz) / 1000),
		temp: data.current.temperature_2m,
		dewPoint: currentDewPoint,
		uvi: currentUv,
		weather: [{ id: Math.trunc(data.current.weather_code) || -1, main: getWeatherDescription(data.current.weather_code), description: getWeatherDescription(data.current.weather_code), icon: String(Math.trunc(data.current.weather_code) || -1) }],
	};

	const hd = data.hourly;
	const maxHours = getUsableHourlyLength(hd);
	const hourly = Array.from({ length: maxHours }, (_, i) => ({
		dt: Math.floor(parseLocationTime(hd.time[i], tz) / 1000),
		temp: hd.temperature_2m[i],
		dewPoint: isFiniteNumber(hd.dew_point_2m?.[i]) ? hd.dew_point_2m[i] : undefined,
		uvi: requireUvIndex(hd.uv_index[i]),
		weather: [{ id: Math.trunc(hd.weather_code[i]) || -1, main: getWeatherDescription(hd.weather_code[i]), description: getWeatherDescription(hd.weather_code[i]), icon: String(Math.trunc(hd.weather_code[i]) || -1) }],
	}));

	let aqi;
	try { aqi = await fetchAQIData(position); } catch (e) { console.warn("Failed to fetch AQI data:", e); }

	return {
		current, hourly, temperatureUnit, elevation: data.elevation, aqi,
		sunrise: new Date(parseLocationTime(data.daily.sunrise[0], tz)).toISOString(),
		sunset: new Date(parseLocationTime(data.daily.sunset[0], tz)).toISOString(),
		nextSunrise: new Date(parseLocationTime(data.daily.sunrise[1], tz)).toISOString(),
		timezone: tz,
	};
}
