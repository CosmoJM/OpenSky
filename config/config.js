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

// MagicMirror ≥ 2.38 evaluates this file from a string, so __dirname isn't the config folder: use its root path
const CONFIG_DIR = path.join(global.root_path || path.resolve(__dirname, ".."), "config");

function readSettings() {
  // OPENSKY_SETTINGS = another settings file (the test harness uses tools/fixtures/opensky.test.json)
  for (const file of [process.env.OPENSKY_SETTINGS, "opensky.json", "opensky.example.json"].filter(Boolean)) {
    const p = path.isAbsolute(file) ? file : path.join(CONFIG_DIR, file);
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

// Sidebar label + icon for every page OpenSky knows (order of `pages` in opensky.json = order in the sidebar)
const PAGE_INFO = {
  home: { label: "Home" },
  calendar: { label: "Calendar" },
  lists: { label: "Lists" },
  smarthome: { label: "Smart Home" },
  wordgame: { label: "Word Game" },
  timer: { label: "Timer" }
};

// Each page = the modules that appear on it.
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
const familyName = ((s.family && s.family.name) || "").trim();

const loc = s.location || {};
const units = locale.units === "metric" ? "metric" : "imperial";
const header = s.header || {};

// Modules shown on every page
const fixed = [
  {
    module: "MMM-OpenSky-Header",
    position: "top_bar",
    config: {
      title: familyName || "Our Family",
      time: { format12: locale.timeFormat !== 24, showSeconds: false, updateInterval: 1000 },
      weather: {
        provider: (s.weather && s.weather.provider) || "open-meteo",
        latitude: Number.isFinite(loc.latitude) ? loc.latitude : null,
        longitude: Number.isFinite(loc.longitude) ? loc.longitude : null,
        units, refreshMinutes: 15
      },
      countdown: {
        holidays: header.holidays === "none" ? "none" : "US",
        custom: Array.isArray(header.occasions) ? header.occasions : [],
        birthdays: header.birthdaysFromCalendar !== false
      },
      sports: header.sports && header.sports.team ? { league: header.sports.league || "nfl", team: header.sports.team } : null
    }
  },
  {
    module: "MMM-OpenSky-Sidebar",
    position: "fullscreen_above",
    config: {
      pages: pages.map((key, index) => ({ key, index, label: (PAGE_INFO[key] || {}).label || key, icon: key })),
      familyInitial: (familyName.replace(/^the\s+/i, "")[0] || "H").toUpperCase(),
      idleReturnMinutes: (s.sidebar && Number.isFinite(s.sidebar.idleReturnMinutes)) ? s.sidebar.idleReturnMinutes : 5,
      screenServiceUrl: (s.screen && s.screen.serviceUrl) || null
    }
  }
];

let config = {
  address: process.env.OPENSKY_ADDRESS || "localhost",
  port: Number(process.env.OPENSKY_PORT) || 8080,
  basePath: "/",
  ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],
  language: locale.language || "en",
  locale: locale.locale || "en-US",
  timeFormat: locale.timeFormat === 24 ? 24 : 12,
  units,
  customCss: "css/opensky.css",

  modules: [
    {
      module: "MMM-pages",
      config: {
        timings: { default: 0 },
        animationTime: 0,
        modules: pageModules.map((mods) => mods.map((m) => m.module)),
        fixed: fixed.map((m) => m.module)
      }
    },
    ...fixed,
    ...pageModules.flat()
  ]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
