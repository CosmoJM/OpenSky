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
      return { file, dir: path.dirname(p), settings: JSON.parse(fs.readFileSync(p, "utf8")) };
    } catch (e) {
      console.error(`[OpenSky] ${file} is not valid JSON (${e.message}) — fix it or delete it to use the example settings`);
    }
  }
  return { file: null, settings: {} };
}

const { file: settingsFile, dir: settingsDir, settings: s } = readSettings();
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

// Curbside pickup: trash day + an optional city preset (lib/pickup-presets/<name>.json) + the family's own overrides
const DAYS = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
function pickupSchedule(p) {
  if (!p || !p.trashDay) return null;
  const trashDay = DAYS[String(p.trashDay).toLowerCase()] || Number(p.trashDay);
  if (!(trashDay >= 1 && trashDay <= 5)) { console.error(`[OpenSky] pickup.trashDay "${p.trashDay}" isn't a weekday — pickup icons off`); return null; }
  let preset = {};
  if (p.preset) {
    const f = path.join(global.root_path || path.resolve(__dirname, ".."), "modules", "opensky-lib", "pickup-presets", `${String(p.preset).replace(/[^a-z0-9-]/gi, "")}.json`);
    try { preset = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.error(`[OpenSky] pickup preset "${p.preset}" not found (${f})`); }
  }
  const { _about, ...presetData } = preset;
  const own = { ...p }; delete own.preset; delete own.trashDay;
  return { ...presetData, ...own, trashDay };
}

// A folder setting may be relative to the settings file (e.g. the test fixture's "photos")
const folderPath = (f) => (!f ? null : /^[~/]/.test(f) ? f : path.join(settingsDir || CONFIG_DIR, f));

// Each page = the modules that appear on it.
const PAGES = {
  calendar: () => [
    {
      module: "MMM-CalendarExt3",          // month view (community module, MIT, pinned + OpenSky patch)
      position: "fullscreen_above",
      config: {
        mode: "month", instanceId: "OPENSKY", animationSpeed: 0,
        firstDayOfWeek: locale.firstDayOfWeek === 1 ? 1 : 0,
        showHeader: true, customHeader: true, headerTitleOptions: { month: "long", year: "numeric" },
        maxEventLines: 3, showMore: true, fontSize: "20px", eventHeight: "38px",
        eventTimeOptions: { hour: "numeric", minute: "2-digit", hour12: locale.timeFormat !== 24 },
        cellDateOptions: { day: "numeric" }, displayEndTime: false, useSymbol: false, calendars: [],
        // colour class from the shared palette (window.OpenSkyEventColors, loaded by MMM-OpenSky-Calendar)
        eventTransformer: (ev) => { if (typeof window !== "undefined" && window.OpenSkyEventColors) ev.class = `evc-${window.OpenSkyEventColors.name(ev)}`; return ev; }
      }
    },
    {
      module: "MMM-OpenSky-Calendar",
      position: "fullscreen_above",
      config: { instanceId: "OPENSKY", canAddEvents: false, eventColors: (s.calendar && s.calendar.colors) || null }
    }
  ],
  home: () => [{
    module: "MMM-OpenSky-Home",
    position: "fullscreen_above",
    config: {
      listsPage: pages.indexOf("lists") >= 0 ? pages.indexOf("lists") : null,
      canAddEvents: false,
      maxEventsPerDay: 4,
      eventColors: (s.calendar && s.calendar.colors) || null,
      photos: {
        enabled: !(s.photos && s.photos.enabled === false),
        provider: (s.photos && s.photos.provider) || "folder",
        folder: folderPath(s.photos && s.photos.folder) || "~/Pictures",
        usb: !(s.photos && s.photos.usb === false),
        url: (s.photos && s.photos.url) || null,
        intervalSeconds: (s.photos && s.photos.intervalSeconds) || 30
      },
      pickup: pickupSchedule(s.pickup)
    }
  }],
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

const pages = (Array.isArray(s.pages) && s.pages.length ? s.pages : ["home", "timer"]).filter((p) => {
  if (PAGES[p]) return true;
  console.error(`[OpenSky] unknown page "${p}" in ${settingsFile} — skipped`);
  return false;
});
const pageModules = pages.map((p) => PAGES[p]());
const familyName = ((s.family && s.family.name) || "").trim();

const loc = s.location || {};
const units = locale.units === "metric" ? "metric" : "imperial";
const header = s.header || {};

// Calendar sources (a module with no screen of its own; any page can use the events)
const cal = s.calendar || {};
const calendarSources = (Array.isArray(cal.sources) ? cal.sources : []).filter((c) => c && c.name)
  .map((c) => ({ name: String(c.name), type: ["local", "caldav"].includes(c.type) ? c.type : "link", url: c.url || null, color: c.color || null, fetchMinutes: c.fetchMinutes || 5 }));
if (cal.holidays === "US") calendarSources.push({ name: "Holidays", url: "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics", color: "tan", fetchMinutes: 720 });

// Modules shown on every page
const fixed = [
  ...(calendarSources.length ? [{ module: "MMM-OpenSky-Calendars", config: { sources: calendarSources } }] : []),
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
