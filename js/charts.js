import { formatInTimeZone } from "./utils.js";

/* Every chart on the page, drawn on canvas, and every one of them interactive.
 *
 * The page shares ONE cursor: a moment in the day. Pointing at any chart moves
 * it, and every chart shows it — the UV at that moment, the dose you would have
 * by then, where the sun would be, the temperature. The canvases do NOT draw
 * the cursor: they are drawn when the data or their size changes, and the
 * cursor is a small DOM overlay app.js moves with a transform. Redrawing four
 * full-size canvases at 2× on every pointer move made WebKit upload all four
 * as new textures each frame, which held a profiled Safari to a few frames a
 * second. So each draw function returns the mapping the overlay needs instead:
 * time ↔ x, the plot's top and bottom, and `point(t)`: where the cursor's dot
 * sits at t, its colour, and what its label says.
 *
 * Canvas cannot use CSS variables, so it reads them: every colour and the font
 * are tokens from css/styles.css, which keeps dark mode and the UV bands to one
 * definition each. */

function token(name) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function font(size, weight = 500) {
	return `${weight} ${size}px ${token("--font") || "system-ui, sans-serif"}`;
}

function alpha(color, a) {
	// Tokens are #rrggbb; a translucent fill of one is the same hue at `a`.
	const m = /^#([0-9a-f]{6})$/i.exec(color);
	if (!m) return color;
	const n = parseInt(m[1], 16);
	return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/* Sizes the backing store to the element's CSS box at the device's pixel
 * ratio. Null while the canvas has no size (a hidden card, a layout that has
 * not happened yet): drawing into a 0×0 canvas is wasted work that also throws
 * away the last good frame. */
function setupCanvas(canvas) {
	if (!canvas) return null;
	const rect = canvas.getBoundingClientRect();
	if (rect.width < 2 || rect.height < 2) return null;
	const dpr = window.devicePixelRatio || 1;
	const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
	const ctx = canvas.getContext("2d");
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, rect.width, rect.height);
	return { ctx, w: rect.width, h: rect.height };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* A smooth curve through hourly values that never overshoots them (Fritsch–
 * Carlson monotone cubic). A plain bezier through a UV series dips below zero
 * at dawn and bulges above the peak, so the chart would show a UV the forecast
 * never gave; this one stays inside every pair of neighbours. The cursor reads
 * its value off the same function, so the dot sits on the line it is drawn on. */
export function monotone(xs, ys) {
	const n = xs.length;
	if (n === 0) return () => 0;
	if (n === 1) return () => ys[0];
	const dx = [], slope = [];
	for (let i = 0; i < n - 1; i++) {
		dx.push(xs[i + 1] - xs[i]);
		slope.push((ys[i + 1] - ys[i]) / dx[i]);
	}
	const tangent = new Array(n);
	tangent[0] = slope[0];
	tangent[n - 1] = slope[n - 2];
	for (let i = 1; i < n - 1; i++) {
		tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
	}
	for (let i = 0; i < n - 1; i++) {
		if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
		const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i];
		const s = a * a + b * b;
		if (s > 9) {
			const k = 3 / Math.sqrt(s);
			tangent[i] = k * a * slope[i];
			tangent[i + 1] = k * b * slope[i];
		}
	}
	return (x) => {
		if (x <= xs[0]) return ys[0];
		if (x >= xs[n - 1]) return ys[n - 1];
		let lo = 0, hi = n - 1;
		while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
		const h = dx[lo], s = (x - xs[lo]) / h;
		const h00 = (1 + 2 * s) * (1 - s) * (1 - s), h10 = s * (1 - s) * (1 - s);
		const h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
		return h00 * ys[lo] + h10 * h * tangent[lo] + h01 * ys[lo + 1] + h11 * h * tangent[lo + 1];
	};
}

/* Whole-hour ticks no closer than `minPx` apart, on 1, 2, 3, 4 or 6 hour steps
 * so the labels land on hours a person reads as round. */
export function hourTicks(t0, t1, widthPx, minPx = 64) {
	const HOUR = 3600000;
	const span = Math.max(1, t1 - t0);
	const step = [1, 2, 3, 4, 6, 12].find((hours) => (hours * HOUR / span) * widthPx >= minPx) || 12;
	const ticks = [];
	for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += HOUR) {
		if (Math.round(t / HOUR) % step === 0) ticks.push(t);
	}
	return ticks;
}

/* A rounded label, centred on x and kept inside the canvas. The one label
 * motif every chart uses: the "Now" flag, a planned start, the cursor's value. */
function pill(ctx, x, y, text, bg, fg, w) {
	ctx.font = font(11, 650);
	const tw = ctx.measureText(text).width + 12;
	const left = clamp(x - tw / 2, 2, w - tw - 2);
	ctx.fillStyle = bg;
	ctx.beginPath();
	ctx.roundRect(left, y, tw, 18, 9);
	ctx.fill();
	ctx.fillStyle = fg;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillText(text, left + 6, y + 9.5);
	return { left, right: left + tw };
}

function dot(ctx, x, y, r, fill) {
	ctx.fillStyle = fill;
	ctx.strokeStyle = token("--surface");
	ctx.lineWidth = 2;
	ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/* Hour labels under a chart, each kept whole inside the canvas: the last tick
 * of a day ("9 PM") otherwise loses its last letters to the right edge. */
function tickLabels(ctx, ticks, X, y, tz, w) {
	ctx.font = font(11, 500);
	ctx.fillStyle = token("--ink-3");
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	for (const t of ticks) {
		const text = formatInTimeZone(new Date(t), tz, "h a");
		const half = ctx.measureText(text).width / 2;
		ctx.fillText(text, clamp(X(t), half + 2, w - half - 2), y);
	}
}

function timeLabel(t, tz) {
	return formatInTimeZone(new Date(t), tz, "h:mm a");
}

/* ---------- UV through the day ---------- */

export const UV_BANDS = [
	{ from: 0, to: 3, token: "--uv-low", label: "Low" },
	{ from: 3, to: 6, token: "--uv-moderate", label: "Moderate" },
	{ from: 6, to: 8, token: "--uv-high", label: "High" },
	{ from: 8, to: 11, token: "--uv-very-high", label: "Very high" },
	{ from: 11, to: Infinity, token: "--uv-extreme", label: "Extreme" },
];

/*   hours    [{ dt, uvi }] the day being asked about — the series the answer used
 *   now      ms; the dashed "Now" line
 *   start    ms or null; a planned start, drawn when it is later than now
 *   burnAt   ms or null; the end of the safe window
 * Returns the cursor mapping (see the top of this file), or null when there is
 * nothing to draw. */
export function drawUVChart(canvas, { hours, tz, now, start, burnAt }) {
	const c = setupCanvas(canvas);
	if (!c || !hours || hours.length < 2) return null;
	const { ctx, w, h } = c;
	const padL = 28, padR = 10, padT = 26, padB = 24;
	const cw = w - padL - padR, ch = h - padT - padB;
	const xs = hours.map((p) => p.dt * 1000), ys = hours.map((p) => p.uvi);
	const valueAt = monotone(xs, ys);
	const t0 = xs[0], t1 = xs[xs.length - 1];
	// Headroom over the day's peak, not a fixed 0–11: a moderate day drawn on
	// an extreme day's scale is a flat line along the floor.
	const yMax = Math.max(6, Math.ceil(Math.max(...ys) * 1.25 + 0.5));
	const X = (t) => padL + ((t - t0) / (t1 - t0)) * cw;
	const T = (x) => t0 + ((x - padL) / cw) * (t1 - t0);
	const Y = (v) => padT + ch - (v / yMax) * ch;
	const ink3 = token("--ink-3");

	// The WHO bands as the chart's own background, named at the right edge:
	// the legend is the chart, not a row of swatches under it.
	ctx.textAlign = "right";
	ctx.textBaseline = "top";
	for (const band of UV_BANDS) {
		if (band.from >= yMax) break;
		const top = Y(Math.min(band.to, yMax)), bottom = Y(band.from);
		ctx.fillStyle = alpha(token(band.token), 0.07);
		ctx.fillRect(padL, top, cw, bottom - top);
		if (bottom - top >= 14) {
			ctx.font = font(10, 600);
			ctx.fillStyle = alpha(token(band.token), 0.95);
			ctx.fillText(band.label, padL + cw - 4, top + 3);
		}
		ctx.font = font(10, 500);
		ctx.fillStyle = ink3;
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(String(band.from), padL - 7, bottom);
		ctx.textBaseline = "top";
	}

	tickLabels(ctx, hourTicks(t0, t1, cw), X, padT + ch + 7, tz, w);

	// Your time outside: from the start to the burn, shaded behind the curve,
	// with a bar along the floor that ends where the burn does.
	const from = clamp(start && start > now ? start : now, t0, t1);
	if (burnAt && burnAt > from) {
		const to = clamp(burnAt, t0, t1);
		ctx.fillStyle = alpha(token("--accent"), 0.07);
		ctx.fillRect(X(from), padT, X(to) - X(from), ch);
		ctx.fillStyle = token("--accent");
		ctx.fillRect(X(from), padT + ch - 3, X(to) - X(from), 3);
		if (burnAt <= t1) {
			ctx.fillStyle = token("--uv-very-high");
			ctx.fillRect(X(to) - 1, padT + ch - 9, 2, 9);
		}
	}

	// The curve: filled and stroked in the colour of the band it is in.
	const bandGradient = (a) => {
		const g = ctx.createLinearGradient(0, Y(0), 0, Y(yMax));
		for (const band of UV_BANDS) {
			if (band.from > yMax) break;
			const color = alpha(token(band.token), a);
			g.addColorStop(Math.min(1, band.from / yMax), color);
			g.addColorStop(Math.min(1, Math.min(band.to, yMax) / yMax), color);
		}
		return g;
	};
	ctx.beginPath();
	ctx.moveTo(X(t0), Y(0));
	for (let x = X(t0); x <= X(t1) + 0.5; x += 2) ctx.lineTo(x, Y(valueAt(T(Math.min(x, X(t1))))));
	ctx.lineTo(X(t1), Y(0));
	ctx.closePath();
	ctx.fillStyle = bandGradient(0.3);
	ctx.fill();
	ctx.beginPath();
	for (let x = X(t0); x <= X(t1) + 0.5; x += 2) {
		const y = Y(valueAt(T(Math.min(x, X(t1)))));
		if (x === X(t0)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.strokeStyle = bandGradient(1);
	ctx.lineWidth = 2.5;
	ctx.lineJoin = "round";
	ctx.stroke();

	// Now, and a planned start.
	const inkC = token("--ink"), surface = token("--surface");
	let nowFlag = null;
	if (now >= t0 && now <= t1) {
		ctx.setLineDash([3, 3]);
		ctx.strokeStyle = alpha(inkC, 0.7);
		ctx.lineWidth = 1.25;
		ctx.beginPath(); ctx.moveTo(X(now), padT - 4); ctx.lineTo(X(now), padT + ch); ctx.stroke();
		ctx.setLineDash([]);
		nowFlag = pill(ctx, X(now), 2, "Now", inkC, surface, w);
	}
	if (start && start > now && start >= t0 && start <= t1) {
		ctx.strokeStyle = token("--accent");
		ctx.lineWidth = 1.5;
		ctx.beginPath(); ctx.moveTo(X(start), padT - 4); ctx.lineTo(X(start), padT + ch); ctx.stroke();
		const label = `Start ${timeLabel(start, tz)}`;
		// Beside the Now flag rather than on top of it when the two are close.
		const x = nowFlag && Math.abs(X(start) - X(now)) < 70 ? nowFlag.right + 40 : X(start);
		pill(ctx, x, 2, label, token("--accent"), token("--accent-ink"), w);
	}

	return {
		timeAt: (x) => clamp(T(x), t0, t1), xAt: X, valueAt, t0, t1, top: padT - 4, bottom: padT + ch, width: w,
		point: (t) => {
			const v = valueAt(t);
			const band = UV_BANDS.find((b) => v < b.to) || UV_BANDS[UV_BANDS.length - 1];
			return { y: Y(v), color: `var(${band.token})`, label: `${timeLabel(t, tz)} · UV ${v.toFixed(1)}` };
		},
	};
}

/* ---------- Your burn dose ---------- */

/* The dose axis. While the curve comes anywhere near a burn the axis runs to
 * 100%, so the burn line is on the chart. Otherwise it runs to a round number
 * just above the curve's peak: in the evening a whole day may add up to 2% of a
 * burn, and on a 0-100% axis that is a line along the floor. Each top divides
 * into four round gridline steps. */
const DOSE_TOPS = [1, 2, 4, 8, 12, 16, 20, 28, 40, 60, 100];
export function doseScale(peak) {
	if (!(peak >= 0)) peak = 0;
	if (peak >= 40) return { top: 100, burnShown: true };
	const top = DOSE_TOPS.find((t) => t >= peak * 1.2) ?? 100;
	return { top, burnShown: top >= 100 };
}

/* Labels that end up on the same edge, moved apart vertically: at least `gap`
 * between neighbours, inside [lo, hi], in their original order. Returns the
 * new y for each input y, in input order. */
export function spreadLabels(ys, gap, lo, hi) {
	const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
	const out = ys.slice();
	let prev = -Infinity;
	for (const i of order) { out[i] = Math.max(out[i], prev + gap, lo); prev = out[i]; }
	let next = Infinity;
	for (let k = order.length - 1; k >= 0; k--) {
		const i = order[k];
		out[i] = Math.min(out[i], next - gap, hi);
		next = out[i];
	}
	return out;
}

/*   series   [{ label, points: [{ t, dose }], current }] — the current settings
 *            and, faintly, the other sunscreen strengths for comparison
 *   dayEnd   ms; the end of the day being drawn (the UV chart's last hour)
 * Returns the cursor mapping, with doseAt(t), or null. */
export function drawDoseChart(canvas, { series, dayEnd, tz }) {
	const c = setupCanvas(canvas);
	const current = series?.find((s) => s.current);
	if (!c || !current || current.points.length < 2) return null;
	const { ctx, w, h } = c;
	// The current curve gets at least 40% of the width: a 30-minute burn drawn
	// on a whole day's axis is a vertical line. The other curves are cut there.
	const t0 = current.points[0].t;
	const ownEnd = current.points[current.points.length - 1].t;
	const t1 = Math.max(ownEnd, t0 + 3600000, Math.min(dayEnd ?? ownEnd, t0 + (ownEnd - t0) * 2.5));
	const cut = (points) => {
		const out = [];
		for (const p of points) {
			if (p.t <= t1) { out.push(p); continue; }
			const prev = out[out.length - 1];
			if (prev) out.push({ t: t1, dose: prev.dose + ((t1 - prev.t) / Math.max(1, p.t - prev.t)) * (p.dose - prev.dose) });
			break;
		}
		return out;
	};
	// The scale follows the current curve, not the faint ones: a stronger
	// sunscreen's 1% is the thing being read, and a weaker one climbing off
	// the top of the chart says what it needs to.
	const { top, burnShown } = doseScale(Math.max(...cut(current.points).map((p) => p.dose)));
	const grid = burnShown ? [0, 25, 50, 75] : [0, top / 4, top / 2, (top * 3) / 4, top];
	const pct = (d) => `${d < 1 && d > 0 ? d.toFixed(2).replace(/0$/, "") : +d.toFixed(1)}%`;
	ctx.font = font(10, 500);
	const padL = Math.max(34, Math.ceil(Math.max(...grid.map((d) => ctx.measureText(pct(d)).width))) + 12);
	const padR = 44, padT = 26, padB = 24;
	const cw = w - padL - padR, ch = h - padT - padB;
	const X = (t) => padL + ((t - t0) / (t1 - t0)) * cw;
	const T = (x) => t0 + ((x - padL) / cw) * (t1 - t0);
	// Not clamped at the top: a faint line above a scaled axis runs off the
	// chart (and is clipped), rather than flattening along its top edge.
	const Y = (d) => padT + ch - (d / top) * ch;
	const ink3 = token("--ink-3"), line = token("--line"), accent = token("--accent"), burn = token("--uv-very-high");

	ctx.lineWidth = 1;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (const d of grid) {
		ctx.strokeStyle = line;
		ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(padL + cw, Y(d)); ctx.stroke();
		ctx.fillStyle = ink3;
		ctx.fillText(pct(d), padL - 6, Y(d));
	}
	if (burnShown) {
		ctx.strokeStyle = burn;
		ctx.setLineDash([4, 3]);
		ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(padL + cw, Y(100)); ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillStyle = burn;
		ctx.font = font(10, 650);
		ctx.fillText("Burn", padL - 6, Y(100));
	} else {
		// Said in words, because the top of this axis is not the burn line.
		ctx.fillStyle = burn;
		ctx.font = font(10, 650);
		ctx.fillText("A burn is 100%, above this scale ↑", padL + cw, padT - 14);
	}

	tickLabels(ctx, hourTicks(t0, t1, cw), X, padT + ch + 7, tz, w);

	const path = (points) => {
		ctx.beginPath();
		points.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.dose)) : ctx.moveTo(X(p.t), Y(p.dose))));
	};

	// The other sunscreens, faint, each named where its line ends: at the
	// right edge, or over the burn line where it burns. A line that leaves
	// the top of a scaled axis is clipped there and named at the top.
	ctx.textBaseline = "middle";
	const edgeLabels = [];
	ctx.save();
	ctx.beginPath(); ctx.rect(padL - 2, padT - 2, cw + 4, ch + 4); ctx.clip();
	for (const s of series) {
		const pts = cut(s.points);
		if (s.current || pts.length < 2) continue;
		path(pts);
		ctx.strokeStyle = alpha(ink3, 0.45);
		ctx.lineWidth = 1.25;
		ctx.stroke();
		const end = pts[pts.length - 1];
		if (burnShown && end.dose >= 100) {
			if (X(end.t) < padL + 40) continue; // would sit on the "Burn" label
			edgeLabels.push({ text: s.label, x: X(end.t), y: Y(100) - 9, align: "center", over: true });
		} else if (end.dose > top) {
			edgeLabels.push({ text: `${s.label} ↑`, x: X(end.t) + 4, y: padT, align: "left" });
		} else {
			edgeLabels.push({ text: s.label, x: X(end.t) + 4, y: Y(end.dose), align: "left" });
		}
	}
	ctx.restore();

	// The current settings, bold, over a soft fill.
	const pts = current.points;
	const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
	grad.addColorStop(0, alpha(accent, 0.3));
	grad.addColorStop(1, alpha(accent, 0.02));
	path(pts);
	ctx.lineTo(X(pts[pts.length - 1].t), Y(0));
	ctx.lineTo(X(pts[0].t), Y(0));
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();
	path(pts);
	ctx.strokeStyle = accent;
	ctx.lineWidth = 2.5;
	ctx.lineJoin = "round";
	ctx.stroke();
	const end = pts[pts.length - 1];
	if (end.dose >= 100) dot(ctx, X(end.t), Y(100), 5, burn);

	// Labels of lines that end at about the same time, the current one among
	// them, spread apart: at a low dose they all end at the same height, and
	// four names drawn over each other read as none.
	const mine = { text: current.label, x: Math.min(X(end.t) + 8, w - padR + 4),
		y: Y(end.dose) + (end.dose >= 100 ? 12 : 0), align: "left", current: true };
	const lineEnds = [...edgeLabels.filter((l) => !l.over), mine].sort((a, b) => a.x - b.x);
	for (let i = 0; i < lineEnds.length;) {
		let j = i + 1;
		while (j < lineEnds.length && lineEnds[j].x - lineEnds[i].x < 40) j++;
		const group = lineEnds.slice(i, j);
		spreadLabels(group.map((l) => l.y), 11, padT - 6, padT + ch - 2).forEach((y, k) => { group[k].y = y; });
		i = j;
	}
	for (const l of [...edgeLabels, mine]) {
		ctx.textAlign = l.align;
		ctx.font = font(10, l.current ? 700 : 600);
		ctx.fillStyle = l.current ? accent : alpha(ink3, 0.95);
		ctx.fillText(l.text, l.x, l.y);
	}
	ctx.textAlign = "left";

	const doseAt = (t) => {
		if (t <= pts[0].t) return 0;
		for (let i = 1; i < pts.length; i++) {
			if (t <= pts[i].t) {
				const a = pts[i - 1], b = pts[i];
				return a.dose + ((t - a.t) / Math.max(1, b.t - a.t)) * (b.dose - a.dose);
			}
		}
		return null; // past the end of the calculation
	};

	return {
		timeAt: (x) => clamp(T(x), t0, t1), xAt: X, doseAt, t0, t1, top: padT - 4, bottom: padT + ch, width: w,
		point: (t) => {
			const d = doseAt(t);
			return d == null
				? { y: null, label: timeLabel(t, tz) }
				: { y: Y(d), color: d >= 100 ? "var(--uv-very-high)" : "var(--accent)", label: `${timeLabel(t, tz)} · ${Math.round(d)}%` };
		},
	};
}

/* ---------- The sun's height ---------- */

/*   elevationAt  (ms) => degrees, from js/solar.js
 *   t0, t1       the window drawn (a little before sunrise to a little after sunset)
 *   sunrise, sunset, now  ms
 * Returns the cursor mapping, or null. The cursor's dot is a second sun. */
export function drawSunChart(canvas, { elevationAt, t0, t1, sunrise, sunset, now, tz }) {
	const c = setupCanvas(canvas);
	if (!c || !(t1 > t0)) return null;
	const { ctx, w, h } = c;
	const padL = 12, padR = 12, padT = 26, padB = 22;
	const cw = w - padL - padR, ch = h - padT - padB;
	const X = (t) => padL + ((t - t0) / (t1 - t0)) * cw;
	const T = (x) => t0 + ((x - padL) / cw) * (t1 - t0);
	const samples = [];
	let peak = { t: t0, e: -90 };
	for (let x = padL; x <= padL + cw + 0.5; x += 3) {
		const t = T(Math.min(x, padL + cw));
		const e = elevationAt(t);
		samples.push({ x: Math.min(x, padL + cw), t, e });
		if (e > peak.e) peak = { t, e };
	}
	const eMin = -14, eMax = Math.max(40, peak.e + 14);
	const Y = (e) => padT + ch - ((e - eMin) / (eMax - eMin)) * ch;
	const sun = token("--uv-moderate"), ink3 = token("--ink-3"), horizon = Y(0);

	// Day above the horizon, a little ground below it.
	const sky = ctx.createLinearGradient(0, padT, 0, horizon);
	sky.addColorStop(0, alpha(sun, 0.28));
	sky.addColorStop(1, alpha(sun, 0.04));
	ctx.beginPath();
	ctx.moveTo(samples[0].x, horizon);
	for (const s of samples) ctx.lineTo(s.x, Y(Math.max(0, s.e)));
	ctx.lineTo(samples[samples.length - 1].x, horizon);
	ctx.closePath();
	ctx.fillStyle = sky;
	ctx.fill();
	ctx.fillStyle = alpha(token("--ink"), 0.05);
	ctx.fillRect(padL, horizon, cw, padT + ch - horizon);
	ctx.strokeStyle = token("--line-strong");
	ctx.lineWidth = 1;
	ctx.beginPath(); ctx.moveTo(padL, horizon); ctx.lineTo(padL + cw, horizon); ctx.stroke();

	// The path: solid by day, dashed under the horizon.
	for (const below of [true, false]) {
		ctx.beginPath();
		let open = false;
		for (const s of samples) {
			if ((s.e < 0) !== below) { open = false; continue; }
			if (!open) { ctx.moveTo(s.x, Y(s.e)); open = true; } else ctx.lineTo(s.x, Y(s.e));
		}
		ctx.setLineDash(below ? [3, 4] : []);
		ctx.strokeStyle = below ? alpha(ink3, 0.6) : sun;
		ctx.lineWidth = below ? 1.25 : 2.5;
		ctx.stroke();
	}
	ctx.setLineDash([]);

	// Sunrise and sunset on the horizon, the peak over the arc.
	ctx.font = font(11, 500);
	ctx.fillStyle = ink3;
	ctx.textBaseline = "top";
	for (const [t, align] of [[sunrise, "left"], [sunset, "right"]]) {
		if (!(t >= t0 && t <= t1)) continue;
		ctx.textAlign = align;
		ctx.fillText(timeLabel(t, tz), X(t) + (align === "left" ? -2 : 2), horizon + 5);
		ctx.fillStyle = alpha(sun, 0.9);
		ctx.fillRect(X(t) - 1, horizon - 3, 2, 6);
		ctx.fillStyle = ink3;
	}
	if (peak.e > 0) {
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		ctx.font = font(11, 600);
		ctx.fillText(`${Math.round(peak.e)}° at ${timeLabel(peak.t, tz)}`, clamp(X(peak.t), 60, w - 60), Y(peak.e) - 10);
	}

	if (now >= t0 && now <= t1) {
		const e = elevationAt(now);
		const x = X(now), y = Y(e);
		const glow = ctx.createRadialGradient(x, y, 2, x, y, 22);
		glow.addColorStop(0, alpha(sun, e > 0 ? 0.55 : 0.2));
		glow.addColorStop(1, alpha(sun, 0));
		ctx.fillStyle = glow;
		ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
		dot(ctx, x, y, 8, e > 0 ? sun : alpha(ink3, 0.8));
		pill(ctx, x, 2, `Now · ${Math.round(e)}°`, token("--ink"), token("--surface"), w);
	}
	return {
		timeAt: (x) => clamp(T(x), t0, t1), xAt: X, t0, t1, top: padT - 4, bottom: padT + ch, width: w,
		point: (t) => {
			const e = elevationAt(t);
			return { y: Y(e), color: e > 0 ? "var(--uv-moderate)" : "var(--ink-3)", sun: true, label: `${timeLabel(t, tz)} · ${Math.round(e)}°` };
		},
	};
}

/* ---------- Temperature through the day ---------- */

/*   hours   [{ dt, temp }] on the same window as the UV chart
 *   format  (temp) => "29°" in the unit being shown
 * Returns the cursor mapping, or null. */
export function drawTempChart(canvas, { hours, tz, now, format }) {
	const c = setupCanvas(canvas);
	if (!c || !hours || hours.length < 2) return null;
	const { ctx, w, h } = c;
	const padL = 10, padR = 10, padT = 26, padB = 20;
	const cw = w - padL - padR, ch = h - padT - padB;
	const xs = hours.map((p) => p.dt * 1000), ys = hours.map((p) => p.temp);
	const valueAt = monotone(xs, ys);
	const t0 = xs[0], t1 = xs[xs.length - 1];
	let lo = Math.min(...ys), hi = Math.max(...ys);
	if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; }
	const X = (t) => padL + ((t - t0) / (t1 - t0)) * cw;
	const T = (x) => t0 + ((x - padL) / cw) * (t1 - t0);
	const Y = (v) => padT + 6 + (ch - 12) * (1 - (v - lo) / (hi - lo));
	const warm = token("--uv-high"), ink3 = token("--ink-3");

	tickLabels(ctx, hourTicks(t0, t1, cw, 56), X, padT + ch + 5, tz, w);

	const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
	grad.addColorStop(0, alpha(warm, 0.22));
	grad.addColorStop(1, alpha(warm, 0.02));
	ctx.beginPath();
	ctx.moveTo(X(t0), padT + ch);
	for (let x = X(t0); x <= X(t1) + 0.5; x += 2) ctx.lineTo(x, Y(valueAt(T(Math.min(x, X(t1))))));
	ctx.lineTo(X(t1), padT + ch);
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();
	ctx.beginPath();
	for (let x = X(t0); x <= X(t1) + 0.5; x += 2) {
		const y = Y(valueAt(T(Math.min(x, X(t1)))));
		if (x === X(t0)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.strokeStyle = warm;
	ctx.lineWidth = 2;
	ctx.stroke();

	// The day's high and low, named where they happen.
	const iHi = ys.indexOf(Math.max(...ys)), iLo = ys.indexOf(Math.min(...ys));
	ctx.font = font(10, 650);
	ctx.fillStyle = ink3;
	ctx.textBaseline = "bottom";
	ctx.textAlign = "center";
	ctx.fillText(format(ys[iHi]), clamp(X(xs[iHi]), 16, w - 16), Y(ys[iHi]) - 5);
	// The low is usually at an end of the day, down by the hour labels, so
	// there it sits beside its point, on the side away from the edge.
	if (iLo !== iHi) {
		const x = X(xs[iLo]), y = Y(ys[iLo]);
		if (iLo === 0 || iLo === ys.length - 1) {
			ctx.textBaseline = "bottom";
			ctx.textAlign = iLo === 0 ? "left" : "right";
			ctx.fillText(format(ys[iLo]), x + (iLo === 0 ? 6 : -6), y - 4);
		} else {
			ctx.textBaseline = "top";
			ctx.fillText(format(ys[iLo]), clamp(x, 18, w - 18), y + 5);
		}
	}

	if (now >= t0 && now <= t1) dot(ctx, X(now), Y(valueAt(now)), 4, warm);
	return {
		timeAt: (x) => clamp(T(x), t0, t1), xAt: X, valueAt, t0, t1, top: padT - 4, bottom: padT + ch, width: w,
		point: (t) => ({ y: Y(valueAt(t)), color: "var(--uv-high)", label: `${timeLabel(t, tz)} · ${format(valueAt(t))}` }),
	};
}
