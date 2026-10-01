import { formatInTimeZone } from "./utils.js";

/* Canvas cannot use CSS variables, so it reads them: every colour on a chart is
 * a token from css/styles.css, which keeps dark mode and the UV bands to one
 * definition each. */
function token(name) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function alpha(color, a) {
	// Tokens are #rrggbb; a translucent fill of one is the same hue at `a`.
	const m = /^#([0-9a-f]{6})$/i.exec(color);
	if (!m) return color;
	const n = parseInt(m[1], 16);
	return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function setupCanvas(canvas) {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	canvas.width = rect.width * dpr;
	canvas.height = rect.height * dpr;
	const ctx = canvas.getContext("2d");
	ctx.scale(dpr, dpr);
	return { ctx, w: rect.width, h: rect.height };
}

function niceTimeLabel(date, timezone) {
	return formatInTimeZone(date, timezone, "h:mm a");
}

/* ---------- Burn Chart ---------- */

export function drawBurnChart(canvas, result, timezone) {
	if (!canvas || !result || !result.points || result.points.length === 0) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const padL = 50, padR = 20, padT = 20, padB = 40;
	const cw = w - padL - padR;
	const ch = h - padT - padB;

	const startTime = result.startTime ? new Date(result.startTime) : result.points[0].slice.datetime;
	const tzStartTime = new Date(startTime);
	const cutoff = new Date(tzStartTime);
	cutoff.setHours(24, 0, 0, 0);

	const points = result.points.filter((p) => p.slice.datetime <= cutoff);
	if (points.length === 0) return;

	let cumulative = 0;
	const data = points.map((p) => {
		cumulative += p.burnCost;
		return { time: p.slice.datetime, damage: Math.min(cumulative, 100), uv: p.slice.uvIndex, cost: p.burnCost };
	});

	const minTime = data[0].time.getTime();
	const maxTime = data[data.length - 1].time.getTime();
	const timeRange = Math.max(1, maxTime - minTime);

	const x = (t) => padL + ((t - minTime) / timeRange) * cw;
	const y = (d) => padT + ch - (d / 100) * ch;

	ctx.clearRect(0, 0, w, h);

	const ink = token("--ink-3"), line = token("--line"), accent = token("--accent");

	// grid
	ctx.strokeStyle = line;
	ctx.lineWidth = 1;
	ctx.fillStyle = ink;
	ctx.font = "11px system-ui, sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	for (let v = 0; v <= 100; v += 25) {
		const yy = y(v);
		ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
		ctx.fillText(v + "%", padL - 8, yy);
	}

	// x ticks (hours)
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const tickCount = Math.min(6, data.length);
	for (let i = 0; i < tickCount; i++) {
		const idx = Math.floor((i / (tickCount - 1)) * (data.length - 1));
		const t = data[idx].time;
		ctx.fillText(formatInTimeZone(t, timezone, "h a"), x(t.getTime()), padT + ch + 8);
	}

	// gradient fill
	const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
	grad.addColorStop(0, alpha(accent, 0.3));
	grad.addColorStop(1, alpha(accent, 0.02));

	// area
	ctx.beginPath();
	ctx.moveTo(x(data[0].time.getTime()), y(0));
	for (const d of data) ctx.lineTo(x(d.time.getTime()), y(d.damage));
	ctx.lineTo(x(data[data.length - 1].time.getTime()), y(0));
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();

	// line
	ctx.beginPath();
	ctx.moveTo(x(data[0].time.getTime()), y(data[0].damage));
	for (let i = 1; i < data.length; i++) {
		const px = x(data[i - 1].time.getTime());
		const py = y(data[i - 1].damage);
		const cx = x(data[i].time.getTime());
		const cy = y(data[i].damage);
		const mx = (px + cx) / 2;
		ctx.bezierCurveTo(mx, py, mx, cy, cx, cy);
	}
	ctx.strokeStyle = accent;
	ctx.lineWidth = 2.5;
	ctx.lineJoin = "round";
	ctx.stroke();

	// burn threshold line
	ctx.strokeStyle = token("--uv-very-high");
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 3]);
	ctx.beginPath();
	ctx.moveTo(padL, y(100));
	ctx.lineTo(w - padR, y(100));
	ctx.stroke();
	ctx.setLineDash([]);
}

/* ---------- UV Chart ---------- */

export function drawUVChart(canvas, weather, result, timezone, currentTime) {
	if (!canvas) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const padL = 40, padR = 20, padT = 20, padB = 40;
	const cw = w - padL - padR;
	const ch = h - padT - padB;

	let times, uvData;
	if (weather && weather.hourly.length > 0) {
		times = weather.hourly.map((h) => new Date(h.dt * 1000));
		uvData = weather.hourly.map((h) => h.uvi);
	} else if (result && result.points.length > 0) {
		times = result.points.map((p) => p.slice.datetime);
		uvData = result.points.map((p) => p.slice.uvIndex);
	} else {
		return;
	}

	const maxUV = Math.max(...uvData, 1);
	const yMax = Math.max(12, Math.ceil(maxUV + 1));
	const minTime = times[0].getTime();
	const maxTime = times[times.length - 1].getTime();
	const timeRange = Math.max(1, maxTime - minTime);

	const x = (t) => padL + ((t - minTime) / timeRange) * cw;
	const y = (v) => padT + ch - (v / yMax) * ch;

	ctx.clearRect(0, 0, w, h);

	const ink = token("--ink-3"), line = token("--line");

	// grid
	ctx.strokeStyle = line;
	ctx.lineWidth = 1;
	ctx.fillStyle = ink;
	ctx.font = "11px system-ui, sans-serif";
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	const yStep = yMax <= 6 ? 1 : yMax <= 12 ? 2 : 3;
	for (let v = 0; v <= yMax; v += yStep) {
		const yy = y(v);
		ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
		ctx.fillText(String(v), padL - 8, yy);
	}

	// x ticks
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const tickCount = Math.min(w < 420 ? 5 : 7, times.length);
	for (let i = 0; i < tickCount; i++) {
		const idx = Math.floor((i / (tickCount - 1)) * (times.length - 1));
		ctx.fillText(formatInTimeZone(times[idx], timezone, "h a"), x(times[idx].getTime()), padT + ch + 8);
	}

	// The fill and the line take the band colour of the height they are at:
	// a vertical gradient with a stop at each WHO band boundary.
	const bands = [[0, "--uv-low"], [3, "--uv-moderate"], [6, "--uv-high"], [8, "--uv-very-high"], [11, "--uv-extreme"]];
	const bandGradient = (a) => {
		const g = ctx.createLinearGradient(0, y(0), 0, y(yMax));
		for (let i = 0; i < bands.length; i++) {
			const [from, name] = bands[i];
			const to = bands[i + 1] ? bands[i + 1][0] : yMax;
			if (from > yMax) break;
			const c = alpha(token(name), a);
			g.addColorStop(Math.min(1, from / yMax), c);
			g.addColorStop(Math.min(1, to / yMax), c);
		}
		return g;
	};
	const grad = bandGradient(0.28);

	// area
	ctx.beginPath();
	ctx.moveTo(x(times[0].getTime()), y(0));
	for (let i = 0; i < times.length; i++) {
		ctx.lineTo(x(times[i].getTime()), y(uvData[i]));
	}
	ctx.lineTo(x(times[times.length - 1].getTime()), y(0));
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();

	// line
	ctx.beginPath();
	ctx.moveTo(x(times[0].getTime()), y(uvData[0]));
	for (let i = 1; i < times.length; i++) {
		const px = x(times[i - 1].getTime());
		const py = y(uvData[i - 1]);
		const cx = x(times[i].getTime());
		const cy = y(uvData[i]);
		const mx = (px + cx) / 2;
		ctx.bezierCurveTo(mx, py, mx, cy, cx, cy);
	}
	ctx.strokeStyle = bandGradient(1);
	ctx.lineWidth = 2.5;
	ctx.lineJoin = "round";
	ctx.stroke();

	// current time marker
	const now = (currentTime || new Date()).getTime();
	if (now >= minTime && now <= maxTime) {
		const nx = x(now);
		const nowInk = token("--ink");
		ctx.strokeStyle = nowInk;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([3, 3]);
		ctx.beginPath(); ctx.moveTo(nx, padT); ctx.lineTo(nx, padT + ch); ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = nowInk;
		ctx.font = "bold 10px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		const labelW = ctx.measureText("Now").width + 8;
		ctx.fillRect(nx - labelW / 2, padT - 2, labelW, 14);
		ctx.fillStyle = token("--surface");
		ctx.fillText("Now", nx, padT + 11);
	}
}

/* ---------- UV Risk Legend ---------- */

export function renderUVLegend(container) {
	if (!container) return;
	container.replaceChildren(...[
		["low", "Low", "0–2"], ["moderate", "Moderate", "3–5"], ["high", "High", "6–7"],
		["very-high", "Very high", "8–10"], ["extreme", "Extreme", "11+"],
	].map(([key, label, range]) => {
		const item = document.createElement("div");
		item.className = `uv-legend-item band-${key}`;
		const name = document.createElement("b");
		name.textContent = label;
		item.append(name, range);
		return item;
	}));
}
