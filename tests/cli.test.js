import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, compute, summarize, toJson, startInstant } from "../js/cli.js";

const hourly = Array.from({ length: 24 }, (_, i) => ({ dt: Math.floor(Date.UTC(2026, 6, 1, i) / 1000), uvi: i >= 9 && i <= 17 ? 8 : 0, temp: 25 }));
const weather = { hourly, current: { uvi: 8 }, timezone: "Europe/Copenhagen" };
const now = new Date(Date.UTC(2026, 6, 1, 10, 0));

test("arguments map onto the app's own enums", () => {
    const o = parseArgs(["--skin", "ii", "--spf", "50", "--sweat", "High", "--lat", "41.9", "--lon", "12.5", "--at", "14:30", "--json"]);
    assert.deepEqual([o.skin, o.spf, o.sweat, o.lat, o.lon, o.at, o.json], ["II", "SPF_50_PLUS", "HIGH", 41.9, 12.5, { h: 14, m: 30 }, true]);
    assert.equal(parseArgs([]).skin, "III");
    assert.throws(() => parseArgs(["--skin", "VII"]), /--skin/);
    assert.throws(() => parseArgs(["--spf", "100"]), /--spf/);
    assert.throws(() => parseArgs(["--bogus"]), /unknown/);
});

test("a fresh forecast yields a burn time and a readable summary", () => {
    const opts = parseArgs(["--skin", "I", "--spf", "none"]);
    const out = compute({ weather, fetchedAt: now.getTime(), skin: opts.skin, spf: opts.spf, sweat: opts.sweat, startTime: now, now });
    assert.equal(out.source.mode, "live");
    assert.ok(out.result.burnTime instanceof Date && out.result.burnTime > now);
    const text = summarize(out, opts, "test");
    assert.match(text, /Burn after \d+ min|Burn after \d+ h/);
    assert.match(text, /UV now 8/);
    const j = toJson(out, opts, "test");
    assert.ok(j.minutes_to_burn > 0 && j.burn_at && j.uv_source === "live");
});

test("a stale reading is refused, not computed", () => {
    const opts = parseArgs([]);
    const out = compute({ weather, fetchedAt: now.getTime() - 3 * 3600 * 1000, skin: opts.skin, spf: opts.spf, sweat: opts.sweat, startTime: now, now });
    assert.equal(out.result, null);
    assert.match(summarize(out, opts, "test"), /no usable UV reading/);
});

test("--at is read as the place's wall clock", () => {
    const t = startInstant({ h: 14, m: 0 }, "Europe/Copenhagen", now);
    assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" }).format(t), "14:00");
});
