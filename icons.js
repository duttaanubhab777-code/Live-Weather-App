"use strict";
/* =====================================================================
   icons.js — custom SVG icon set (no system emoji)
   - Ico.wx(kind)       → animated weather illustration (viewBox 120×120)
   - Ico.kindOf(id, n)  → OpenWeather condition id (+ night flag) → kind
   - Ico.ui(name)       → small line icon (viewBox 24×24, uses currentColor)
   Animations live in style.css (.a-* classes); small icons get `.mini`
   which freezes them, hover plays them again.
   ===================================================================== */
const Ico = (() => {
    /* ---------- shared gradients / masks (injected once) ---------- */
    const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="gSun" cx="45%" cy="40%" r="65%">
      <stop offset="0" stop-color="#fff6bf"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9a1f"/>
    </radialGradient>
    <radialGradient id="gGlow">
      <stop offset="0" stop-color="#ffd86b" stop-opacity=".55"/><stop offset="1" stop-color="#ffd86b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gMoonGlow">
      <stop offset="0" stop-color="#bcd0ff" stop-opacity=".45"/><stop offset="1" stop-color="#bcd0ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gMoon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c3cffd"/>
    </linearGradient>
    <linearGradient id="gCloud" gradientUnits="userSpaceOnUse" x1="60" y1="34" x2="60" y2="90">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3deee"/>
    </linearGradient>
    <linearGradient id="gCloudGrey" gradientUnits="userSpaceOnUse" x1="60" y1="34" x2="60" y2="90">
      <stop offset="0" stop-color="#c7d1e0"/><stop offset="1" stop-color="#8795ad"/>
    </linearGradient>
    <linearGradient id="gCloudStorm" gradientUnits="userSpaceOnUse" x1="60" y1="34" x2="60" y2="90">
      <stop offset="0" stop-color="#7f8aa6"/><stop offset="1" stop-color="#434b66"/>
    </linearGradient>
    <linearGradient id="gDrop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b6e4ff"/><stop offset="1" stop-color="#3d9eff"/>
    </linearGradient>
    <linearGradient id="gBolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff7b0"/><stop offset="1" stop-color="#ffb41f"/>
    </linearGradient>
    <mask id="mCres" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
      <rect width="120" height="120" fill="#fff"/><circle cx="76" cy="46" r="27" fill="#000"/>
    </mask>
  </defs>
</svg>`;
    if (typeof document !== "undefined")
        document.body.insertAdjacentHTML("afterbegin", SPRITE);

    /* ---------- building blocks ---------- */
    // outer <g> carries the CSS animation, inner <g> carries the position (CSS transform would override the attribute)
    const cloud = (fill = "gCloud", tx = 0, ty = 0, s = 1, cls = "") =>
        `<g class="${cls}"><g transform="translate(${tx} ${ty}) scale(${s})" fill="url(#${fill})">
  <circle cx="38" cy="72" r="16"/><circle cx="58" cy="56" r="22"/><circle cx="82" cy="66" r="17"/>
  <rect x="30" y="68" width="62" height="21" rx="10.5"/>
</g></g>`;

    const sun = (cx = 60, cy = 60, s = 1) => {
        let rays = "";
        for (let i = 0; i < 8; i++)
            rays += `<rect x="58" y="12" width="4" height="13" rx="2" transform="rotate(${i * 45} 60 60)"/>`;
        return `<g transform="translate(${cx - 60 * s} ${cy - 60 * s}) scale(${s})">
  <circle class="a-pulse" cx="60" cy="60" r="46" fill="url(#gGlow)"/>
  <g class="a-rays" fill="#ffc83d">${rays}</g>
  <circle cx="60" cy="60" r="22" fill="url(#gSun)"/>
</g>`;
    };

    const moon = (cx = 60, cy = 60, s = 1) =>
        `<g transform="translate(${cx - 60 * s} ${cy - 60 * s}) scale(${s})">
  <circle class="a-pulse" cx="60" cy="60" r="46" fill="url(#gMoonGlow)"/>
  <circle cx="56" cy="64" r="32" fill="url(#gMoon)" mask="url(#mCres)"/>
</g>`;

    const star = (x, y, s, d) =>
        `<path class="a-twinkle" style="--d:${d}s" transform="translate(${x} ${y}) scale(${s})" d="M0-4 1.2-1.2 4 0 1.2 1.2 0 4-1.2 1.2-4 0-1.2-1.2Z" fill="#fff"/>`;

    const drops = (xs, y = 90, len = 11, w = 4) =>
        xs
            .map(
                (x, i) =>
                    `<line class="a-drop" style="--d:${(i * 0.31).toFixed(2)}s" x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + len}" stroke="url(#gDrop)" stroke-width="${w}" stroke-linecap="round"/>`
            )
            .join("");

    const flakes = xs =>
        xs
            .map(
                (x, i) =>
                    `<circle class="a-flake" style="--d:${(i * 0.45).toFixed(2)}s" cx="${x}" cy="96" r="3.2" fill="#fff"/>`
            )
            .join("");

    /* ---------- weather illustrations ---------- */
    const ART = {
        sun: () => sun(),
        moon: () =>
            moon() +
            star(88, 30, 1.1, 0) +
            star(30, 36, 0.8, 0.8) +
            star(94, 84, 0.7, 1.4),
        "partly-day": () =>
            sun(46, 46, 0.78) + cloud("gCloud", 14, 22, 0.86, "a-drift"),
        "partly-night": () =>
            moon(44, 46, 0.78) +
            star(90, 30, 0.9, 0.2) +
            star(24, 90, 0.6, 1) +
            cloud("gCloud", 14, 22, 0.86, "a-drift"),
        cloud: () =>
            cloud("gCloudGrey", -10, -6, 0.78, "a-drift2") +
            cloud("gCloud", 14, 20, 0.88, "a-drift"),
        drizzle: () =>
            cloud("gCloudGrey", 0, -8, 0.95) + drops([46, 62, 78], 88, 8, 3),
        rain: () =>
            cloud("gCloudGrey", 0, -8, 0.95) + drops([44, 60, 76], 88, 13, 4.2),
        thunder: () =>
            cloud("gCloudStorm", 0, -10, 0.95) +
            `<path class="a-bolt" d="M65 66 49 92h11l-6 20 24-30H66l8-16Z" fill="url(#gBolt)" stroke="#ffe27a" stroke-width="1" stroke-linejoin="round"/>` +
            drops([40, 84], 90, 10, 3.4),
        snow: () => cloud("gCloudGrey", 0, -8, 0.95) + flakes([42, 60, 78]),
        sleet: () =>
            cloud("gCloudGrey", 0, -8, 0.95) +
            drops([44, 76], 88, 11, 3.8) +
            flakes([60]),
        mist: () =>
            cloud("gCloud", 6, -8, 0.82, "a-drift") +
            [
                [24, 84, 64],
                [36, 96, 66],
                [22, 108, 52]
            ]
                .map(
                    ([x, y, w], i) =>
                        `<rect class="a-slide" style="--d:${i * 0.6}s" x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="#fff" opacity=".85"/>`
                )
                .join(""),
        wind: () =>
            `<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" class="a-wind">
  <path d="M16 46H68a12 12 0 1 0-12-12"/>
  <path d="M16 64H92a13 13 0 1 1-13 13" style="--d:.5s"/>
  <path d="M16 82H52a9 9 0 1 1-9 9" style="--d:1s"/>
</g>`
    };

    const wx = (kind, cls = "") =>
        `<svg class="wxi ${cls}" viewBox="0 0 120 120" role="img" aria-label="${kind.replace("-", " ")}" focusable="false">${(ART[kind] || ART.cloud)()}</svg>`;

    /* OpenWeather condition id → illustration kind */
    const kindOf = (id, n) => {
        if (id >= 200 && id < 300) return "thunder";
        if (id >= 300 && id < 400) return "drizzle";
        if (id === 511 || (id >= 612 && id <= 616)) return "sleet";
        if (id >= 500 && id < 600) return "rain";
        if (id >= 600 && id < 700) return "snow";
        if (id === 771 || id === 781) return "wind";
        if (id >= 700 && id < 800) return "mist";
        if (id === 800) return n ? "moon" : "sun";
        if (id === 801 || id === 802) return n ? "partly-night" : "partly-day";
        return "cloud";
    };

    /* ---------- small UI line icons (24×24, currentColor) ---------- */
    const UI = {
        pin: '<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
        therm: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
        drop: '<path d="M12 21.5a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5 12 2.5C11.5 5 10 7.4 8 9c-2 1.6-3 3.5-3 5.5a7 7 0 0 0 7 7z"/>',
        wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
        gauge: '<path d="M4 17a8.5 8.5 0 1 1 16 0"/><path d="m12 17 4-5"/><path d="M12 17h.01"/>',
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
        sunrise:
            '<path d="M12 2v8"/><path d="m4.9 10.9 1.4 1.4"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.1 10.9-1.4 1.4"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
        sunset: '<path d="M12 10V2"/><path d="m4.9 10.9 1.4 1.4"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.1 10.9-1.4 1.4"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
        umbrella:
            '<path d="M22 12a10 10 0 0 0-20 0Z"/><path d="M12 12v7a2 2 0 0 0 4 0"/><path d="M12 2v1"/>',
        refresh:
            '<path d="M3 12a9 9 0 0 1 9-9 9.7 9.7 0 0 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.7 9.7 0 0 1-6.7-2.7L3 16"/><path d="M8 16H3v5"/>',
        snow: '<path d="M12 2v20"/><path d="m4.2 7 15.6 10"/><path d="M4.2 17 19.8 7"/><path d="m9 4 3 2 3-2"/><path d="m9 20 3-2 3 2"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
        sparkle:
            '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
        alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        nav: '<path d="M12 3 18 20l-6-4-6 4z"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        up: '<path d="m6 14 6-6 6 6"/>',
        down: '<path d="m6 10 6 6 6-6"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
        wifi: '<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/><path d="m3 3 18 18"/>'
    };
    const ui = (name, cls = "") =>
        `<svg class="ui ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${UI[name] || ""}</svg>`;

    return { wx, kindOf, ui };
})();
