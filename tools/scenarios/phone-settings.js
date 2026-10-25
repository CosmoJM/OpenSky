// Phone setup: EVERY setting on the phone page, changed the way a person would (taps, typing, pickers), saved, and
// checked in opensky.json / secrets.json; the saved settings build a working screen config. Also: saving several
// times, closing the card on the screen while the phone is still editing, and what the phone says when the screen
// can't be reached (the browser's own words are just "Load failed").
// Uses writable copies of the settings (tools/out), never the fixtures.
const fs = require("fs"), path = require("path"), http = require("http");
const OUT = path.join(__dirname, "..", "out");
const DEST = path.join(OUT, "backup-dest"), MOUNTS = path.join(OUT, "mounts.test");
fs.rmSync(DEST, { recursive: true, force: true }); fs.mkdirSync(DEST, { recursive: true });
fs.writeFileSync(MOUNTS, "");
fs.rmSync(path.join(OUT, "backup-status.test.json"), { force: true });

// a stand-in for the town search (Open-Meteo geocoding) on port 8093
const GEO = 8093;
const fakeGeo = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ results: [{ name: "Toronto", admin1: "Ontario", country: "Canada", country_code: "CA", latitude: 43.70011, longitude: -79.4163, timezone: "America/Toronto" }] }));
});
fakeGeo.listen(GEO, "127.0.0.1"); fakeGeo.unref();
// a stand-in Home Assistant for the Music page's other speakers (port 8098)
const HA = 8098;
const fakeHA = http.createServer((req, res) => {
  res.writeHead(req.headers.authorization === "Bearer ha-phone-token" ? 200 : 401, { "Content-Type": "application/json" });
  res.end(JSON.stringify(req.url === "/api/states" ? [{ entity_id: "media_player.kitchen", state: "playing", attributes: { friendly_name: "Kitchen" } }, { entity_id: "media_player.attic", state: "off", attributes: { friendly_name: "Attic" } }, { entity_id: "light.hall", state: "on", attributes: {} }] : {}));
});
fakeHA.listen(HA, "127.0.0.1"); fakeHA.unref();

module.exports = async (page, h, app) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 40) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const settings = () => JSON.parse(fs.readFileSync(path.join(OUT, "opensky.test.json"), "utf8"));
  const secrets = () => JSON.parse(fs.readFileSync(path.join(OUT, "secrets.test.json"), "utf8"));

  // open setup on the screen, pair a phone
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETUP_OPEN"));
  await until(() => page.evaluate(() => document.querySelectorAll(".osu-code span").length === 6));
  const code = await page.evaluate(() => [...document.querySelectorAll(".osu-code span")].map((s) => s.textContent).join(""));
  await app.evaluate(({ BrowserWindow }) => { const w = new BrowserWindow({ width: 390, height: 844, show: true }); w.loadURL("http://localhost:8091/"); });
  const phone = await app.waitForEvent("window", { timeout: 20000 });
  await phone.waitForLoadState();
  await until(() => phone.evaluate(() => !!document.querySelector(".code-input")));
  await phone.fill(".code-input", code);
  await until(() => phone.evaluate(() => !!document.querySelector("#family")));

  // ---- tap helpers (by visible text / label, like a person) ----
  const tap = async (scope, selector, label) => {
    const done = await phone.evaluate(([sc, sel, t]) => {
      const root = sc ? document.querySelector(sc) : document;
      const b = [...root.querySelectorAll(sel)].find((x) => (t == null) || x.textContent.trim() === t || x.getAttribute("aria-label") === t);
      if (!b) return false; b.click(); return true;
    }, [scope, selector, label]);
    if (!done) throw new Error(`nothing to tap: ${scope || ""} ${selector} "${label}"`);
    await h.sleep(250);
  };
  const pick = async (scope, label, value) => {   // a <select> in the field with this label
    const done = await phone.evaluate(([sc, l, v]) => {
      const f = [...document.querySelector(sc).querySelectorAll(".field")].find((x) => x.querySelector(".label")?.textContent.trim() === l);
      const s = f && f.querySelector("select");
      if (!s || ![...s.options].some((o) => o.value === String(v))) return false;
      s.value = String(v); s.dispatchEvent(new Event("change", { bubbles: true })); return true;
    }, [scope, label, value]);
    if (!done) throw new Error(`no choice "${value}" in ${scope} "${label}"`);
    await h.sleep(200);
  };
  const type = async (selector, value) => { await phone.fill(selector, value); await h.sleep(100); };
  const sheetButton = (label) => tap(".sheet", ".sheet-foot .btn", label);
  const row = async (scope, title) => {   // a list row (calendar, list, web page) by its title
    const done = await phone.evaluate(([sc, t]) => { const r = [...document.querySelector(sc).querySelectorAll(".row")].find((x) => x.querySelector("b")?.textContent === t); if (r) r.click(); return !!r; }, [scope, title]);
    if (!done) throw new Error(`no row "${title}" in ${scope}`);
    await h.sleep(300);
  };
  const save = async () => {
    await tap(".bar", ".btn", "Save");
    return until(() => phone.evaluate(() => /Saved ✓/.test(document.querySelector(".bar")?.textContent || "")));
  };
  const bar = () => phone.evaluate(() => document.querySelector(".bar")?.textContent || "");

  // ---- Family: name, town (search), °F/°C, clock, week start ----
  await type("#family input.input", "The Phone Testers");
  await tap("#family", ".place .btn", "Change");
  await type(".sheet .search input", "Toronto");
  await tap(".sheet", ".search .btn", "Search");
  await until(() => phone.evaluate(() => !!document.querySelector(".sheet .results .row")));
  await tap(".sheet", ".results .row", null);
  await h.sleep(400);
  await tap("#family", ".seg button", "24-hour");
  await tap("#family", ".seg button", "Monday");
  ok("the bar says 'Unsaved changes' with a Save button", /Unsaved changes/.test(await bar()));
  ok("save #1 (family)", await save());
  let S = settings();
  ok("family: name, town (search) with °C, 24-hour clock, Monday", S.family.name === "The Phone Testers" && S.location.name === "Toronto, Canada" && S.location.latitude === 43.7001 &&
    S.locale.units === "metric" && S.locale.country === "CA" && S.locale.timeFormat === 24 && S.locale.firstDayOfWeek === 1, { family: S.family, location: S.location, locale: S.locale });
  await tap("#family", ".seg button", "°F");
  await save();
  ok("save #2: °F back (saving again and again works)", settings().locale.units === "imperial");

  // ---- Calendars: holidays off, on-screen calendar, iCloud, colour change, remove ----
  await tap("#calendars", ".toggle", "Public holidays");
  await tap("#calendars", ".add", null);
  await tap(".sheet", ".seg button", "On screen");
  await type(".sheet input.input[type=text]", "Kids");
  await tap(".sheet", ".chip", "purple");
  await sheetButton("Add");
  await tap("#calendars", ".add", null);
  await tap(".sheet", ".seg button", "iCloud & co.");
  await type(".sheet .field:first-of-type input.input", "Work");
  await type(".sheet input[inputmode=email]", "someone@example.com");
  await type(".sheet input[type=password]", "abcd-efgh-ijkl-mnop");
  await sheetButton("Add");
  await row("#calendars", "Family");
  await tap(".sheet", ".chip", "teal");
  await sheetButton("Done");
  await row("#calendars", "School");
  await sheetButton("Remove");
  await save();
  S = settings(); let sec = secrets();
  const src = (n) => S.calendar.sources.find((c) => c.name === n);
  ok("calendars: holidays off, on-screen 'Kids' (purple), iCloud 'Work' (password only in secrets), Family → teal, School removed (and its link)",
    S.calendar.holidays === "none" && src("Kids")?.type === "local" && src("Kids")?.color === "purple" && src("Work")?.type === "caldav" &&
    sec.calendar.caldav?.Work?.password === "abcd-efgh-ijkl-mnop" && sec.calendar.caldav.Work.url === "https://caldav.icloud.com/" && !JSON.stringify(S).includes("abcd-efgh") &&
    src("Family")?.color === "teal" && !src("School") && !(sec.calendar.sources && sec.calendar.sources.School), S.calendar.sources.map((c) => `${c.name}:${c.type || "link"}:${c.color}`));

  // ---- Lists: a Todoist list + token, a colour change, a removal ----
  await tap("#lists", ".add", null);
  await type(".sheet .field:first-of-type input.input", "Errands");
  await tap(".sheet", ".seg button", "Todoist");
  await type(".sheet input[placeholder^='Same as']", "Errands Project");
  await sheetButton("Add");
  await type("#lists input[placeholder='Paste your token']", "todoist-token-123456");
  await row("#lists", "Groceries");
  await tap(".sheet", ".chip", "orange");
  await sheetButton("Done");
  await row("#lists", "Chores");
  await sheetButton("Remove");
  await save();
  S = settings(); sec = secrets();
  ok("lists: Todoist 'Errands' (project, token in secrets), Groceries → orange, Chores removed",
    JSON.stringify(S.lists.lists) === JSON.stringify([{ name: "Groceries", color: "orange" }, { name: "Errands", color: S.lists.lists[1]?.color, provider: "todoist", project: "Errands Project" }]) &&
    sec.lists?.todoist?.token === "todoist-token-123456", S.lists.lists);

  // ---- Photos: Immich (address, key, every minute) → saved; then back to a folder, USB stick on ----
  await tap("#photos", ".seg button", "Immich");
  await type("#photos input[inputmode=url]", "http://192.168.1.20:2283");
  await type("#photos input[type=password]", "immich-key-abcdef");
  await pick("#photos", "Change photo every", 60);
  await save();
  S = settings(); sec = secrets();
  ok("photos: Immich address + key (secret) + every minute", S.photos.provider === "immich" && S.photos.url === "http://192.168.1.20:2283" && S.photos.intervalSeconds === 60 && sec.photos?.immich?.apiKey === "immich-key-abcdef", S.photos);
  await tap("#photos", ".seg button", "Off");
  await save();
  ok("photos: Off", settings().photos.enabled === false);
  await tap("#photos", ".seg button", "On the Pi");
  await type("#photos .field input.input", "~/Family Photos");
  await tap("#photos", ".toggle", "USB stick");   // the test settings start with it off
  await save();
  S = settings();
  ok("photos: a folder on the Pi, USB stick switched on", S.photos.enabled === true && S.photos.provider === "folder" && S.photos.folder === "~/Family Photos" && S.photos.usb === true, S.photos);

  // ---- Web pages: one plain, one with a PIN, one removed ----
  await tap("#web", ".add", null);
  await type(".sheet input[maxlength='14']", "Cameras");
  await type(".sheet input[inputmode=url]", "http://cameras.local:5000");
  await tap(".sheet", ".icon-pick", "camera");
  await sheetButton("Add");
  await tap("#web", ".add", null);
  await type(".sheet input[maxlength='14']", "Bank");
  await type(".sheet input[inputmode=url]", "http://192.168.1.50:8080");
  await tap(".sheet", ".icon-pick", "chart");
  await type(".sheet input[inputmode=numeric]", "4826");
  await sheetButton("Add");
  await row("#web", "Smart Home");
  await sheetButton("Remove");
  await save();
  S = settings(); sec = secrets();
  ok("web pages: Cameras (address + camera icon), Bank (PIN + address only in secrets), Smart Home removed (page too)",
    S.embeds.cameras?.url === "http://cameras.local:5000" && S.embeds.cameras.icon === "camera" && S.embeds.bank?.icon === "chart" && !S.embeds.bank.url &&
    sec.embeds?.bank?.pin === "4826" && sec.embeds.bank.url === "http://192.168.1.50:8080" && !S.embeds.smarthome && !S.pages.includes("smarthome") &&
    S.pages.includes("cameras") && S.pages.includes("bank"), { embeds: S.embeds, pages: S.pages });

  // ---- Pages: Timer off, Lists moved up ----
  await tap("#pages", ".toggle", "Timer");
  await phone.evaluate(() => { const r = [...document.querySelectorAll("#pages .pagerow")].find((x) => x.querySelector("b").textContent === "Lists"); r.querySelector("[aria-label=Up]").click(); });
  await h.sleep(250);
  await save();
  S = settings();
  ok("pages: Timer off, Lists moved up one", !S.pages.includes("timer") && S.pages.indexOf("lists") === 1, S.pages);

  // ---- Extras: accent, trash day, city schedule, pickup link, sports, word game, weather + key ----
  await tap("#extras", ".chip", "teal");
  await pick("#extras", "Trash day", "thursday");
  await pick("#extras", "City pickup schedule", "");
  await type("#extras input[inputmode=url]", "https://recollect.example/ics/abc123");
  await pick("#extras", "Sports league", "nba");
  await type("#extras input[maxlength='5']", "bos");
  await tap("#extras", ".seg button", "OpenSky's words");
  await tap("#extras", ".seg button", "OpenWeatherMap");
  await type("#extras input[placeholder='Paste the key']", "owm-key-123456");
  await save();
  S = settings(); sec = secrets();
  ok("extras: accent teal, Thursday trash, no city schedule, pickup link (secret), NBA/BOS, OpenSky's words, OpenWeatherMap + key (secret)",
    S.look?.accent === "teal" && S.pickup.trashDay === "thursday" && S.pickup.preset === "" && S.pickup.url === "secret" && sec.calendar.sources?.Pickup === "https://recollect.example/ics/abc123" &&
    S.header.sports.league === "nba" && S.header.sports.team === "BOS" && S.wordgame.source === "opensky" && S.weather.provider === "openweathermap" && sec.weather?.openweathermap?.apiKey === "owm-key-123456",
    { look: S.look, pickup: S.pickup, sports: S.header.sports, wordgame: S.wordgame, weather: S.weather });

  // ---- accent: any colour as a code (typed, any case) or from the phone's colour picker; then back to teal ----
  await type("#extras .hex-input", "#2E7D32");
  const chipOff = await phone.evaluate(() => !document.querySelector("#extras .chip.on") && document.querySelector("#extras .color-pick").value === "#2e7d32");
  await save();
  ok("accent: a typed colour code → saved as #rrggbb, the chips let go, the colour picker follows", settings().look?.accent === "#2e7d32" && chipOff, settings().look);
  await type("#extras .color-pick", "#fff8dc");
  const fromPicker = await phone.evaluate(() => ({ code: document.querySelector("#extras .hex-input").value, warn: !document.querySelector("#extras .hint.bad").hidden }));
  await save();
  ok("accent: the phone's colour picker → saved, the code box follows, a very light colour gets a warning", settings().look?.accent === "#fff8dc" && fromPicker.code === "#fff8dc" && fromPicker.warn, fromPicker);
  await type("#extras .hex-input", "#12zz45");
  await phone.evaluate(() => document.querySelector("#extras .hex-input").blur());
  const bad = await phone.evaluate(() => document.querySelector("#extras .hex-input").classList.contains("bad"));
  await tap("#extras", ".chip", "teal");
  await save();
  ok("accent: a code that isn't a colour is marked and not used; a chip still works afterwards", bad && settings().look?.accent === "teal", settings().look);

  // ---- Music add-on: the page on → its settings appear in Extras (speaker name, AirPlay / Spotify) ----
  ok("Music settings are hidden until the Music page is on", !(await phone.evaluate(() => /Speaker name/.test(document.querySelector("#extras").textContent))));
  await tap("#pages", ".toggle", "Music");
  ok("…then show, with how to install the add-on", await phone.evaluate(() => /Speaker name/.test(document.querySelector("#extras").textContent) && /opensky addon music/.test(document.querySelector("#extras").textContent)));
  await type("#extras input[maxlength='40']", "Kitchen speaker");
  await tap("#extras", ".toggle", "AirPlay");
  await save();
  S = settings();
  ok("music: page on, speaker name, AirPlay off, Spotify left on", S.pages.includes("music") && S.music?.name === "Kitchen speaker" && S.music.airplay === false && S.music.spotify !== false, { pages: S.pages, music: S.music });
  // other speakers: Home Assistant address + token, save, Find my speakers, pick one
  await type("#extras input[placeholder='http://homeassistant.local:8123']", `http://127.0.0.1:${HA}`);
  await type("#extras input[placeholder='Paste a long-lived access token']", "ha-phone-token");
  await save();
  await tap("#extras", ".btn.block", "Find my speakers");
  await until(() => phone.evaluate(() => /Attic/.test(document.querySelector("#extras").textContent)));
  const found = await phone.evaluate(() => [...document.querySelectorAll("#extras .rows .line b")].map((b) => b.textContent));
  await tap("#extras", ".toggle", "Kitchen");
  await save();
  S = settings(); sec = secrets();
  ok("other speakers: Find my speakers lists Home Assistant's speakers; Kitchen picked and saved (address + token only in secrets)",
    found.join() === "Attic,Kitchen" && JSON.stringify(S.music.speakers) === '["media_player.kitchen"]' && sec.homeassistant?.token === "ha-phone-token" && !JSON.stringify(S).includes("ha-phone-token"), { found, speakers: S.music.speakers });

  // ---- Backup: nightly to a folder, time, how many, with passwords; then Back up now ----
  await until(() => phone.evaluate(() => !!document.querySelector("#backup .auto-backup select")));
  await pick("#backup", "Back up every night to", DEST);
  await pick("#backup", "Time", "02:00");
  await pick("#backup", "Keep", 30);
  await tap("#backup", ".toggle", "Include passwords in automatic backups");
  await save();
  S = settings();
  ok("automatic backups: place, 2 AM, keep 30, with passwords", S.backup?.destination === DEST && S.backup.time === "02:00" && S.backup.keep === 30 && S.backup.includeSecrets === true, S.backup);
  await tap("#backup", ".btn.block", "Back up now");
  await until(() => phone.evaluate(() => /Backed up/.test(document.querySelector(".toast")?.textContent || "")));
  const made = fs.existsSync(path.join(DEST, "OpenSky-backups")) ? fs.readdirSync(path.join(DEST, "OpenSky-backups")) : [];
  ok("Back up now: a backup file in the chosen place", made.length === 1 && /^opensky-backup-\d{4}-\d\d-\d\d\.json$/.test(made[0]), made);

  // ---- nothing lost along the way: everything from the earlier saves is still there ----
  S = settings(); sec = secrets();
  ok("every earlier change is still saved after 15 saves", S.family.name === "The Phone Testers" && S.location.name === "Toronto, Canada" && S.locale.units === "imperial" &&
    S.calendar.sources.some((c) => c.name === "Kids") && S.lists.lists.some((l) => l.name === "Errands") && S.photos.folder === "~/Family Photos" && S.embeds.cameras && S.look.accent === "teal" &&
    sec.calendar.caldav.Work && sec.lists.todoist.token && sec.embeds.bank.pin);

  // ---- the saved settings build a working screen config (what Finish restarts into) ----
  const tmpCfg = fs.mkdtempSync(path.join(OUT, "cfg-"));
  process.env.OPENSKY_SETTINGS = path.join(OUT, "opensky.test.json");
  process.env.OPENSKY_SECRETS = path.join(OUT, "secrets.test.json");
  const prevRoot = global.root_path; global.root_path = path.join(__dirname, "..", "..");
  let cfg, cfgErr = null;
  try {
    const srcCfg = fs.readFileSync(path.join(__dirname, "..", "..", "config", "config.js"), "utf8");
    const m = { exports: {} };
    new Function("module", "exports", "require", "__dirname", srcCfg)(m, m.exports, require, path.join(__dirname, "..", "..", "config"));
    cfg = m.exports;
  } catch (e) { cfgErr = e.message; }
  global.root_path = prevRoot; fs.rmSync(tmpCfg, { recursive: true, force: true });
  const built = cfg ? JSON.stringify(cfg) : "";
  ok("the saved settings build the screen's config (no error, no passwords in it)", !!cfg && Array.isArray(cfg.modules) && cfg.modules.length > 5 &&
    !/abcd-efgh|todoist-token|immich-key|owm-key|4826|recollect\.example/.test(built), cfgErr || (cfg && cfg.modules.length));

  // ---- closing the card on the screen while the phone is still editing ----
  await page.evaluate(() => document.querySelector(".osu-x")?.click());
  await h.sleep(500);
  ok("the card closes on the screen", await page.evaluate(() => !document.querySelector(".osu-host")?.children.length));
  await type("#family input.input", "Closed On Screen");
  ok("…and the phone can still save (setup stays open for the connected phone)", await save() && settings().family.name === "Closed On Screen", await bar());

  // ---- the screen can't be reached: a clear message, the change kept for another try ----
  await phone.evaluate(() => fetch("/api/done", { method: "POST", headers: { "X-OpenSky": "1" } }));
  await h.sleep(800);
  await type("#family input.input", "After Finish");
  await tap(".bar", ".btn", "Save");
  await until(() => phone.evaluate(() => /Can't reach the screen/.test(document.querySelector(".toast")?.textContent || "")));
  const msg = await phone.evaluate(() => document.querySelector(".toast")?.textContent || "");
  ok("can't reach the screen: a clear message (not 'Load failed'), the change stays unsaved for another try", /Can't reach the screen/.test(msg) && /same Wi-Fi/.test(msg) && /Unsaved changes/.test(await bar()) && settings().family.name === "Closed On Screen", msg);
  await phone.evaluate(() => window.scrollTo(0, 0)); await h.sleep(300);
  await phone.screenshot({ path: path.join(OUT, "phone-settings-offline.png") });

  fakeGeo.close(); fakeHA.close();
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.writableSettings = true;
module.exports.env = {
  OPENSKY_GEOCODE_URL: `http://127.0.0.1:${GEO}/search`,
  OPENSKY_BACKUP_HOME: DEST, OPENSKY_MOUNTS: MOUNTS, OPENSKY_GVFS: path.join(OUT, "no-gvfs"),
  OPENSKY_BACKUP_STATUS: path.join(OUT, "backup-status.test.json"),
  OPENSKY_MUSIC_INSTALLED: ""   // the Music add-on not installed (whatever this computer has)
};
