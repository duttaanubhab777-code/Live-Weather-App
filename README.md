# 🌦️ Live Weather App

A fast, mobile-first weather dashboard built with **vanilla HTML, CSS & JavaScript** and the [OpenWeatherMap](https://openweathermap.org/api) API. The whole UI reacts to the weather — emoji, sky gradient and background particles all change with the condition and with day/night.

## ✨ Features

**Look & feel**
- 🎭 Animated weather emoji that changes with the condition **and** day/night (☀️ ↔ 🌙, ⛅, 🌧️, ⛈️, ❄️, 🌫️ …) with sun glow, falling rain/snow, twinkling stars and flashing lightning
- 🌈 Animated gradient sky with smooth crossfade between 10 themes (clear / clouds / rain × day / night, thunder, snow, mist)
- 🌧️ Full-screen particle effects on canvas: rain (wind-slanted), snow, stars, drifting clouds, fog, random lightning bolts
- 🪟 Glassmorphism cards, count-up temperature, skeleton loading, `prefers-reduced-motion` support

**Data**
- Current weather, feels-like, dew point, humidity, pressure trend, visibility, cloud cover
- Wind speed, gust and live direction compass
- Sunrise / sunset and daylight length — in the **searched city's local time**, with a live city clock
- Hourly strip (next ~36 h) and 5-day forecast with temperature range bars
- 🌫️ Air Quality Index + pollutant breakdown (PM2.5, PM10, O₃, NO₂, SO₂, CO)
- 💡 Smart tips (umbrella, heat, cold, wind, low visibility, air quality)

**📊 Graphs (Chart.js)** — Temperature & feels-like · Rain chance & volume · Wind & gust · Humidity & clouds · Pressure · Daily low/high · AQI forecast + PM2.5

**Utilities**
- 📍 My-location button (geolocation), city suggestions while typing
- °C / °F toggle (also km/h ↔ mph, km ↔ mi), remembered between visits
- Recent searches + last city restored on launch
- Auto-refresh every 10 minutes
- Proper error handling (city not found, bad key, rate limit, offline)

## 🛠 Fixes from the previous version
- Wind was shown in m/s but labelled km/h — now converted correctly
- Sunrise/sunset used the visitor's timezone — now uses the city's timezone
- HTTP errors (404, 401) never reached `.catch()` — now handled
- Renamed `weather css.css` → `style.css` (no spaces in file names)

## 🚀 Run
Open `index.html` in a browser (or use any static server / GitHub Pages). No build step.

## 🔑 API key
The key is set at the top of `weather.js` (`API_KEY`). Since this is a front-end only app the key is visible to everyone, so create your own free key at openweathermap.org and replace it.

APIs used (all free tier): `weather`, `forecast`, `air_pollution`, `air_pollution/forecast`, `geo/1.0/direct`, `geo/1.0/reverse`.

## 📁 Structure
```
index.html   markup
style.css    layout, glass UI, skies, emoji animations
weather.js   API, emoji, sky + particle engine, charts, UI logic
```

Created by Anubhab Dutta.
