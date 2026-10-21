"use strict";
/* ================= CONFIG ================= */
const API_KEY = "d3a0f4c0f205e62c85931eac5385b6ba"; // 👉 replace with your own OpenWeatherMap key
const DEFAULT_CITY = "Dhaka", REFRESH_MIN = 10, API = "https://api.openweathermap.org";

/* ================= HELPERS ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} } };
const S = { unit: ls.get("wx_unit", "metric"), tab: "temp", chart: null, prevT: null };
const UN = {
  metric: { t: c => c, tu: "°C", w: m => m * 3.6, wu: "km/h", v: m => m / 1000, vu: "km" },
  imperial: { t: c => c * 9 / 5 + 32, tu: "°F", w: m => m * 2.237, wu: "mph", v: m => m / 1609.34, vu: "mi" }
};
const U = () => UN[S.unit], T = c => Math.round(U().t(c)) + "°";
const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const loc = u => new Date((u + S.cur.timezone) * 1e3); // city-local time (read with getUTC*)
const hr = (u, m = 1) => { const d = loc(u); let h = d.getUTCHours(); const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return m ? `${h}:${String(d.getUTCMinutes()).padStart(2, "0")} ${ap}` : `${h} ${ap}` };
const dk = u => { const d = loc(u); return d.getUTCFullYear() * 1e4 + d.getUTCMonth() * 100 + d.getUTCDate() };
const night = () => S.cur.dt < S.cur.sys.sunrise || S.cur.dt > S.cur.sys.sunset;
const compass = d => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(d / 22.5) % 16];
const dew = (t, h) => { const g = Math.log(h / 100) + 17.62 * t / (243.12 + t); return 243.12 * g / (17.62 - g) };
const sev = id => id < 300 ? 5 : id < 400 ? 3 : id < 600 ? 4 : id < 700 ? 4 : id < 800 ? 2 : id > 802 ? 1 : 0;

/* ================= API ================= */
class Err extends Error {}
async function api(p, q) {
  let r;
  try { r = await fetch(API + p + "?" + new URLSearchParams({ ...q, appid: API_KEY })) } catch { throw new Err("network") }
  if (!r.ok) throw new Err(r.status === 401 ? "key" : r.status === 429 ? "limit" : r.status === 404 ? "notfound" : "server");
  return r.json();
}
const MSG = { notfound: "City not found !! Please check the spelling.", key: "Invalid API key — set API_KEY in weather.js", limit: "Too many requests — wait a minute and retry.", network: "No internet connection.", server: "Weather server error — try again later." };
const fail = e => Swal.fire({ icon: "error", title: "Oops...", text: MSG[e.message] || "Something went wrong.", confirmButtonColor: "#ffaa00", background: "rgba(255,255,255,.95)" });

async function load(g, silent) {
  document.body.classList.add("busy");
  try {
    const p = { lat: g.lat, lon: g.lon }, m = { ...p, units: "metric" };
    const [cur, fc, air, airFc] = await Promise.all([
      api("/data/2.5/weather", m), api("/data/2.5/forecast", m),
      api("/data/2.5/air_pollution", p).catch(() => null), api("/data/2.5/air_pollution/forecast", p).catch(() => null)
    ]);
    Object.assign(S, { geo: g, cur, fc, air, airFc, at: Date.now() });
    ls.set("wx_last", g); pushRecent(g); render();
  } catch (e) { console.error(e); silent || fail(e) }
  finally { document.body.classList.remove("busy"); $("#skeleton").hidden = true }
}

/* ================= ANIMATED EMOJI (changes with weather + day/night) ================= */
function icon(id, n) { // -> [emoji, animation kind, badge]
  if (id < 300) return [id >= 210 && id <= 221 ? "🌩️" : "⛈️", "thunder"];
  if (id < 400) return [n ? "🌧️" : "🌦️", "rain"];
  if (id < 600) return [id === 500 && !n ? "🌦️" : id === 511 ? "🌨️" : "🌧️", "rain"];
  if (id < 700) return [id === 600 || id === 620 ? "🌨️" : "❄️", "snow"];
  if (id === 781) return ["🌪️", "wind"];
  if (id === 771) return ["💨", "wind"];
  if (id < 800) return ["🌫️", "mist"];
  if (id === 800) return n ? ["🌙", "moon"] : ["☀️", "sun"];
  if (id === 801) return n ? ["🌙", "moon", "☁️"] : ["🌤️", "sun"];
  if (id === 802) return n ? ["☁️", "cloud", "🌙"] : ["⛅", "sun"];
  return [n || id === 804 ? "☁️" : "🌥️", "cloud"];
}
function heroIcon(id, n) {
  const [e, k, b] = icon(id, n), r = [...Array(k === "thunder" || k === "rain" ? 7 : 6).keys()];
  let x = "";
  if (k === "rain" || k === "thunder") x = r.map(i => `<i class="drop" style="--x:${12 + i * 12}%;--d:${(i * .23) % 1}s"></i>`).join("");
  if (k === "snow") x = r.map(i => `<i class="flake" style="--x:${10 + i * 15}%;--d:${i * .4}s">❄</i>`).join("");
  if (n && (k === "moon" || k === "cloud")) x = r.map(i => `<i class="star" style="--x:${(i * 37) % 90 + 5}%;--y:${(i * 53) % 80 + 5}%;--d:${i * .5}s">✦</i>`).join("");
  return `<div class="wx wx-${k}"><span class="glow"></span><span class="em">${e}</span>${b ? `<span class="badge">${b}</span>` : ""}${x}${k === "thunder" ? '<span class="bolt">⚡</span>' : ""}</div>`;
}

/* ================= SKY GRADIENT + PARTICLES ================= */
const skyOf = (id, n) => { const d = n ? "night" : "day"; return id < 300 ? "thunder" : id < 600 ? "rain-" + d : id < 700 ? "snow-" + d : id < 800 ? "mist" : id < 803 ? "clear-" + d : "clouds-" + d };
const TC = { "clear-day": "#1a8cff", "clear-night": "#0b1026", "clouds-day": "#5b86a8", "clouds-night": "#1c2430", "rain-day": "#36505f", "rain-night": "#0f1720", thunder: "#1a1a2e", "snow-day": "#5c88b5", "snow-night": "#2b3a55", mist: "#7b8a94" };
let skyNow;
function setSky(k) {
  if (k === skyNow) return; skyNow = k;
  const e = document.createElement("div"); e.className = "sky sky-" + k; $("#skies").append(e);
  requestAnimationFrame(() => requestAnimationFrame(() => e.classList.add("on")));
  const old = [...$("#skies").children].filter(c => c !== e);
  setTimeout(() => old.forEach(o => o.remove()), 1500);
  $("#tc").content = TC[k];
}
function fxOf(id, n, w) {
  const f = { rain: 0, snow: 0, stars: 0, sun: 0, clouds: 0, tone: "light", mist: 0, thunder: 0, slant: Math.min(6, w * .4) };
  if (id < 300) Object.assign(f, { rain: 1, thunder: 1, clouds: 6, tone: "dark" });
  else if (id < 400) Object.assign(f, { rain: .4, clouds: 5, tone: "gray" });
  else if (id < 600) Object.assign(f, { rain: id === 500 ? .5 : id === 501 ? .8 : 1, clouds: 6, tone: "dark" });
  else if (id < 700) Object.assign(f, { snow: id === 600 ? .5 : 1, clouds: 4, tone: "gray" });
  else if (id < 800) Object.assign(f, { mist: 1, clouds: 3, tone: "gray" });
  else { if (id < 803) n ? f.stars = 1 : f.sun = 1; f.clouds = [0, 2, 4, 6, 8][id - 800]; f.tone = id > 802 ? "gray" : "light" }
  return f;
}
const fx = (() => {
  const c = $("#fx"), x = c.getContext("2d"), R = Math.random, rm = matchMedia("(prefers-reduced-motion:reduce)").matches, sp = {};
  let W, H, cfg, P = [], last = 0, fl = 0, bolt = null, nb = 0;
  const spr = t => sp[t] || (sp[t] = (() => {
    const k = document.createElement("canvas"); k.width = 360; k.height = 160;
    const g = k.getContext("2d"), col = { light: "255,255,255", gray: "205,212,220", dark: "80,90,108" }[t];
    [[110, 95, 70], [180, 75, 85], [250, 95, 65], [160, 105, 60]].forEach(([a, b, r]) => {
      const q = g.createRadialGradient(a, b, 0, a, b, r); q.addColorStop(0, `rgba(${col},.9)`); q.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = q; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill();
    }); return k;
  })());
  function size() { const d = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; c.width = W * d; c.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); if (cfg) build() }
  function build() {
    P = []; const a = W * H;
    for (let i = 0; i < Math.min(260, a / 2600) * cfg.rain; i++) P.push({ k: "r", x: R() * (W + 100), y: R() * H, l: 10 + R() * 14, v: 12 + R() * 8, a: .15 + R() * .3 });
    for (let i = 0; i < Math.min(150, a / 5000) * cfg.snow; i++) P.push({ k: "s", x: R() * W, y: R() * H, r: 1 + R() * 2.5, v: .6 + R() * 1.2, p: R() * 6 });
    for (let i = 0; i < Math.min(130, a / 4500) * cfg.stars; i++) P.push({ k: "t", x: R() * W, y: R() * H * .7, r: .4 + R() * 1.4, p: R() * 6, s: .001 + R() * .002 });
    for (let i = 0; i < cfg.clouds; i++) P.push({ k: "c", x: R() * W, y: R() * H * .55 - 20, s: .8 + R() * 1.2, v: .1 + R() * .3, a: (cfg.tone === "dark" ? .5 : .35) + R() * .2 });
    for (let i = 0; i < cfg.mist * 4; i++) P.push({ k: "m", x: R() * W, y: H * .3 + R() * H * .6, v: .15 + R() * .2 });
  }
  const mk = () => { let a = W * (.2 + R() * .6), b = 0; const p = [[a, b]]; while (b < H * .55) { a += R() * 50 - 25; b += 20 + R() * 25; p.push([a, b]) } return p };
  function glow(px, py, rad, col) { const g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, `rgba(${col},.6)`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(0, 0, W, H) }
  function loop(t) {
    requestAnimationFrame(loop);
    if (!cfg || rm || document.hidden) return;
    const dt = Math.min(3, (t - (last || t)) / 16.7); last = t; x.clearRect(0, 0, W, H);
    if (cfg.sun) glow(W * .85, H * .08, Math.max(W, H) * .6 * (1 + .04 * Math.sin(t / 900)), "255,240,180");
    if (cfg.stars) glow(W * .82, H * .1, Math.min(W, H) * .45, "200,215,255");
    for (const p of P) {
      if (p.k === "t") { x.globalAlpha = .3 + .7 * Math.abs(Math.sin(t * p.s + p.p)); x.fillStyle = "#fff"; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill() }
      else if (p.k === "c") { p.x += p.v * dt; if (p.x > W) p.x = -360 * p.s; x.globalAlpha = p.a; x.drawImage(spr(cfg.tone), p.x, p.y, 360 * p.s, 160 * p.s) }
      else if (p.k === "m") { p.x += p.v * dt; if (p.x > W) p.x = -W * 1.6; x.globalAlpha = .22; x.drawImage(spr("light"), p.x, p.y, W * 1.6, 200) }
      else if (p.k === "r") { p.y += p.v * dt; p.x += cfg.slant * dt; if (p.y > H) { p.y = -20; p.x = R() * (W + 100) - cfg.slant * 20 } if (p.x > W + 50) p.x = -50; x.globalAlpha = p.a; x.strokeStyle = "#cfe6ff"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - cfg.slant * 1.6, p.y - p.l); x.stroke() }
      else { p.y += p.v * dt; p.x += Math.sin(t / 900 + p.p) * .6 + cfg.slant * .1 * dt; if (p.y > H) { p.y = -5; p.x = R() * W } x.globalAlpha = .85; x.fillStyle = "#fff"; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill() }
    }
    x.globalAlpha = 1;
    if (cfg.thunder) { // random lightning bolts + screen flash
      if (t > nb) { fl = 1; bolt = mk(); nb = t + 2500 + R() * 6000 }
      if (fl > .02) {
        x.fillStyle = `rgba(220,230,255,${fl * .35})`; x.fillRect(0, 0, W, H);
        x.strokeStyle = `rgba(255,255,255,${fl})`; x.lineWidth = 2; x.shadowColor = "#9cf"; x.shadowBlur = 18; x.beginPath();
        bolt.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.stroke(); x.shadowBlur = 0; fl *= Math.pow(.9, dt);
      }
    }
  }
  size(); addEventListener("resize", size); requestAnimationFrame(loop);
  return { set(f) { cfg = f; build() } };
})();

/* ================= UI SECTIONS ================= */
function count(s, a, b) { const e = $(s), t0 = performance.now(); a = a ?? 0; (function f(t) { const p = Math.min(1, (t - t0) / 900); e.textContent = Math.round(a + (b - a) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f) })(t0) }

function hero() {
  const c = S.cur, w = c.weather[0], v = Math.round(U().t(c.main.temp));
  $("#hero").innerHTML = `<h1>${esc(S.geo.name || c.name)}<small>${esc(c.sys.country || "")}</small></h1>
  <p class="meta">${S.geo.state ? esc(S.geo.state) + " · " : ""}<span id="clock"></span></p>
  ${heroIcon(w.id, night())}
  <div class="temp"><span id="tn">0</span><sup>${U().tu}</sup></div>
  <p class="cond">${esc(w.description)}</p>
  <div class="pills"><span>Feels ${T(c.main.feels_like)}</span><span>↑ ${T(c.main.temp_max)}</span><span>↓ ${T(c.main.temp_min)}</span></div>`;
  count("#tn", S.prevT, v); S.prevT = v;
}
function tips() {
  const c = S.cur, t = c.main.temp, id = c.weather[0].id, a = [], pop = Math.max(...S.fc.list.slice(0, 4).map(i => i.pop)), q = S.air?.list?.[0].main.aqi;
  if (id < 300) a.push("⛈️ Thunderstorm nearby — stay indoors");
  if (pop >= .4) a.push(`☔ Carry an umbrella — ${Math.round(pop * 100)}% rain chance soon`);
  if (t >= 35) a.push("🥵 Very hot — drink water, avoid midday sun");
  else if (t >= 30 && c.main.humidity >= 70) a.push("😓 Hot & humid — dress light, stay hydrated");
  if (t <= 10) a.push("🧥 Cold — wear a jacket");
  if (c.wind.speed >= 10) a.push("💨 Strong wind — secure loose items");
  if ((c.visibility ?? 1e4) < 2000) a.push("🌫️ Low visibility — drive carefully");
  if (q >= 4) a.push("😷 Poor air quality — consider a mask");
  if (id === 800 && !night()) a.push("🕶️ Clear sunny sky — sunglasses & sunscreen");
  if (!a.length) a.push("✨ Pleasant weather — enjoy your day!");
  $("#tips").innerHTML = a.map(x => `<p>${x}</p>`).join("");
}
function hourly() {
  const L = S.fc.list.slice(0, 12), c = S.cur;
  const H = [{ dt: c.dt, t: c.main.temp, id: c.weather[0].id, n: night(), pop: L[0].pop, now: 1 }, ...L.map(i => ({ dt: i.dt, t: i.main.temp, id: i.weather[0].id, n: i.sys.pod === "n", pop: i.pop }))];
  $("#hourly").innerHTML = `<h3>Hourly</h3><div class="strip">` + H.map(h => `<div class="hr${h.now ? " now" : ""}"><b>${h.now ? "Now" : hr(h.dt, 0)}</b><span class="mi">${icon(h.id, h.n)[0]}</span><strong>${T(h.t)}</strong><em>${h.pop > .1 ? "💧" + Math.round(h.pop * 100) + "%" : "&nbsp;"}</em></div>`).join("") + "</div>";
}
function daily() {
  const m = new Map();
  S.fc.list.forEach(i => { const k = dk(i.dt); (m.get(k) || m.set(k, []).get(k)).push(i) });
  return [...m.values()].slice(0, 5).map((it, j) => {
    const t = it.map(i => i.main.temp); if (j === 0) t.push(S.cur.main.temp);
    const noon = i => Math.abs(loc(i.dt).getUTCHours() - 12);
    const pick = it.filter(i => i.pop >= .35).sort((a, b) => sev(b.weather[0].id) - sev(a.weather[0].id))[0] || it.reduce((a, b) => noon(b) < noon(a) ? b : a);
    return { n: j ? D[loc(it[0].dt).getUTCDay()] : "Today", hi: Math.max(...t), lo: Math.min(...t), id: pick.weather[0].id, pop: Math.max(...it.map(i => i.pop)) };
  });
}
function dailyUI() {
  const d = daily(), mn = Math.min(...d.map(x => x.lo)), r = (Math.max(...d.map(x => x.hi)) - mn) || 1;
  $("#daily").innerHTML = "<h3>5-Day Forecast</h3>" + d.map(x => `<div class="day"><b>${x.n}</b><span class="mi">${icon(x.id, 0)[0]}</span><em>${x.pop > .1 ? "💧" + Math.round(x.pop * 100) + "%" : ""}</em><i>${T(x.lo)}</i><div class="rg"><u style="left:${(x.lo - mn) / r * 100}%;width:${Math.max(6, (x.hi - x.lo) / r * 100)}%"></u></div><strong>${T(x.hi)}</strong></div>`).join("");
}
function stats() {
  const c = S.cur, m = c.main, u = U(), vis = c.visibility ?? 1e4, pd = S.fc.list[2].main.pressure - m.pressure, dr = c.wind.deg ?? 0, dl = c.sys.sunset - c.sys.sunrise;
  const cell = (i, l, v, s = "", b) => `<div class="st"><p>${i} ${l}</p><strong>${v}</strong><small>${s}</small>${b != null ? `<div class="bar"><u style="width:${b}%"></u></div>` : ""}</div>`;
  $("#stats").innerHTML = "<h3>Details</h3><div class='sg'>" +
    cell("🌡️", "Feels like", T(m.feels_like), "Dew point " + T(dew(m.temp, m.humidity))) +
    cell("💦", "Humidity", m.humidity + "%", "", m.humidity) +
    cell("💨", "Wind", `${u.w(c.wind.speed).toFixed(1)} ${u.wu}`, `<span class="cp" style="--r:${dr + 90}deg">➤</span> ${compass(dr)}${c.wind.gust ? " · gust " + u.w(c.wind.gust).toFixed(0) : ""}`) +
    cell("🧭", "Pressure", m.pressure + " hPa", pd > 2 ? "↗ Rising" : pd < -2 ? "↘ Falling" : "→ Steady") +
    cell("👁️", "Visibility", `${u.v(vis).toFixed(1)} ${u.vu}`, "", Math.min(100, vis / 100)) +
    cell("☁️", "Clouds", c.clouds.all + "%", "", c.clouds.all) +
    cell("🌅", "Sunrise", hr(c.sys.sunrise)) +
    cell("🌇", "Sunset", hr(c.sys.sunset), `${Math.floor(dl / 3600)}h ${Math.floor(dl % 3600 / 60)}m daylight`) + "</div>";
}
const AQ = [0, { n: "Good", c: "#4ade80", t: "Air is clean — enjoy outdoors" }, { n: "Fair", c: "#a3e635", t: "Acceptable for most people" }, { n: "Moderate", c: "#facc15", t: "Sensitive people should limit long outdoor activity" }, { n: "Poor", c: "#fb923c", t: "Reduce prolonged outdoor exertion" }, { n: "Very Poor", c: "#ef4444", t: "Avoid outdoor activity, wear a mask" }];
const PL = [["pm2_5", "PM2.5", [10, 25, 50, 75]], ["pm10", "PM10", [20, 50, 100, 200]], ["o3", "O₃", [60, 100, 140, 180]], ["no2", "NO₂", [40, 70, 150, 200]], ["so2", "SO₂", [20, 80, 250, 350]], ["co", "CO", [4400, 9400, 12400, 15400]]];
function aqiUI() {
  const a = S.air?.list?.[0], el = $("#aqi"); el.hidden = !a; if (!a) return;
  const q = a.main.aqi, i = AQ[q];
  el.innerHTML = `<h3>Air Quality</h3><div class="aq"><div class="num" style="color:${i.c}">${q}</div><div><b style="color:${i.c}">${i.n}</b><p>${i.t}</p></div></div>
  <div class="scale">${AQ.slice(1).map((z, k) => `<u style="background:${z.c};opacity:${k + 1 === q ? 1 : .35}"></u>`).join("")}</div>` +
    PL.map(([k, n, t]) => { const v = a.components[k], l = t.filter(z => v >= z).length; return `<div class="pl"><span>${n}</span><div class="bar"><u style="width:${Math.min(100, v / (t[3] * 1.25) * 100)}%;background:${AQ[l + 1].c}"></u></div><em>${v.toFixed(1)}</em></div>` }).join("");
}

/* ================= GRAPHS (Chart.js) ================= */
const TABS = [["temp", "🌡️ Temp"], ["rain", "🌧️ Rain"], ["wind", "💨 Wind"], ["hum", "💦 Humidity"], ["pres", "🧭 Pressure"], ["daily", "📊 Daily"], ["aqi", "🌫️ AQI"]];
function charts() {
  const tabs = TABS.filter(t => t[0] !== "aqi" || S.airFc); if (!tabs.some(t => t[0] === S.tab)) S.tab = "temp";
  $("#charts").innerHTML = `<h3>Graphs</h3><div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === S.tab ? "on" : ""}">${l}</button>`).join("")}</div><div class="cs"><div class="cb ${["daily", "aqi"].includes(S.tab) ? "" : "wide"}"><canvas id="cv"></canvas></div></div>`;
  $("#charts .tabs").onclick = e => { const k = e.target.dataset.t; if (k) { S.tab = k; charts() } };
  draw();
}
function draw() {
  if (!window.Chart) return;
  const u = U(), L = S.fc.list, COL = "rgba(255,255,255,.88)", f1 = v => +v.toFixed(1), tl = i => D[loc(i.dt).getUTCDay()] + " " + hr(i.dt, 0);
  Chart.defaults.font.family = "Outfit,sans-serif";
  const grad = rgb => c => { const a = c.chart.chartArea; if (!a) return "transparent"; const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, `rgba(${rgb},.5)`); g.addColorStop(1, `rgba(${rgb},0)`); return g };
  const ln = (label, data, rgb, o = {}) => ({ type: "line", label, data, borderColor: `rgb(${rgb})`, backgroundColor: o.f ? grad(rgb) : "transparent", fill: !!o.f, tension: .4, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5, borderDash: o.d || [], yAxisID: o.y || "y" });
  const A = (S.airFc?.list || []).filter((_, i) => i % 3 === 0).slice(0, 32), dd = daily();
  const M = {
    temp: { d: [ln("Temp " + u.tu, L.map(i => f1(u.t(i.main.temp))), "255,209,102", { f: 1 }), ln("Feels like", L.map(i => f1(u.t(i.main.feels_like))), "255,107,107", { d: [6, 5] })] },
    rain: { max: 100, d: [{ type: "bar", label: "Rain chance %", data: L.map(i => Math.round(i.pop * 100)), backgroundColor: "rgba(79,172,254,.65)", borderRadius: 6 }, ln("Volume mm", L.map(i => (i.rain?.["3h"] || 0) + (i.snow?.["3h"] || 0)), "139,233,253", { y: "y1" })] },
    wind: { d: [ln("Wind " + u.wu, L.map(i => f1(u.w(i.wind.speed))), "134,239,172", { f: 1 }), ln("Gust", L.map(i => f1(u.w(i.wind.gust ?? i.wind.speed))), "253,224,71", { d: [6, 5] })] },
    hum: { max: 100, d: [ln("Humidity %", L.map(i => i.main.humidity), "96,165,250", { f: 1 }), ln("Clouds %", L.map(i => i.clouds.all), "226,232,240", { d: [6, 5] })] },
    pres: { d: [ln("Pressure hPa", L.map(i => i.main.pressure), "192,132,252", { f: 1 })] },
    daily: { lb: dd.map(x => x.n), d: [{ type: "bar", label: "Low–High " + u.tu, data: dd.map(x => [f1(u.t(x.lo)), f1(u.t(x.hi))]), backgroundColor: "rgba(255,170,0,.8)", borderRadius: 12, borderSkipped: false }] },
    aqi: { max: 5, lb: A.map(tl), d: [{ type: "bar", label: "AQI (1–5)", data: A.map(i => i.main.aqi), backgroundColor: A.map(i => AQ[i.main.aqi].c), borderRadius: 4 }, ln("PM2.5 µg/m³", A.map(i => i.components.pm2_5), "255,255,255", { y: "y1" })] }
  };
  const t = M[S.tab], bar = ["rain", "daily", "aqi"].includes(S.tab);
  S.chart?.destroy();
  S.chart = new Chart($("#cv"), {
    type: "line", data: { labels: t.lb || L.map(tl), datasets: t.d },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: COL, usePointStyle: true, boxWidth: 8 } }, tooltip: { backgroundColor: "rgba(10,15,30,.9)", padding: 10, cornerRadius: 10 } },
      scales: {
        x: { offset: bar, ticks: { color: COL, maxRotation: 0, maxTicksLimit: 9 }, grid: { display: false } },
        y: { min: t.max ? 0 : undefined, max: t.max, beginAtZero: ["wind", "hum"].includes(S.tab), ticks: { color: COL }, grid: { color: "rgba(255,255,255,.12)" } },
        y1: { display: ["rain", "aqi"].includes(S.tab), position: "right", beginAtZero: true, ticks: { color: COL }, grid: { display: false } }
      }
    }
  });
}

/* ================= RENDER + EVENTS ================= */
function render() {
  const c = S.cur, n = night(), id = c.weather[0].id;
  $("#main").hidden = false;
  hero(); tips(); hourly(); dailyUI(); stats(); aqiUI(); charts(); tick();
  setSky(skyOf(id, n)); fx.set(fxOf(id, n, c.wind.speed));
}
function tick() { // live city clock
  if (!S.cur) return; const e = $("#clock"); if (!e) return;
  const u = Date.now() / 1e3, d = loc(u); e.textContent = `${D[d.getUTCDay()]}, ${d.getUTCDate()} · ${hr(u)}`;
}
setInterval(tick, 1000);
setInterval(() => { if (S.geo && !document.hidden && Date.now() - S.at > REFRESH_MIN * 6e4) load(S.geo, 1) }, 6e4);

const rec = () => ls.get("wx_recent", []);
function pushRecent(g) { const k = x => x.lat.toFixed(2) + x.lon.toFixed(2); ls.set("wx_recent", [g, ...rec().filter(x => k(x) !== k(g))].slice(0, 6)); drawRecent() }
function drawRecent() { $("#recent").innerHTML = rec().map((g, i) => `<button data-i="${i}">${esc(g.name)}<span data-x="${i}">✕</span></button>`).join("") }
$("#recent").onclick = e => {
  const x = e.target.dataset.x; if (x != null) { const r = rec(); r.splice(x, 1); ls.set("wx_recent", r); drawRecent(); return }
  const b = e.target.closest("button"); if (b) load(rec()[b.dataset.i]);
};
const syncUnit = () => $("#unit").textContent = U().tu;
$("#unit").onclick = () => { S.unit = S.unit === "metric" ? "imperial" : "metric"; ls.set("wx_unit", S.unit); S.prevT = null; syncUnit(); if (S.cur) render() };

$("#search-box").onsubmit = async e => {
  e.preventDefault(); const q = $("#search-bar").value.trim(); if (!q) return; $("#search-bar").blur();
  try { const [g] = await api("/geo/1.0/direct", { q, limit: 1 }); if (!g) throw new Err("notfound"); load(g) } catch (x) { fail(x) }
};
let tm;
$("#search-bar").oninput = e => { // city suggestions
  clearTimeout(tm); const q = e.target.value.trim(); if (q.length < 2) return;
  tm = setTimeout(async () => { try { $("#sugg").innerHTML = (await api("/geo/1.0/direct", { q, limit: 5 })).map(g => `<option value="${esc(g.name)},${g.country}" label="${esc([g.state, g.country].filter(Boolean).join(", "))}">`).join("") } catch {} }, 300);
};
$("#locate").onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(async p => {
  const { latitude: lat, longitude: lon } = p.coords; let g = { name: "My location", country: "", lat, lon };
  try { const [r] = await api("/geo/1.0/reverse", { lat, lon, limit: 1 }); if (r) g = r } catch {}
  load(g);
}, () => Swal.fire({ icon: "info", title: "Location blocked", text: "Allow location access in your browser settings.", confirmButtonColor: "#ffaa00" }));

/* ================= START ================= */
syncUnit(); drawRecent(); setSky("clear-day");
(async () => {
  try { const g = ls.get("wx_last", null) || (await api("/geo/1.0/direct", { q: DEFAULT_CITY, limit: 1 }))[0]; g && load(g) }
  catch (e) { $("#skeleton").hidden = true; fail(e) }
})();
