const COUNTER_API_BASE_URL =
	import.meta.env.VITE_COUNTER_API_BASE_URL?.replace(/\/$/, "") ?? "";

const COUNTER_ENDPOINT = `${COUNTER_API_BASE_URL}/api/sunburn-counter`;

type CounterStatsResponse = {
	sunburnsAvoided?: number;
	count?: number;
};

export async function fetchSunburnCounter(): Promise<number | null> {
	const response = await fetch(COUNTER_ENDPOINT, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		return null;
	}

	const stats = (await response.json()) as CounterStatsResponse;
	const count = stats.sunburnsAvoided ?? stats.count;

	return typeof count === "number" && Number.isFinite(count) ? count : null;
}

export async function recordSunburnAvoided(): Promise<number | null> {
	const response = await fetch(COUNTER_ENDPOINT, {
		headers: {
			Accept: "application/json",
		},
		keepalive: true,
		method: "POST",
	});

	if (!response.ok) {
		return null;
	}

	const stats = (await response.json()) as CounterStatsResponse;
	const count = stats.sunburnsAvoided ?? stats.count;

	return typeof count === "number" && Number.isFinite(count) ? count : null;
}
