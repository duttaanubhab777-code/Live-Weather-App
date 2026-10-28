"use strict";
/* =====================================================================
   Live Weather — weather.js
   Data flow:  browser → /api/owm (Vercel function, holds the secret key)
                       → OpenWeatherMap
   There is NO API key in this file. See api/owm.js and README.md.
   ===================================================================== */

/* ================= CONFIG ================= */
const DEFAULT_CITY = "Kolkata",
    REFRESH_MIN = 10, // auto refresh when the tab is open
    API = "/api/owm"; // our own serverless proxy

/* ================= HELPERS ================= */
const $ = s => document.querySelector(s);
const esc = s =>
    String(s ?? "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = matchMedia("(prefers-reduced-motion:reduce)").matches;
const ls = {
    get(k, d) {
        try {
            return JSON.parse(localStorage.getItem(k)) ?? d;
        } catch {
            return d;
        }
    },
    set(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        } catch {}
    }
};

/* ================= STATE + UNITS ================= */
const S = {
    unit: ls.get("wx_unit", "metric") === "imperial" ? "imperial" : "metric",
    tab: "temp",
    chart: null,
    prevT: null,
    req: 0, // request counter — ignores out-of-order responses
    cur: null,
    fc: null,
    air: null,
    airFc: null,
    geo: null,
    at: 0
};
const UN = {
    metric: {
        t: c => c,
        tu: "°C",
        w: m => m * 3.6,
        wu: "km/h",
        v: m => m / 1000,
        vu: "km"
    },
    imperial: {
        t: c => (c * 9) / 5 + 32,
        tu: "°F",
        w: m => m * 2.23694,
        wu: "mph",
        v: m => m / 1609.34,
        vu: "mi"
    }
};
const U = () => UN[S.unit],
    T = c => Math.round(U().t(c)) + "°";

const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// city-local time: shift the UTC timestamp, then read with getUTC*()
const loc = u => new Date((u + (S.cur?.timezone ?? 0)) * 1e3);
const hr = (u, withMin = 1) => {
    const d = loc(u);
    let h = d.getUTCHours();
    const ap = h < 12 ? "AM" : "PM";
    h = h % 12 || 12;
    return withMin
        ? `${h}:${String(d.getUTCMinutes()).padStart(2, "0")} ${ap}`
        : `${h} ${ap}`;
};
const dayKey = u => {
    const d = loc(u);
    return d.getUTCFullYear() * 1e4 + d.getUTCMonth() * 100 + d.getUTCDate();
};
// OpenWeather icon codes end with "d" (day) or "n" (night) — works even in polar regions
const isNight = () => {
    const w = S.cur.weather[0];
    if (w.icon) return w.icon.endsWith("n");
    const s = S.cur.sys;
    return S.cur.dt < s.sunrise || S.cur.dt > s.sunset;
};
const compass = d =>
    [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW"
    ][Math.round(d / 22.5) % 16];
const dew = (t, h) => {
    const g = Math.log(Math.max(h, 1) / 100) + (17.62 * t) / (243.12 + t);
    return (243.12 * g) / (17.62 - g);
};
// how "bad" a condition is — used to pick the icon for a whole day
const sev = id =>
    id < 300
        ? 5
        : id < 400
          ? 3
          : id < 700
            ? 4
            : id < 800
              ? 2
              : id > 802
                ? 1
                : 0;
const hexRgb = h => {
    const m = String(h).trim().replace("#", "");
    const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/* ================= TOAST + ERRORS ================= */
let toastTimer;
function toast(msg, ms = 4200) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
const MSG = {
    notfound: "City not found. Check the spelling and try again.",
    nokey: "The server has no API key yet. Add OPENWEATHER_API_KEY in Vercel → Settings → Environment Variables, then redeploy.",
    key: "OpenWeather rejected the API key. Check that it is correct and activated (new keys can take up to 2 hours).",
    limit: "Too many requests. Wait a minute and try again.",
    network: "No internet connection.",
    noapi: "The /api/owm route wasn’t found. Deploy on Vercel, or run “vercel dev” locally.",
    server: "The weather service is having trouble. Try again in a moment."
};
class Err extends Error {}

function showEmpty(e) {
    const code = MSG[e?.message] ? e.message : "server";
    $("#skeleton").hidden = true;
    $("#main").hidden = true;
    $("#empty-ico").innerHTML = Ico.ui(code === "network" ? "wifi" : "alert");
    $("#empty-title").textContent =
        code === "notfound" ? "City not found" : "Couldn’t load the weather";
    $("#empty-text").textContent = MSG[code];
    $("#empty").hidden = false;
}
// first load → full empty state; later (we already have data) → small toast
const fail = e => (S.cur ? toast(MSG[e?.message] || MSG.server) : showEmpty(e));

/* ================= API (through our proxy) ================= */
async function api(path, params = {}) {
    let r;
    try {
        r = await fetch(API + "?" + new URLSearchParams({ path, ...params }));
    } catch {
        throw new Err("network");
    }
    const isJson = (r.headers.get("content-type") || "").includes("json");
    if (!r.ok) {
        let code = "";
        if (isJson) {
            try {
                code = (await r.json()).error || "";
            } catch {}
        }
        throw new Err(
            code === "missing_key"
                ? "nokey"
                : code === "upstream_key_rejected"
                  ? "key"
                  : r.status === 429
                    ? "limit"
                    : r.status === 404 && !code
                      ? "noapi"
                      : r.status === 404
                        ? "notfound"
                        : "server"
        );
    }
    if (!isJson) throw new Err("noapi"); // e.g. a static server answered with index.html
    return r.json();
}

async function load(g, silent = false) {
    const my = ++S.req;
    document.body.classList.add("busy");
    $("#empty").hidden = true;
    if (!S.cur) $("#skeleton").hidden = false;
    try {
        const p = { lat: g.lat, lon: g.lon },
            m = { ...p, units: "metric" };
        const [cur, fc, air, airFc] = await Promise.all([
            api("/data/2.5/weather", m),
            api("/data/2.5/forecast", m),
            api("/data/2.5/air_pollution", p).catch(() => null),
            api("/data/2.5/air_pollution/forecast", p).catch(() => null)
        ]);
        if (my !== S.req) return; // a newer search already started
        if (!cur?.weather?.[0] || !fc?.list?.length) throw new Err("server");
        Object.assign(S, { geo: g, cur, fc, air, airFc, at: Date.now() });
        ls.set("wx_last", g);
        pushRecent(g);
        render();
    } catch (e) {
        if (my !== S.req) return;
        console.error(e);
        silent || fail(e);
    } finally {
        if (my === S.req) {
            document.body.classList.remove("busy");
            $("#skeleton").hidden = true;
        }
    }
}

/* ================= SKY GRADIENT ================= */
const skyOf = (id, n) => {
    const d = n ? "night" : "day";
    return id < 300
        ? "thunder"
        : id < 600
          ? "rain-" + d
          : id < 700
            ? "snow-" + d
            : id < 800
              ? "mist"
              : id < 803
                ? "clear-" + d
                : "clouds-" + d;
};
const TC = {
    "clear-day": "#0f6fe0",
    "clear-night": "#0b1026",
    "clouds-day": "#46688a",
    "clouds-night": "#1c2430",
    "rain-day": "#2f4757",
    "rain-night": "#0f1720",
    thunder: "#1a1a2e",
    "snow-day": "#4a76a4",
    "snow-night": "#2b3a55",
    mist: "#5f6f7a"
};
let skyNow;
function setSky(k) {
    document.body.dataset.sky = k; // drives the accent colour in CSS
    $("#tc").content = TC[k];
    if (k === skyNow) return;
    skyNow = k;
    const e = document.createElement("div");
    e.className = "sky sky-" + k;
    $("#skies").append(e);
    requestAnimationFrame(() =>
        requestAnimationFrame(() => e.classList.add("on"))
    );
    const old = [...$("#skies").children].filter(c => c !== e);
    setTimeout(() => old.forEach(o => o.remove()), 1500);
}

/* ================= SKY PARTICLES (canvas) ================= */
function fxOf(id, n, w) {
    const f = {
        rain: 0,
        snow: 0,
        stars: 0,
        sun: 0,
        clouds: 0,
        tone: "light",
        mist: 0,
        thunder: 0,
        slant: Math.min(6, w * 0.4)
    };
    if (id < 300)
        Object.assign(f, { rain: 1, thunder: 1, clouds: 6, tone: "dark" });
    else if (id < 400) Object.assign(f, { rain: 0.4, clouds: 5, tone: "gray" });
    else if (id < 600)
        Object.assign(f, {
            rain: id === 500 ? 0.5 : id === 501 ? 0.8 : 1,
            clouds: 6,
            tone: "dark"
        });
    else if (id < 700)
        Object.assign(f, {
            snow: id === 600 ? 0.5 : 1,
            clouds: 4,
            tone: "gray"
        });
    else if (id < 800) Object.assign(f, { mist: 1, clouds: 3, tone: "gray" });
    else {
        if (id < 803) n ? (f.stars = 1) : (f.sun = 1);
        f.clouds = [0, 2, 4, 6, 8][id - 800];
        f.tone = id > 802 ? "gray" : "light";
    }
    return f;
}
const fx = (() => {
    const c = $("#fx"),
        x = c.getContext("2d"),
        R = Math.random,
        rm = matchMedia("(prefers-reduced-motion:reduce)").matches,
        sp = {};
    let W,
        H,
        cfg,
        P = [],
        last = 0,
        fl = 0,
        bolt = null,
        nb = 0;
    const spr = t =>
        sp[t] ||
        (sp[t] = (() => {
            const k = document.createElement("canvas");
            k.width = 360;
            k.height = 160;
            const g = k.getContext("2d"),
                col = {
                    light: "255,255,255",
                    gray: "205,212,220",
                    dark: "80,90,108"
                }[t];
            [
                [110, 95, 70],
                [180, 75, 85],
                [250, 95, 65],
                [160, 105, 60]
            ].forEach(([a, b, r]) => {
                const q = g.createRadialGradient(a, b, 0, a, b, r);
                q.addColorStop(0, `rgba(${col},.9)`);
                q.addColorStop(1, `rgba(${col},0)`);
                g.fillStyle = q;
                g.beginPath();
                g.arc(a, b, r, 0, 7);
                g.fill();
            });
            return k;
        })());
    function size() {
        const d = Math.min(devicePixelRatio || 1, 2),
            nw = innerWidth,
            nh = innerHeight;
        // phones fire "resize" when the address bar hides/shows — don't rebuild particles for that
        const real = !W || nw !== W || Math.abs(nh - H) > 160;
        W = nw;
        H = nh;
        c.width = W * d;
        c.height = H * d;
        x.setTransform(d, 0, 0, d, 0, 0);
        if (cfg && real) build();
    }
    function build() {
        P = [];
        const a = W * H;
        for (let i = 0; i < Math.min(260, a / 2600) * cfg.rain; i++)
            P.push({
                k: "r",
                x: R() * (W + 100),
                y: R() * H,
                l: 10 + R() * 14,
                v: 12 + R() * 8,
                a: 0.15 + R() * 0.3
            });
        for (let i = 0; i < Math.min(150, a / 5000) * cfg.snow; i++)
            P.push({
                k: "s",
                x: R() * W,
                y: R() * H,
                r: 1 + R() * 2.5,
                v: 0.6 + R() * 1.2,
                p: R() * 6
            });
        for (let i = 0; i < Math.min(130, a / 4500) * cfg.stars; i++)
            P.push({
                k: "t",
                x: R() * W,
                y: R() * H * 0.7,
                r: 0.4 + R() * 1.4,
                p: R() * 6,
                s: 0.001 + R() * 0.002
            });
        for (let i = 0; i < cfg.clouds; i++)
            P.push({
                k: "c",
                x: R() * W,
                y: R() * H * 0.55 - 20,
                s: 0.8 + R() * 1.2,
                v: 0.1 + R() * 0.3,
                a: (cfg.tone === "dark" ? 0.5 : 0.35) + R() * 0.2
            });
        for (let i = 0; i < cfg.mist * 4; i++)
            P.push({
                k: "m",
                x: R() * W,
                y: H * 0.3 + R() * H * 0.6,
                v: 0.15 + R() * 0.2
            });
    }
    const mk = () => {
        let a = W * (0.2 + R() * 0.6),
            b = 0;
        const p = [[a, b]];
        while (b < H * 0.55) {
            a += R() * 50 - 25;
            b += 20 + R() * 25;
            p.push([a, b]);
        }
        return p;
    };
    function glow(px, py, rad, col) {
        const g = x.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, `rgba(${col},.6)`);
        g.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
    }
    function loop(t) {
        requestAnimationFrame(loop);
        if (!cfg || rm || document.hidden) return;
        const dt = Math.min(3, (t - (last || t)) / 16.7);
        last = t;
        x.clearRect(0, 0, W, H);
        if (cfg.sun)
            glow(
                W * 0.85,
                H * 0.08,
                Math.max(W, H) * 0.6 * (1 + 0.04 * Math.sin(t / 900)),
                "255,240,180"
            );
        if (cfg.stars)
            glow(W * 0.82, H * 0.1, Math.min(W, H) * 0.45, "200,215,255");
        for (const p of P) {
            if (p.k === "t") {
                x.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * p.s + p.p));
                x.fillStyle = "#fff";
                x.beginPath();
                x.arc(p.x, p.y, p.r, 0, 7);
                x.fill();
            } else if (p.k === "c") {
                p.x += p.v * dt;
                if (p.x > W) p.x = -360 * p.s;
                x.globalAlpha = p.a;
                x.drawImage(spr(cfg.tone), p.x, p.y, 360 * p.s, 160 * p.s);
            } else if (p.k === "m") {
                p.x += p.v * dt;
                if (p.x > W) p.x = -W * 1.6;
                x.globalAlpha = 0.22;
                x.drawImage(spr("light"), p.x, p.y, W * 1.6, 200);
            } else if (p.k === "r") {
                p.y += p.v * dt;
                p.x += cfg.slant * dt;
                if (p.y > H) {
                    p.y = -20;
                    p.x = R() * (W + 100) - cfg.slant * 20;
                }
                if (p.x > W + 50) p.x = -50;
                x.globalAlpha = p.a;
                x.strokeStyle = "#cfe6ff";
                x.lineWidth = 1.2;
                x.beginPath();
                x.moveTo(p.x, p.y);
                x.lineTo(p.x - cfg.slant * 1.6, p.y - p.l);
                x.stroke();
            } else {
                p.y += p.v * dt;
                p.x += Math.sin(t / 900 + p.p) * 0.6 + cfg.slant * 0.1 * dt;
                if (p.y > H) {
                    p.y = -5;
                    p.x = R() * W;
                }
                x.globalAlpha = 0.85;
                x.fillStyle = "#fff";
                x.beginPath();
                x.arc(p.x, p.y, p.r, 0, 7);
                x.fill();
            }
        }
        x.globalAlpha = 1;
        if (cfg.thunder) {
            // random lightning bolts + screen flash
            if (t > nb) {
                fl = 1;
                bolt = mk();
                nb = t + 2500 + R() * 6000;
            }
            if (fl > 0.02) {
                x.fillStyle = `rgba(220,230,255,${fl * 0.35})`;
                x.fillRect(0, 0, W, H);
                x.strokeStyle = `rgba(255,255,255,${fl})`;
                x.lineWidth = 2;
                x.shadowColor = "#9cf";
                x.shadowBlur = 18;
                x.beginPath();
                bolt.forEach(([a, b], i) =>
                    i ? x.lineTo(a, b) : x.moveTo(a, b)
                );
                x.stroke();
                x.shadowBlur = 0;
                fl *= Math.pow(0.9, dt);
            }
        }
    }
    size();
    addEventListener("resize", size);
    requestAnimationFrame(loop);
    return {
        set(f) {
            cfg = f;
            build();
        }
    };
})();

/* ================= UI SECTIONS ================= */
const MON = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];
const drop = () => Ico.ui("drop");

function count(sel, from, to) {
    const e = $(sel);
    if (!e) return;
    cancelAnimationFrame(e._raf);
    if (reduceMotion) return void (e.textContent = to);
    const t0 = performance.now(),
        a = from ?? 0;
    (function step(t) {
        const p = Math.min(1, (t - t0) / 900);
        e.textContent = Math.round(a + (to - a) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) e._raf = requestAnimationFrame(step);
    })(t0);
}

function hero() {
    const c = S.cur,
        w = c.weather[0],
        n = isNight(),
        v = Math.round(U().t(c.main.temp));
    $("#hero").innerHTML =
        `<h1>${esc(S.geo.name || c.name)}<small>${esc(c.sys.country || S.geo.country || "")}</small></h1>
  <p class="meta">${S.geo.state ? `<span>${esc(S.geo.state)}</span>` : ""}<span id="clock"></span></p>
  <div class="wx">${Ico.wx(Ico.kindOf(w.id, n))}</div>
  <div class="temp"><span id="tn">0</span><sup>${U().tu}</sup></div>
  <p class="cond">${esc(w.description)}</p>
  <div class="pills"><span>${Ico.ui("therm")}Feels ${T(c.main.feels_like)}</span><span>${Ico.ui("up")}${T(c.main.temp_max)}</span><span>${Ico.ui("down")}${T(c.main.temp_min)}</span></div>`;
    count("#tn", S.prevT, v);
    S.prevT = v;
}

function tips() {
    const c = S.cur,
        t = c.main.temp,
        f = c.main.feels_like,
        id = c.weather[0].id,
        pop = Math.max(0, ...S.fc.list.slice(0, 4).map(i => i.pop || 0)),
        q = S.air?.list?.[0]?.main.aqi,
        a = [];
    if (id < 300) a.push(["bolt", "Thunderstorm nearby — stay indoors."]);
    if (pop >= 0.4)
        a.push([
            "umbrella",
            `Carry an umbrella — ${Math.round(pop * 100)}% chance of rain in the next 12 hours.`
        ]);
    if (f >= 38)
        a.push([
            "therm",
            "Dangerously hot — drink water and avoid the midday sun."
        ]);
    else if (f >= 32)
        a.push(["therm", "Hot and humid — dress light and stay hydrated."]);
    if (t <= 10) a.push(["snow", "Cold — wear a jacket."]);
    if (c.wind.speed >= 10)
        a.push(["wind", "Strong wind — secure loose items outside."]);
    if ((c.visibility ?? 1e4) < 2000)
        a.push(["eye", "Low visibility — drive carefully."]);
    if (q >= 4)
        a.push(["alert", "Poor air quality — consider a mask outdoors."]);
    if (id === 800 && !isNight())
        a.push(["sun", "Clear and sunny — sunglasses and sunscreen."]);
    if (!a.length) a.push(["sparkle", "Pleasant weather — enjoy your day."]);
    $("#tips").innerHTML = a
        .map(([i, x]) => `<p>${Ico.ui(i)}<span>${x}</span></p>`)
        .join("");
}

function hourly() {
    const c = S.cur,
        L = S.fc.list.slice(0, 12);
    const H = [
        {
            dt: c.dt,
            t: c.main.temp,
            id: c.weather[0].id,
            n: isNight(),
            pop: L[0]?.pop || 0,
            now: 1
        },
        ...L.map(i => ({
            dt: i.dt,
            t: i.main.temp,
            id: i.weather[0].id,
            n: i.sys?.pod === "n",
            pop: i.pop || 0
        }))
    ];
    $("#hourly").innerHTML =
        `<h3>${Ico.ui("clock")}Next 36 hours</h3><div class="strip">` +
        H.map(
            h =>
                `<div class="hr${h.now ? " now" : ""}"><b>${h.now ? "Now" : hr(h.dt, 0)}</b>${Ico.wx(Ico.kindOf(h.id, h.n), "mini")}<strong>${T(h.t)}</strong><em>${h.pop > 0.1 ? drop() + Math.round(h.pop * 100) + "%" : ""}</em></div>`
        ).join("") +
        "</div>";
}

function daily() {
    const groups = new Map();
    S.fc.list.forEach(i => {
        const k = dayKey(i.dt);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(i);
    });
    const today = dayKey(S.cur.dt);
    return [...groups.entries()].slice(0, 5).map(([k, it]) => {
        const temps = it.map(i => i.main.temp);
        if (k === today) temps.push(S.cur.main.temp);
        const noon = i => Math.abs(loc(i.dt).getUTCHours() - 12);
        // rainy/stormy slot wins; otherwise use the slot closest to noon
        const pick =
            it
                .filter(i => (i.pop || 0) >= 0.35)
                .sort(
                    (a, b) => sev(b.weather[0].id) - sev(a.weather[0].id)
                )[0] || it.reduce((a, b) => (noon(b) < noon(a) ? b : a));
        return {
            n: k === today ? "Today" : D[loc(it[0].dt).getUTCDay()],
            hi: Math.max(...temps),
            lo: Math.min(...temps),
            id: pick.weather[0].id,
            pop: Math.max(...it.map(i => i.pop || 0))
        };
    });
}
function dailyUI() {
    const d = daily(),
        mn = Math.min(...d.map(x => x.lo)),
        r = Math.max(...d.map(x => x.hi)) - mn || 1;
    $("#daily").innerHTML =
        `<h3>${Ico.ui("cal")}5-day forecast</h3>` +
        d
            .map(
                x =>
                    `<div class="day"><b>${x.n}</b>${Ico.wx(Ico.kindOf(x.id, false), "mini")}<em>${x.pop > 0.1 ? Math.round(x.pop * 100) + "%" : ""}</em><i>${T(x.lo)}</i><div class="rg"><u style="left:${((x.lo - mn) / r) * 100}%;width:${Math.max(6, ((x.hi - x.lo) / r) * 100)}%"></u></div><strong>${T(x.hi)}</strong></div>`
            )
            .join("");
}

function sunTile() {
    const { sunrise: sr, sunset: ss } = S.cur.sys,
        now = S.cur.dt;
    if (!sr || !ss || ss <= sr) return ""; // polar day/night — no arc
    const p = clamp((now - sr) / (ss - sr), 0, 1),
        up = now >= sr && now <= ss,
        len = Math.PI * 90,
        th = Math.PI * p,
        x = 100 - 90 * Math.cos(th),
        y = 90 - 90 * Math.sin(th),
        dl = ss - sr;
    return `<div class="st wide sun"><p>${Ico.ui("sun")}Sun</p>
  <svg viewBox="0 0 200 100" role="img" aria-label="Sun position today">
    <path class="track" d="M10 90A90 90 0 0 1 190 90"/>
    <path class="done" style="--len:${(p * len).toFixed(1)}" d="M10 90A90 90 0 0 1 190 90"/>
    <line class="horizon" x1="0" y1="90" x2="200" y2="90"/>
    <circle class="dot${up ? "" : " off"}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>
  </svg>
  <div class="sun-row">
    <div><span>${Ico.ui("sunrise")} Sunrise</span><strong>${hr(sr)}</strong></div>
    <div class="mid"><strong>${Math.floor(dl / 3600)}h ${Math.floor((dl % 3600) / 60)}m</strong><span>daylight</span></div>
    <div><span>${Ico.ui("sunset")} Sunset</span><strong>${hr(ss)}</strong></div>
  </div></div>`;
}

function stats() {
    const c = S.cur,
        m = c.main,
        u = U(),
        vis = c.visibility ?? 1e4,
        pd = (S.fc.list[2]?.main.pressure ?? m.pressure) - m.pressure,
        dr = c.wind.deg ?? 0;
    const tile = (icon, label, val, sub = "", ring) =>
        `<div class="st"><p>${Ico.ui(icon)}${label}</p><strong>${val}</strong><small>${sub}</small>${ring != null ? `<div class="ring" style="--p:${clamp(ring, 0, 100)}"></div>` : ""}</div>`;
    $("#stats").innerHTML =
        `<h3>${Ico.ui("therm")}Details</h3><div class="sg">` +
        tile(
            "therm",
            "Feels like",
            T(m.feels_like),
            "Dew point " + T(dew(m.temp, m.humidity))
        ) +
        tile("drop", "Humidity", m.humidity + "%", "", m.humidity) +
        tile(
            "wind",
            "Wind",
            `${u.w(c.wind.speed).toFixed(1)} <span style="font-size:14px;font-weight:400">${u.wu}</span>`,
            `<span class="cp" style="--r:${(dr + 180) % 360}deg">${Ico.ui("nav")}</span>${compass(dr)}${c.wind.gust ? " · gust " + u.w(c.wind.gust).toFixed(0) : ""}`
        ) +
        tile(
            "gauge",
            "Pressure",
            `${m.pressure} <span style="font-size:14px;font-weight:400">hPa</span>`,
            pd > 2 ? "Rising" : pd < -2 ? "Falling" : "Steady"
        ) +
        tile(
            "eye",
            "Visibility",
            `${u.v(vis).toFixed(1)} <span style="font-size:14px;font-weight:400">${u.vu}</span>`,
            "",
            Math.min(100, vis / 100)
        ) +
        tile("cloud", "Clouds", c.clouds.all + "%", "", c.clouds.all) +
        sunTile() +
        "</div>";
}

const AQ = [
    0,
    { n: "Good", c: "#4ade80", t: "Air is clean — enjoy the outdoors." },
    { n: "Fair", c: "#a3e635", t: "Acceptable for most people." },
    {
        n: "Moderate",
        c: "#facc15",
        t: "Sensitive people should limit long outdoor activity."
    },
    { n: "Poor", c: "#fb923c", t: "Reduce prolonged outdoor exertion." },
    {
        n: "Very poor",
        c: "#ef4444",
        t: "Avoid outdoor activity and wear a mask."
    }
];
// [key, label, thresholds for Good/Fair/Moderate/Poor]
const PL = [
    ["pm2_5", "PM2.5", [10, 25, 50, 75]],
    ["pm10", "PM10", [20, 50, 100, 200]],
    ["o3", "O₃", [60, 100, 140, 180]],
    ["no2", "NO₂", [40, 70, 150, 200]],
    ["so2", "SO₂", [20, 80, 250, 350]],
    ["co", "CO", [4400, 9400, 12400, 15400]]
];
function aqiUI() {
    const a = S.air?.list?.[0],
        el = $("#aqi");
    el.hidden = !a;
    if (!a) return;
    const q = clamp(a.main.aqi, 1, 5),
        i = AQ[q];
    el.innerHTML =
        `<h3>${Ico.ui("wind")}Air quality<small>µg/m³</small></h3>
  <div class="aq"><div class="num" style="color:${i.c}">${q}</div><div><b style="color:${i.c}">${i.n}</b><p>${i.t}</p></div></div>
  <div class="scale" role="img" aria-label="Air quality scale, level ${q} of 5">${AQ.slice(
      1
  )
      .map(
          (z, k) =>
              `<u style="background:${z.c};opacity:${k + 1 === q ? 1 : 0.3}"></u>`
      )
      .join("")}</div>` +
        PL.map(([k, n, t]) => {
            const v = a.components?.[k] ?? 0,
                l = t.filter(z => v >= z).length;
            return `<div class="pl"><span>${n}</span><div class="bar"><u style="width:${Math.min(100, (v / (t[3] * 1.25)) * 100)}%;background:${AQ[l + 1].c}"></u></div><em>${v.toFixed(1)}</em></div>`;
        }).join("");
}

/* ================= GRAPHS (Chart.js) ================= */
const TABS = [
    ["temp", "Temperature"],
    ["rain", "Rain"],
    ["wind", "Wind"],
    ["hum", "Humidity"],
    ["pres", "Pressure"],
    ["daily", "Daily range"],
    ["aqi", "Air quality"]
];
function charts() {
    const tabs = TABS.filter(t => t[0] !== "aqi" || S.airFc?.list?.length);
    if (!tabs.some(t => t[0] === S.tab)) S.tab = "temp";
    $("#charts").innerHTML = `<h3>${Ico.ui("gauge")}Graphs</h3>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === S.tab}" data-t="${k}" class="${k === S.tab ? "on" : ""}">${l}</button>`).join("")}</div>
  <div class="cs"><div class="cb"><canvas id="cv" role="img" aria-label="Weather graph"></canvas></div></div>`;
    const bar = $("#charts .tabs");
    bar.onclick = e => {
        const b = e.target.closest("button");
        if (!b) return;
        S.tab = b.dataset.t;
        [...bar.children].forEach(x => {
            x.classList.toggle("on", x === b);
            x.setAttribute("aria-selected", x === b);
        });
        draw(); // only the canvas is redrawn, so the tab bar keeps its scroll position
    };
    draw();
}
function draw() {
    S.chart?.destroy();
    S.chart = null;
    const wrap = $("#charts .cs");
    if (!wrap) return;
    if (!window.Chart) {
        wrap.innerHTML =
            '<p class="chart-note">Graphs couldn’t load. Check your connection and refresh the page.</p>';
        return;
    }
    if (!$("#cv"))
        wrap.innerHTML = '<div class="cb"><canvas id="cv"></canvas></div>';
    $("#charts .cb").classList.toggle(
        "wide",
        !["daily", "aqi"].includes(S.tab)
    );

    const u = U(),
        L = S.fc.list,
        COL = "rgba(255,255,255,.85)",
        f1 = v => +v.toFixed(1),
        tl = i => D[loc(i.dt).getUTCDay()] + " " + hr(i.dt, 0);
    const AC = hexRgb(
        getComputedStyle(document.body).getPropertyValue("--ac") || "#ffc94d"
    );
    Chart.defaults.font.family = '"Bricolage Grotesque",system-ui,sans-serif';
    Chart.defaults.color = COL;

    const grad = rgb => c => {
        const a = c.chart.chartArea;
        if (!a) return "transparent";
        const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, `rgba(${rgb},.5)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        return g;
    };
    const ln = (label, data, rgb, o = {}) => ({
        type: "line",
        label,
        data,
        borderColor: `rgb(${rgb})`,
        backgroundColor: o.f ? grad(rgb) : "transparent",
        fill: !!o.f,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        borderDash: o.d || [],
        yAxisID: o.y || "y"
    });
    const A = (S.airFc?.list || []).filter((_, i) => i % 3 === 0).slice(0, 32),
        dd = daily();
    const M = {
        temp: {
            d: [
                ln(
                    "Temp " + u.tu,
                    L.map(i => f1(u.t(i.main.temp))),
                    AC,
                    { f: 1 }
                ),
                ln(
                    "Feels like",
                    L.map(i => f1(u.t(i.main.feels_like))),
                    "255,123,107",
                    { d: [6, 5] }
                )
            ]
        },
        rain: {
            max: 100,
            d: [
                {
                    type: "bar",
                    label: "Rain chance %",
                    data: L.map(i => Math.round((i.pop || 0) * 100)),
                    backgroundColor: "rgba(79,172,254,.65)",
                    borderRadius: 6
                },
                ln(
                    "Volume mm",
                    L.map(i => (i.rain?.["3h"] || 0) + (i.snow?.["3h"] || 0)),
                    "139,233,253",
                    { y: "y1" }
                )
            ]
        },
        wind: {
            d: [
                ln(
                    "Wind " + u.wu,
                    L.map(i => f1(u.w(i.wind.speed))),
                    "134,239,172",
                    { f: 1 }
                ),
                ln(
                    "Gust",
                    L.map(i => f1(u.w(i.wind.gust ?? i.wind.speed))),
                    "253,224,71",
                    { d: [6, 5] }
                )
            ]
        },
        hum: {
            max: 100,
            d: [
                ln(
                    "Humidity %",
                    L.map(i => i.main.humidity),
                    "96,165,250",
                    { f: 1 }
                ),
                ln(
                    "Clouds %",
                    L.map(i => i.clouds.all),
                    "226,232,240",
                    { d: [6, 5] }
                )
            ]
        },
        pres: {
            d: [
                ln(
                    "Pressure hPa",
                    L.map(i => i.main.pressure),
                    "192,132,252",
                    { f: 1 }
                )
            ]
        },
        daily: {
            lb: dd.map(x => x.n),
            d: [
                {
                    type: "bar",
                    label: "Low–High " + u.tu,
                    data: dd.map(x => [f1(u.t(x.lo)), f1(u.t(x.hi))]),
                    backgroundColor: `rgba(${AC},.85)`,
                    borderRadius: 12,
                    borderSkipped: false
                }
            ]
        },
        aqi: {
            max: 5,
            lb: A.map(tl),
            d: [
                {
                    type: "bar",
                    label: "AQI (1–5)",
                    data: A.map(i => i.main.aqi),
                    backgroundColor: A.map(i => AQ[clamp(i.main.aqi, 1, 5)].c),
                    borderRadius: 4
                },
                ln(
                    "PM2.5 µg/m³",
                    A.map(i => i.components.pm2_5),
                    "255,255,255",
                    { y: "y1" }
                )
            ]
        }
    };
    const t = M[S.tab] || M.temp,
        isBar = ["rain", "daily", "aqi"].includes(S.tab);
    S.chart = new Chart($("#cv"), {
        type: "line",
        data: { labels: t.lb || L.map(tl), datasets: t.d },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: reduceMotion ? false : undefined,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    labels: { color: COL, usePointStyle: true, boxWidth: 8 }
                },
                tooltip: {
                    backgroundColor: "rgba(10,15,30,.92)",
                    padding: 10,
                    cornerRadius: 10
                }
            },
            scales: {
                x: {
                    offset: isBar,
                    ticks: { color: COL, maxRotation: 0, maxTicksLimit: 9 },
                    grid: { display: false }
                },
                y: {
                    min: t.max ? 0 : undefined,
                    max: t.max,
                    beginAtZero: ["wind", "hum"].includes(S.tab),
                    ticks: { color: COL },
                    grid: { color: "rgba(255,255,255,.12)" }
                },
                y1: {
                    display: ["rain", "aqi"].includes(S.tab),
                    position: "right",
                    beginAtZero: true,
                    ticks: { color: COL },
                    grid: { display: false }
                }
            }
        }
    });
}

/* ================= RENDER + CLOCK ================= */
function render() {
    const n = isNight(),
        id = S.cur.weather[0].id;
    $("#main").hidden = false;
    $("#empty").hidden = true;
    setSky(skyOf(id, n)); // first: charts read the accent colour that the sky sets
    fx.set(fxOf(id, n, S.cur.wind.speed));
    hero();
    tips();
    hourly();
    dailyUI();
    stats();
    aqiUI();
    charts();
    tick();
}
function tick() {
    if (!S.cur) return;
    const e = $("#clock");
    if (e) {
        const u = Date.now() / 1e3,
            d = loc(u);
        e.textContent = `${D[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${hr(u)}`;
    }
    const m = Math.floor((Date.now() - S.at) / 6e4);
    $("#updated").textContent =
        m < 1 ? "Updated just now" : `Updated ${m} min ago`;
}
setInterval(tick, 1000);
const stale = () =>
    S.geo && !document.hidden && Date.now() - S.at > REFRESH_MIN * 6e4;
setInterval(() => stale() && load(S.geo, true), 6e4);
document.addEventListener(
    "visibilitychange",
    () => stale() && load(S.geo, true)
);
addEventListener("offline", () =>
    toast("You’re offline. Showing the last data we have.")
);
addEventListener("online", () => {
    toast("Back online.");
    S.geo ? load(S.geo, true) : start();
});

/* ================= RECENT SEARCHES ================= */
const rec = () => ls.get("wx_recent", []);
function pushRecent(g) {
    const k = x => Number(x.lat).toFixed(2) + "," + Number(x.lon).toFixed(2);
    const mini = {
        name: g.name,
        state: g.state,
        country: g.country,
        lat: g.lat,
        lon: g.lon
    };
    ls.set(
        "wx_recent",
        [mini, ...rec().filter(x => k(x) !== k(g))].slice(0, 6)
    );
    drawRecent();
}
function drawRecent() {
    $("#recent").innerHTML = rec()
        .map(
            (g, i) =>
                `<span class="chip"><button type="button" class="go" data-i="${i}">${esc(g.name)}</button><button type="button" class="rm" data-x="${i}" aria-label="Remove ${esc(g.name)}">${Ico.ui("x")}</button></span>`
        )
        .join("");
}
$("#recent").onclick = e => {
    const rm = e.target.closest("[data-x]");
    if (rm) {
        const r = rec();
        r.splice(+rm.dataset.x, 1);
        ls.set("wx_recent", r);
        return drawRecent();
    }
    const go = e.target.closest("[data-i]");
    const g = go && rec()[+go.dataset.i];
    if (g) load(g);
};

/* ================= SEARCH + SUGGESTIONS ================= */
const input = $("#search-bar"),
    box = $("#sugg"),
    sg = { list: [], i: -1, tok: 0, tm: 0 };
const place = g => [g.state, g.country].filter(Boolean).join(", ");
function hideSugg() {
    box.hidden = true;
    sg.i = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
}
function showSugg(list) {
    sg.list = list;
    sg.i = -1;
    if (!list.length) return hideSugg();
    box.innerHTML = list
        .map(
            (g, i) =>
                `<li role="option" id="sg${i}" data-i="${i}"><span>${esc(g.name)}</span><small>${esc(place(g))}</small></li>`
        )
        .join("");
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
}
function mark(i) {
    sg.i = i;
    [...box.children].forEach((li, k) =>
        li.setAttribute("aria-selected", k === i)
    );
    i >= 0
        ? input.setAttribute("aria-activedescendant", "sg" + i)
        : input.removeAttribute("aria-activedescendant");
}
function pick(g) {
    input.value = g.name;
    hideSugg();
    input.blur();
    load(g);
}
input.addEventListener("input", () => {
    clearTimeout(sg.tm);
    const q = input.value.trim();
    if (q.length < 2) return hideSugg();
    sg.tm = setTimeout(async () => {
        const tok = ++sg.tok;
        try {
            const raw = await api("/geo/1.0/direct", { q, limit: 5 });
            const seen = new Set(),
                list = raw.filter(g => {
                    const k = g.name + "|" + (g.state || "") + "|" + g.country;
                    return seen.has(k) ? false : seen.add(k);
                });
            if (tok === sg.tok && document.activeElement === input)
                showSugg(list);
        } catch {}
    }, 280);
});
input.addEventListener("keydown", e => {
    if (box.hidden) return;
    const n = sg.list.length;
    if (e.key === "ArrowDown") (e.preventDefault(), mark((sg.i + 1) % n));
    else if (e.key === "ArrowUp")
        (e.preventDefault(), mark((sg.i - 1 + n) % n));
    else if (e.key === "Escape") hideSugg();
    else if (e.key === "Enter" && sg.i >= 0)
        (e.preventDefault(), pick(sg.list[sg.i]));
});
// pointerdown (not click) + preventDefault keeps the input focused, so blur doesn't close the list first
box.addEventListener("pointerdown", e => {
    e.preventDefault();
    const li = e.target.closest("li");
    if (li) pick(sg.list[+li.dataset.i]);
});
input.addEventListener("blur", () => setTimeout(hideSugg, 120));
addEventListener("keydown", e => {
    if (
        e.key === "/" &&
        !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)
    ) {
        e.preventDefault();
        input.focus();
    }
});

$("#search-box").onsubmit = async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    clearTimeout(sg.tm);
    sg.tok++;
    hideSugg();
    input.blur();
    try {
        const [g] = await api("/geo/1.0/direct", { q, limit: 1 });
        if (!g) throw new Err("notfound");
        load(g);
    } catch (x) {
        fail(x);
    }
};

/* ================= BUTTONS ================= */
const syncUnit = () => ($("#unit").textContent = U().tu);
$("#unit").onclick = () => {
    S.unit = S.unit === "metric" ? "imperial" : "metric";
    ls.set("wx_unit", S.unit);
    S.prevT = null;
    syncUnit();
    if (S.cur) render();
};
$("#refresh").onclick = () => (S.geo ? load(S.geo) : start());
$("#retry").onclick = () => (S.geo ? load(S.geo) : start());
$("#locate").onclick = () => {
    if (!navigator.geolocation)
        return toast("Your browser doesn’t support location.");
    toast("Finding your location…", 8000);
    navigator.geolocation.getCurrentPosition(
        async p => {
            const { latitude: lat, longitude: lon } = p.coords;
            let g = { name: "My location", country: "", lat, lon };
            try {
                const [r] = await api("/geo/1.0/reverse", {
                    lat,
                    lon,
                    limit: 1
                });
                if (r) g = r;
            } catch {}
            $("#toast").classList.remove("show");
            load(g);
        },
        err =>
            toast(
                err.code === 1
                    ? "Location access is blocked. Allow it in your browser settings, or search for a city."
                    : "Couldn’t get your location. Try again or search for a city."
            ),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
};

/* ================= START ================= */
async function start() {
    $("#empty").hidden = true;
    $("#skeleton").hidden = false;
    try {
        let g = ls.get("wx_last", null);
        if (g?.lat == null || g?.lon == null) {
            [g] = await api("/geo/1.0/direct", { q: DEFAULT_CITY, limit: 1 });
        }
        if (!g) throw new Err("notfound");
        await load(g);
    } catch (e) {
        showEmpty(e);
    }
}
document
    .querySelectorAll("[data-ico]")
    .forEach(el => (el.innerHTML = Ico.ui(el.dataset.ico)));
syncUnit();
drawRecent();
setSky("clear-day");
start();
