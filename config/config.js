/* OpenSky — MagicMirror configuration builder.
 *
 * Don't edit this file to set up your family's screen: edit config/opensky.json (see opensky.example.json).
 * This file reads those settings and builds the module list MagicMirror needs.
 *
 * Secrets (API keys, tokens, PINs) are NEVER placed here: MagicMirror sends this whole config to every device on
 * the network (http://<pi>:8080/config). Modules read secrets from config/secrets.json on the Pi itself.
 */
const fs = require("fs");
const path = require("path");

function readSettings() {
  for (const file of ["opensky.json", "opensky.example.json"]) {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) continue;
    try {
      return { file, settings: JSON.parse(fs.readFileSync(p, "utf8")) };
    } catch (e) {
      console.error(`[OpenSky] ${file} is not valid JSON (${e.message}) — fix it or delete it to use the example settings`);
    }
  }
  return { file: null, settings: {} };
}

const { file: settingsFile, settings: s } = readSettings();
const locale = s.locale || {};

// Each page = the modules that appear on it. Order of `pages` in opensky.json = order in the sidebar.
const PAGES = {
  timer: () => [{
    module: "MMM-OpenSky-Timer",
    position: "fullscreen_below",
    config: {
      quickAddButtons: ((s.timer && s.timer.quickAddMinutes) || [5, 10, 15, 30, 45, 60])
        .map((m) => ({ label: m % 60 === 0 && m >= 60 ? `+${m / 60} hr` : `+${m} min`, seconds: m * 60 })),
      alarm: { volume: (s.timer && s.timer.chimeVolume) ?? 0.6, repeatEverySeconds: 2.5, maxRingSeconds: 180 }
    }
  }]
};

const pages = (Array.isArray(s.pages) && s.pages.length ? s.pages : ["timer"]).filter((p) => {
  if (PAGES[p]) return true;
  console.error(`[OpenSky] unknown page "${p}" in ${settingsFile} — skipped`);
  return false;
});
const pageModules = pages.map((p) => PAGES[p]());

let config = {
  address: process.env.OPENSKY_ADDRESS || "localhost",
  port: Number(process.env.OPENSKY_PORT) || 8080,
  basePath: "/",
  ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],
  language: locale.language || "en",
  locale: locale.locale || "en-US",
  timeFormat: locale.timeFormat === 24 ? 24 : 12,
  units: locale.units === "metric" ? "metric" : "imperial",
  customCss: "css/opensky.css",

  modules: [
    {
      module: "MMM-pages",
      config: {
        timings: { default: 0 },
        animationTime: 0,
        modules: pageModules.map((mods) => mods.map((m) => m.module)),
        fixed: []
      }
    },
    ...pageModules.flat()
  ]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
