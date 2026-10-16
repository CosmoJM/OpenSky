#!/usr/bin/env node
/* OpenSky first-run: creates config/opensky.json from the example with a few friendly questions.
 *   node tools/first-run.js [--yes] [--settings FILE]
 * --yes (or no keyboard attached): no questions, the example's defaults.
 * Never overwrites an existing settings file. Town lookup uses Open-Meteo's free geocoding (no key, no account).
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");

const REPO = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = path.resolve(opt("--settings", path.join(REPO, "config", "opensky.json")));
const GEOCODE = process.env.OPENSKY_GEOCODE_URL || "https://geocoding-api.open-meteo.com/v1/search";

// Countries that mostly use °F / miles and a 12-hour clock
const IMPERIAL = ["US", "LR", "MM"];
const CLOCK12 = ["US", "CA", "AU", "NZ", "PH", "IN", "PK", "EG", "SA", "MX", "CO"];
const SUNDAY_FIRST = ["US", "CA", "MX", "BR", "JP", "PH", "IL", "SA", "IN", "ZA", "AU"];

async function findPlace(name) {
  const res = await fetch(`${GEOCODE}?name=${encodeURIComponent(name)}&count=5&language=en&format=json`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()).results || []).map((r) => ({
    label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    name: r.admin1 && r.country_code === "US" ? `${r.name}, ${usState(r.admin1)}` : [r.name, r.country].filter(Boolean).join(", "),
    latitude: Math.round(r.latitude * 10000) / 10000, longitude: Math.round(r.longitude * 10000) / 10000,
    country: r.country_code, timezone: r.timezone
  }));
}

const STATES = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC" };
const usState = (s) => STATES[s] || s;

// Do two time zones show the same time all year (e.g. America/Toronto and America/New_York)?
function sameClock(a, b) {
  const offset = (tz, d) => new Date(d.toLocaleString("en-US", { timeZone: tz })).getTime();
  try {
    const y = new Date().getFullYear();
    return [new Date(y, 0, 15), new Date(y, 6, 15)].every((d) => offset(a, d) === offset(b, d));
  } catch (e) { return a === b; }
}

function applyPlace(s, place) {
  s.location = { name: place.name, latitude: place.latitude, longitude: place.longitude };
  const c = place.country;
  s.locale.units = IMPERIAL.includes(c) ? "imperial" : "metric";
  s.locale.timeFormat = CLOCK12.includes(c) ? 12 : 24;
  s.locale.firstDayOfWeek = SUNDAY_FIRST.includes(c) ? 0 : 1;
  if (c !== "US") {   // US holidays + NFL are the only built-in ones so far
    s.header.holidays = "none";
    s.calendar.holidays = "none";
    s.header.sports = { league: "nfl", team: "" };
    s.locale.locale = c === "GB" ? "en-GB" : c === "CA" ? "en-CA" : c === "AU" ? "en-AU" : "en-US";
  }
}

(async () => {
  if (fs.existsSync(OUT)) { console.log(`Settings already exist: ${OUT} (left as they are)`); return; }
  const s = JSON.parse(fs.readFileSync(path.join(REPO, "config", "opensky.example.json"), "utf8"));
  s._readme = "OpenSky settings — edit freely (see docs/configure.md), then: opensky restart. No passwords or API keys here — those go in secrets.json.";
  const ask = !flag("--yes") && process.stdin.isTTY;

  if (ask) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\nA few quick questions (press Enter to skip any of them — you can change everything later).\n");
    const fam = (await rl.question("Family name for the top of the screen (e.g. The Smiths): ")).trim();
    if (fam) s.family.name = fam;
    for (;;) {
      const town = (await rl.question("Your town or city, for the weather (e.g. Boston): ")).trim();
      if (!town) { console.log("  Skipped — the weather stays off until a location is set (docs/configure.md)."); break; }
      let places;
      try { places = await findPlace(town); } catch (e) { console.log(`  Couldn't look that up (${e.message}). Check the internet, or skip for now.`); continue; }
      if (!places.length) { console.log("  No place by that name — try the nearest bigger town, or add the state/country."); continue; }
      places.forEach((p, i) => console.log(`   ${i + 1}) ${p.label}`));
      const pick = (await rl.question(`  Which one? [1-${places.length}, Enter = 1, 0 = search again]: `)).trim();
      if (pick === "0") continue;
      const place = places[(Number(pick) || 1) - 1] || places[0];
      applyPlace(s, place);
      console.log(`  ✓ ${place.label} — ${s.locale.units === "imperial" ? "°F" : "°C"}, ${s.locale.timeFormat}-hour clock`);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (place.timezone && tz && !sameClock(place.timezone, tz)) {
        console.log(`  ⚠ This Pi's clock is set to ${tz}, but ${place.name} is in ${place.timezone}.`);
        console.log(`    Fix it with:  sudo raspi-config nonint do_change_timezone ${place.timezone}`);
      }
      break;
    }
    rl.close();
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(s, null, 2) + "\n");
  console.log(`Settings saved: ${OUT}`);
})().catch((e) => { console.error(`first-run: ${e.message}`); process.exit(1); });
