# Live Weather

A fast, mobile-first weather dashboard in **vanilla HTML, CSS and JavaScript**. The whole screen follows the sky outside: background, accent colour, particles and the animated weather illustration all change with the condition and with day or night.

Forecast, air quality, wind, pressure and seven interactive graphs for any city. Your API key stays on the server and never reaches the browser.

```
Browser  ──►  /api/owm  (Vercel function, holds the secret)  ──►  OpenWeatherMap
```

## Features

**Look and feel**
- Custom animated SVG weather icons (no system emoji): sun with rotating rays, moon with twinkling stars, drifting clouds, falling rain and snow, flashing lightning, sliding mist, wind
- Sky gradient with smooth crossfade between 10 themes (clear, clouds, rain × day, night, plus thunder, snow, mist)
- The accent colour (buttons, active tab, rings, the “Now” card) follows the current sky
- Canvas particles: wind-slanted rain, snow, stars, drifting clouds, fog, lightning bolts
- Dark glass panels tuned for readable text on every sky, count-up temperature, skeleton loading, `prefers-reduced-motion` support

**Data**
- Current weather, feels-like, dew point, humidity, pressure trend, visibility, cloud cover
- Wind speed, gust and a live direction arrow
- Sun arc with sunrise, sunset and daylight length, all in the **searched city’s local time**, with a live city clock
- Hourly strip (next 36 hours) and 5-day forecast with temperature range bars
- Air Quality Index with a pollutant breakdown (PM2.5, PM10, O₃, NO₂, SO₂, CO)
- Smart tips: umbrella, heat, cold, wind, low visibility, air quality

**Graphs (Chart.js)**: temperature and feels-like, rain chance and volume, wind and gust, humidity and clouds, pressure, daily low/high, AQI forecast with PM2.5

**Utilities**
- City suggestions while typing (keyboard friendly, picks the exact place when names repeat)
- My-location button, recent searches, last city restored on launch
- °C / °F toggle (also km/h ↔ mph and km ↔ mi), remembered between visits
- Auto refresh every 10 minutes and “Updated x min ago”
- Clear messages for: city not found, key missing, key rejected, rate limit, offline, API route missing
- Installable: “Add to Home Screen” works on Android and iOS
- Press `/` on a keyboard to jump to the search box

## Deploy on Vercel (with the API key in an env variable)

1. Get a free key at [openweathermap.org/api](https://openweathermap.org/api). New keys can take up to 2 hours to activate.
2. Push this folder to GitHub and import it in Vercel. Framework preset: **Other**. No build command is needed.
3. Vercel → your project → **Settings → Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `OPENWEATHER_API_KEY` | your key |

   Tick **Production**, **Preview** and **Development**, then save.
4. **Redeploy.** Env variables only apply to *new* deployments: Deployments → latest → ⋯ → Redeploy.

> Do **not** add prefixes like `NEXT_PUBLIC_` or `VITE_`. Those are deliberately exposed to the browser.

### Run locally

```bash
cp .env.example .env.local      # put your key inside .env.local
npm i -g vercel
vercel dev                      # http://localhost:3000
```

Opening `index.html` directly (or with a plain static server) will not work, because `/api/owm` only exists on Vercel or under `vercel dev`. The app says so on screen instead of failing silently.

### If your old key was public

Earlier versions had the key written in `weather.js`, and it stays in Git history. Treat it as leaked: create a **new** key on OpenWeatherMap, delete the old one, and use the new one only as the env variable.

## How the proxy works

`api/owm.js` is a small serverless function:
- reads the key from `process.env.OPENWEATHER_API_KEY`
- only forwards six endpoints: `weather`, `forecast`, `air_pollution`, `air_pollution/forecast`, `geo/direct`, `geo/reverse`
- only forwards the parameters `q, lat, lon, limit, units, lang` and ignores any `appid` sent by a visitor
- times out after 9 seconds and never returns the key
- sets edge-cache headers (5 to 30 minutes for weather, 24 hours for geocoding), so repeated visits don’t burn your free quota

## What changed in v2

- **Security:** the API key is no longer in the code; requests go through `/api/owm`
- **Fixed:** an older, slower search could overwrite a newer one
- **Fixed:** a failed first load left a blank screen; there is now an error card with a Retry button
- **Fixed:** day/night detection used only sunrise and sunset, which breaks in polar regions; it now uses OpenWeather’s own day/night flag
- **Fixed:** the “Today” label in the 5-day list depended on the data order, and now compares real local dates
- **Fixed:** switching graph tabs rebuilt the tab bar and reset its scroll position; now only the chart redraws
- **Fixed:** particles rebuilt every time a phone’s address bar showed or hid
- **Fixed:** white text on the bright clear-day sky had very low contrast
- **Fixed:** location errors (blocked, timeout) now explain what to do
- **Removed:** the unused `weather css.css` (old README said it was renamed, but the file was still there) and the SweetAlert2 dependency
- **New:** custom SVG icons, sky-linked accent colour, sun arc, progress rings, custom search suggestions, offline handling, PWA manifest and icons

## Structure

```
index.html            markup
style.css             layout, glass panels, sky themes, icon animations
weather.js            data, UI sections, charts, search, particles
icons.js              animated SVG weather icons and UI icons
api/owm.js            Vercel serverless proxy (holds the key)
vercel.json           security headers and caching
manifest.webmanifest  “Add to Home Screen” (+ PNG icons, favicon.svg)
.env.example          template for local development
```

Weather data by [OpenWeather](https://openweathermap.org/). Made by Anubhab Dutta.

---

## বাংলায় দ্রুত সেটআপ

**কেন proxy?** ব্রাউজারের কোডে API key রাখলে যে কেউ DevTools খুলে সেটা দেখে নিতে পারে। তাই ব্রাউজার এখন সরাসরি OpenWeatherMap-কে না ডেকে `/api/owm` ডাকে, আর key থাকে শুধু Vercel সার্ভারে।

1. Vercel → Project → **Settings → Environment Variables**
2. Name: `OPENWEATHER_API_KEY`, Value: নতুন key। Production, Preview, Development তিনটাই টিক দাও, Save করো।
3. **Redeploy** করো (Deployments → সবশেষ deployment → ⋯ → Redeploy)। না করলে আগের ডেপ্লয়ে key পৌঁছাবে না।
4. পুরনো key GitHub history-তে থেকে গেছে, তাই OpenWeatherMap থেকে **নতুন key** বানিয়ে পুরনোটা মুছে দাও।
