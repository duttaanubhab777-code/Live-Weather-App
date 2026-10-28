/**
 * Vercel Serverless Function — OpenWeatherMap proxy
 *
 * কেন এটা দরকার?
 * ব্রাউজারের JavaScript-এ API key রাখলে যে কেউ DevTools খুলে চুরি করতে পারে।
 * তাই ব্রাউজার এখন সরাসরি OpenWeatherMap-কে না ডেকে এই ফাংশনকে ডাকে (/api/owm),
 * আর ফাংশনটা সার্ভারে থাকা সিক্রেট `OPENWEATHER_API_KEY` ব্যবহার করে আসল রিকোয়েস্ট পাঠায়।
 *
 * Env var: OPENWEATHER_API_KEY   (Vercel → Project → Settings → Environment Variables)
 */

const UPSTREAM = "https://api.openweathermap.org";

// শুধু এই endpoint-গুলোই পাস হবে — বাকি সব ব্লক (কেউ তোমার key দিয়ে অন্য API চালাতে পারবে না)
const ALLOWED = new Set([
    "/data/2.5/weather",
    "/data/2.5/forecast",
    "/data/2.5/air_pollution",
    "/data/2.5/air_pollution/forecast",
    "/geo/1.0/direct",
    "/geo/1.0/reverse"
]);

// শুধু এই query param-গুলো পাস হবে (appid কখনোই ক্লায়েন্ট থেকে নেওয়া হয় না)
const PARAMS = new Set(["q", "lat", "lon", "limit", "units", "lang"]);

// Edge cache (সেকেন্ডে): একই শহরের জন্য বারবার API কল না করে quota বাঁচায়
const CACHE = {
    "/geo/1.0/direct": 86400,
    "/geo/1.0/reverse": 86400,
    "/data/2.5/weather": 300,
    "/data/2.5/forecast": 600,
    "/data/2.5/air_pollution": 600,
    "/data/2.5/air_pollution/forecast": 1800
};

const send = (res, status, body, cache = "no-store") => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", cache);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify(body));
};

module.exports = async function handler(req, res) {
    if (req.method !== "GET")
        return send(res, 405, { error: "method_not_allowed" });

    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) return send(res, 500, { error: "missing_key" });

    const url = new URL(req.url, "http://localhost");
    const path = url.searchParams.get("path") || "";
    if (!ALLOWED.has(path)) return send(res, 400, { error: "bad_path" });

    const qs = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
        if (k === "path" || !PARAMS.has(k)) continue;
        if (v.length > 100) return send(res, 400, { error: "bad_param" });
        qs.set(k, v);
    }
    qs.set("appid", key);

    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const r = await fetch(`${UPSTREAM}${path}?${qs}`, {
            signal: ctrl.signal
        });
        clearTimeout(timer);

        let data;
        try {
            data = await r.json();
        } catch {
            data = { error: "bad_upstream" };
        }
        if (!r.ok)
            return send(res, r.status === 401 ? 502 : r.status, {
                error: r.status === 401 ? "upstream_key_rejected" : "upstream",
                status: r.status
            });

        const age = CACHE[path] || 300;
        return send(
            res,
            200,
            data,
            `public, s-maxage=${age}, stale-while-revalidate=${age * 2}`
        );
    } catch (e) {
        return send(res, 504, { error: e.name === "AbortError" ? "timeout" : "network" });
    }
};
