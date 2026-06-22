import { afterEach, describe, expect, it } from "bun:test";
import { fetchSunburnCounter, recordSunburnAvoided } from "./sunburn-counter";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText: status === 200 ? "OK" : "Error",
	});
}

describe("sunburn counter service", () => {
	it("fetches a counter from the sunburnsAvoided field", async () => {
		globalThis.fetch = async () => jsonResponse({ sunburnsAvoided: 12847 });

		await expect(fetchSunburnCounter()).resolves.toBe(12847);
	});

	it("returns null for non-200 responses", async () => {
		globalThis.fetch = async () => jsonResponse({ error: "Nope" }, 500);

		await expect(fetchSunburnCounter()).resolves.toBeNull();
	});

	it("returns null for malformed counter responses", async () => {
		globalThis.fetch = async () => jsonResponse({ sunburnsAvoided: "NaN" });

		await expect(fetchSunburnCounter()).resolves.toBeNull();
	});

	it("posts the counter record request with keepalive", async () => {
		let method = "";
		let keepalive = false;

		globalThis.fetch = async (_input, init) => {
			method = init?.method ?? "";
			keepalive = init?.keepalive ?? false;
			return jsonResponse({ sunburnsAvoided: 12848 });
		};

		await expect(recordSunburnAvoided()).resolves.toBe(12848);
		expect(method).toBe("POST");
		expect(keepalive).toBe(true);
	});
});
