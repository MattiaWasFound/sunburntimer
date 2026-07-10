import { formatInTimeZone, getUVIndexColor, getUVRiskLevel } from "./utils.js";

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

	// grid
	ctx.strokeStyle = "rgba(0,0,0,0.05)";
	ctx.lineWidth = 1;
	ctx.fillStyle = "#64748b";
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
	grad.addColorStop(0, "rgba(249,115,22,0.3)");
	grad.addColorStop(0.6, "rgba(251,191,36,0.2)");
	grad.addColorStop(1, "rgba(255,255,255,0.1)");

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
	ctx.strokeStyle = "#f97316";
	ctx.lineWidth = 2.5;
	ctx.lineJoin = "round";
	ctx.stroke();

	// points
	for (const d of data) {
		ctx.beginPath();
		ctx.arc(x(d.time.getTime()), y(d.damage), 3, 0, Math.PI * 2);
		ctx.fillStyle = "#f97316";
		ctx.fill();
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1.5;
		ctx.stroke();
	}

	// burn threshold line
	ctx.strokeStyle = "rgba(220,38,38,0.4)";
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

	// grid
	ctx.strokeStyle = "rgba(148,163,184,0.1)";
	ctx.lineWidth = 1;
	ctx.fillStyle = "#64748b";
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
	const tickCount = Math.min(8, times.length);
	for (let i = 0; i < tickCount; i++) {
		const idx = Math.floor((i / (tickCount - 1)) * (times.length - 1));
		ctx.fillText(formatInTimeZone(times[idx], timezone, "h a"), x(times[idx].getTime()), padT + ch + 8);
	}

	// gradient fill based on UV levels
	const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
	grad.addColorStop(0, "rgba(239,68,68,0.3)");
	grad.addColorStop(0.3, "rgba(245,158,11,0.3)");
	grad.addColorStop(0.6, "rgba(34,197,94,0.3)");
	grad.addColorStop(1, "rgba(34,197,94,0.1)");

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
	ctx.strokeStyle = "#f59e0b";
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	ctx.stroke();

	// current time marker
	const now = (currentTime || new Date()).getTime();
	if (now >= minTime && now <= maxTime) {
		const nx = x(now);
		ctx.strokeStyle = "#dc2626";
		ctx.lineWidth = 1.5;
		ctx.setLineDash([3, 3]);
		ctx.beginPath(); ctx.moveTo(nx, padT); ctx.lineTo(nx, padT + ch); ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = "#dc2626";
		ctx.font = "bold 10px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		const labelW = ctx.measureText("Now").width + 8;
		ctx.fillRect(nx - labelW / 2, padT - 2, labelW, 14);
		ctx.fillStyle = "#fff";
		ctx.fillText("Now", nx, padT + 11);
	}
}

/* ---------- UV Risk Legend ---------- */

export function renderUVLegend(container) {
	if (!container) return;
	container.innerHTML = "";
	const bands = [
		{ range: "0-2", label: "Low", uv: 1 },
		{ range: "3-5", label: "Moderate", uv: 4 },
		{ range: "6-7", label: "High", uv: 7 },
		{ range: "8-10", label: "Very High", uv: 9 },
		{ range: "11+", label: "Extreme", uv: 12 },
	];
	for (const b of bands) {
		const c = getUVIndexColor(b.uv);
		const div = document.createElement("div");
		div.className = "uv-legend-item";
		div.style.backgroundColor = c.bg;
		div.innerHTML = `<div class="uv-legend-label" style="color:${c.text}">${b.label}</div><div style="color:${c.text};opacity:0.75">${b.range}</div>`;
		container.appendChild(div);
	}
}
