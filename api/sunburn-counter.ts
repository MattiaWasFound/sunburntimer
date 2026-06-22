import { createHmac } from "node:crypto";
import { createClient } from "redis";

type VercelRequest = {
	headers: Record<string, string | string[] | undefined>;
	method?: string;
};

type VercelResponse = {
	json: (body: unknown) => void;
	setHeader: (name: string, value: string) => void;
	status: (statusCode: number) => VercelResponse;
};

const COUNTER_KEY = "sunburns_avoided";
const DEDUPE_TTL_SECONDS = 60 * 60 * 24;

let redisClient: ReturnType<typeof createClient> | undefined;

function getHeader(request: VercelRequest, name: string) {
	const value = request.headers[name] ?? request.headers[name.toLowerCase()];
	return Array.isArray(value) ? value[0] : value;
}

async function getRedisClient() {
	if (!process.env.REDIS_URL) {
		throw new Error("REDIS_URL is not configured");
	}

	if (!redisClient) {
		redisClient = createClient({
			url: process.env.REDIS_URL,
		});

		redisClient.on("error", (error) => {
			console.error("Redis error", error);
		});
	}

	if (!redisClient.isOpen) {
		await redisClient.connect();
	}

	return redisClient;
}

function isAllowedOrigin(request: VercelRequest) {
	const origin = getHeader(request, "origin");

	if (!origin) {
		return false;
	}

	const allowedOrigins = process.env.COUNTER_ALLOWED_ORIGINS?.split(",")
		.map((allowedOrigin) => allowedOrigin.trim())
		.filter(Boolean);

	return allowedOrigins?.includes(origin) ?? false;
}

function getAllowedOrigin(request: VercelRequest) {
	const origin = getHeader(request, "origin");
	return origin && isAllowedOrigin(request) ? origin : undefined;
}

function getVisitorHash(request: VercelRequest) {
	const forwardedFor = getHeader(request, "x-forwarded-for");
	const ipAddress =
		forwardedFor?.split(",")[0]?.trim() ??
		getHeader(request, "x-real-ip") ??
		"unknown";
	const userAgent = getHeader(request, "user-agent") ?? "unknown";
	const language = getHeader(request, "accept-language") ?? "unknown";
	const secret = process.env.COUNTER_HASH_SECRET;

	if (!secret) {
		throw new Error("COUNTER_HASH_SECRET is not configured");
	}

	return createHmac("sha256", secret)
		.update(`${ipAddress}|${userAgent}|${language}`)
		.digest("hex");
}

function sendCounter(
	request: VercelRequest,
	response: VercelResponse,
	count: number,
	cacheControl: string,
) {
	const allowedOrigin = getAllowedOrigin(request);

	response.setHeader("Cache-Control", cacheControl);
	response.setHeader("Vary", "Origin");

	if (allowedOrigin) {
		response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
	}

	response.json({ sunburnsAvoided: Number.isFinite(count) ? count : 0 });
}

export default async function handler(
	request: VercelRequest,
	response: VercelResponse,
) {
	if (request.method !== "GET" && request.method !== "POST") {
		response.setHeader("Allow", "GET, POST");
		response.status(405).json({ error: "Method not allowed" });
		return;
	}

	if (request.method === "POST" && !isAllowedOrigin(request)) {
		response.status(403).json({ error: "Forbidden" });
		return;
	}

	try {
		const redis = await getRedisClient();

		if (request.method === "GET") {
			const count = Number((await redis.get(COUNTER_KEY)) ?? 0);
			sendCounter(
				request,
				response,
				count,
				"s-maxage=300, stale-while-revalidate=3600",
			);
			return;
		}

		const visitorHash = getVisitorHash(request);
		const dedupeKey = `${COUNTER_KEY}:dedupe:${visitorHash}`;
		// If INCR fails after this succeeds, this visitor may be undercounted until
		// the dedupe key expires. That is acceptable for a vanity counter.
		const wasRecorded = await redis.set(dedupeKey, "1", {
			EX: DEDUPE_TTL_SECONDS,
			NX: true,
		});
		const count =
			wasRecorded === "OK"
				? await redis.incr(COUNTER_KEY)
				: Number((await redis.get(COUNTER_KEY)) ?? 0);

		sendCounter(request, response, count, "no-store");
	} catch (error) {
		console.error(error);
		response.status(500).json({ error: "Counter unavailable" });
	}
}
