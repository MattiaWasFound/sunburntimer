// The calculator as a command line: the same calculations.js / uv_source.js /
// services.js the page runs, fed from arguments and open-meteo instead of the
// DOM, so the burn time can be shown anywhere (a status line, a widget, a
// script). `bin/sun` is the launcher; this module holds
// the parsing and formatting so tests can drive it without the network.
import { FitzpatrickType, SPFLevel, SweatLevel } from "./config.js";
import { findOptimalTimeSlicing } from "./calculations.js";
import { resolveUvSource } from "./uv_source.js";

export const USAGE = `usage: sun [--lat N --lon N] [--skin I..VI] [--spf none|15|30|50] [--sweat low|medium|high]
           [--at HH:MM] [--json]

  --lat/--lon  where (default Copenhagen 55.6761 12.5683)
  --skin       Fitzpatrick skin type I..VI (default III)
  --spf        none | 15 | 30 | 50 (default none)
  --sweat      low | medium | high (default low)
  --at         start time today, local to the place (default now)
  --json       machine-readable result instead of the summary`;

const SPF_ARG = { none: SPFLevel.NONE, "0": SPFLevel.NONE, "15": SPFLevel.SPF_15, "30": SPFLevel.SPF_30,
                  "50": SPFLevel.SPF_50_PLUS, "50+": SPFLevel.SPF_50_PLUS };

export function parseArgs(argv) {
    const out = { lat: 55.6761, lon: 12.5683, skin: FitzpatrickType.III, spf: SPFLevel.NONE,
                  sweat: SweatLevel.LOW, at: null, json: false, help: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], v = argv[i + 1];
        const need = () => { if (v === undefined) throw new Error(`${a} needs a value`); i++; return v; };
        if (a === "--help" || a === "-h") out.help = true;
        else if (a === "--json") out.json = true;
        else if (a === "--lat") out.lat = Number(need());
        else if (a === "--lon") out.lon = Number(need());
        else if (a === "--skin") {
            const k = need().toUpperCase();
            if (!FitzpatrickType[k]) throw new Error(`--skin must be one of ${Object.keys(FitzpatrickType).join(", ")}`);
            out.skin = FitzpatrickType[k];
        } else if (a === "--spf") {
            const k = need().toLowerCase().replace(/^spf[_ -]?/, "");
            if (!SPF_ARG[k]) throw new Error("--spf must be none, 15, 30 or 50");
            out.spf = SPF_ARG[k];
        } else if (a === "--sweat") {
            const k = need().toUpperCase();
            if (!SweatLevel[k]) throw new Error("--sweat must be low, medium or high");
            out.sweat = SweatLevel[k];
        } else if (a === "--at") {
            const m = /^(\d{1,2}):(\d{2})$/.exec(need());
            if (!m) throw new Error("--at wants HH:MM");
            out.at = { h: Number(m[1]), m: Number(m[2]) };
        } else throw new Error(`unknown argument ${a}`);
    }
    if (!Number.isFinite(out.lat) || !Number.isFinite(out.lon)) throw new Error("--lat/--lon must be numbers");
    return out;
}

// A start time "HH:MM today" in the place's own timezone, as an instant.
export function startInstant(at, timezone, now = new Date()) {
    if (!at) return now;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    // Local wall clock → instant: build the UTC guess, then correct by the zone offset at that guess.
    const guess = Date.UTC(get("year"), get("month") - 1, get("day"), at.h, at.m);
    const zoned = new Date(new Date(guess).toLocaleString("en-US", { timeZone: timezone }));
    const offset = zoned.getTime() - new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    return new Date(guess - offset);
}

export function compute({ weather, fetchedAt, skin, spf, sweat, startTime, now = new Date() }) {
    const source = resolveUvSource({ geolocation: { weather, weatherFetchedAt: fetchedAt } }, now, startTime);
    if (!source.usable) return { source, result: null };
    const result = findOptimalTimeSlicing({ uvSource: source, timezone: source.timezone, currentTime: startTime,
                                            skinType: skin, spfLevel: spf, sweatLevel: sweat });
    return { source, result };
}

const clock = (d, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);

export function summarize({ source, result }, opts, place) {
    if (!result) return `no usable UV reading (${source.mode}) — try again later`;
    const spf = opts.spf === "NONE" ? "no sunscreen" : `SPF ${opts.spf.replace("SPF_", "").replace("_PLUS", "+")}`;
    const head = `${place} · UV now ${source.currentUvi} · skin ${opts.skin} · ${spf} · sweat ${opts.sweat.toLowerCase()}`;
    if (!result.burnTime) return `${head}\nNo sunburn expected today from ${clock(result.startTime, source.timezone)} on.`
        + (result.advice.length ? "\n" + result.advice.map((a) => "• " + a).join("\n") : "");
    const mins = Math.round((result.burnTime.getTime() - result.startTime.getTime()) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    const dur = h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
    return `${head}\nBurn after ${dur}: safe until ${clock(result.burnTime, source.timezone)} (from ${clock(result.startTime, source.timezone)}).`
        + (result.advice.length ? "\n" + result.advice.map((a) => "• " + a).join("\n") : "");
}

export function toJson({ source, result }, opts, place) {
    return {
        place, lat: opts.lat, lon: opts.lon, skin: opts.skin, spf: opts.spf, sweat: opts.sweat,
        uv_now: source.currentUvi, uv_source: source.mode, timezone: source.timezone,
        start: result?.startTime?.toISOString() ?? null,
        burn_at: result?.burnTime?.toISOString() ?? null,
        minutes_to_burn: result?.burnTime ? Math.round((result.burnTime - result.startTime) / 60000) : null,
        advice: result?.advice ?? [],
    };
}
