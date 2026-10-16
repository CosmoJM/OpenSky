// README screenshots with a fictional demo family (run: node tools/harness.js tools/demo/screenshots.js).
// Writes docs/assets/screenshots/*.jpg. Not part of the test suite.
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "out"), SHOTS = path.join(__dirname, "..", "..", "docs", "assets", "screenshots");
const at = (dd, h, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + dd, h, m); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ev = (calendar, title, dd, h1, m1, h2, m2) => ({ uid: `${title}-${dd}`, calendar, title, start: at(dd, h1, m1).toISOString(), end: at(dd, h2, m2).toISOString(), allDay: false, description: "", location: "" });
const allDay = (calendar, title, dd) => ({ uid: `${title}-${dd}`, calendar, title, start: ymd(at(dd, 0)), end: ymd(at(dd, 0)), allDay: true, description: "", location: "" });
// the harness has just written fresh test data; the demo replaces it (before MagicMirror starts)
fs.writeFileSync(path.join(OUT, "local-calendar.test.json"), JSON.stringify({ version: 1, events: [
  ev("Testers", "Soccer practice", 0, 17, 0, 18, 30), ev("Mom", "Yoga", 0, 8, 0, 9, 0),
  ev("Testers", "Piano lesson", 1, 16, 0, 16, 45), ev("Dad", "Dentist", 1, 9, 30, 10, 30),
  ev("Mom", "Book club", 2, 19, 0, 21, 0), ev("Testers", "Swim class", 3, 10, 0, 11, 0), ev("Testers", "Grandma's visit", 3, 12, 0, 15, 0),
  allDay("Testers", "Science fair", 4), ev("Dad", "Haircut", 4, 11, 0, 11, 30), ev("Testers", "Movie night", 5, 19, 0, 21, 0),
  ev("Mom", "Farmers market", 6, 9, 0, 10, 30), ev("Testers", "Soccer game", 6, 13, 0, 14, 30), ev("Dad", "Oil change", 2, 7, 30, 8, 30)
] }));
fs.writeFileSync(path.join(OUT, "lists.test.json"), JSON.stringify({ version: 1, lists: {
  Groceries: ["Milk", "Eggs", "Strawberries", "Pasta", "Coffee beans", "Bananas"].map((text, i) => ({ id: `g${i}`, text })),
  Chores: ["Take out the recycling", "Water the plants", "Pack lunches"].map((text, i) => ({ id: `c${i}`, text }))
} }));

module.exports = async (page, h, app) => {
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: "jpeg", quality: 86 });
  const until = async (fn, tries = 60) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  await until(async () => page.evaluate(() => document.querySelectorAll(".hd-ph-layer.shown img").length > 0 && document.querySelectorAll(".hd-day-wx span").length > 3));
  await h.sleep(2500);
  await shot("home"); h.log("home");
  await h.tap(".os-page-calendar"); await h.sleep(2500); await shot("calendar"); h.log("calendar");
  await h.tap(".os-page-lists"); await h.sleep(1500); await shot("lists"); h.log("lists");
  await h.tap(".os-page-home"); await h.sleep(800);
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN"));
  await h.sleep(1500); await shot("settings"); h.log("settings");
  await page.evaluate(() => document.querySelector(".ost-x").click());
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETUP_OPEN"));
  await until(async () => page.evaluate(() => document.querySelectorAll(".osu-code span").length === 6));
  await h.sleep(800); await shot("phone-setup-screen"); h.log("pair card");
  const code = await page.evaluate(() => [...document.querySelectorAll(".osu-code span")].map((s) => s.textContent).join(""));
  await app.evaluate(({ BrowserWindow }) => { const w = new BrowserWindow({ width: 390, height: 844, show: true }); w.loadURL("http://localhost:8091/"); });
  const phone = await app.waitForEvent("window", { timeout: 20000 });
  await phone.waitForLoadState();
  await until(() => phone.evaluate(() => !!document.querySelector(".code-input")));
  await phone.fill(".code-input", code);
  await until(() => phone.evaluate(() => !!document.querySelector("#family")));
  await h.sleep(800);
  await phone.screenshot({ path: path.join(SHOTS, "phone-setup.jpg"), type: "jpeg", quality: 86 }); h.log("phone");
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Setup")[0].close(true));
  h.log("SUMMARY: ALL CHECKS PASSED (screenshots)");
};
module.exports.patchSettings = (s) => {
  s.family.name = "The Rivera Family";
  s.calendar.sources = [{ name: "Testers", type: "local", color: "blue" }, { name: "Mom", type: "local", color: "pink" }, { name: "Dad", type: "local", color: "green" }, { name: "School", color: "teal" }];
  s.calendar.colors = { calendars: {}, rules: [{ match: "dentist", color: "indigo" }, { match: "soccer", color: "orange" }] };
  s.photos = { provider: "folder", folder: path.join(__dirname, "..", "fixtures", "demo-photos"), usb: false, intervalSeconds: 600 };
  s.header.occasions = [{ name: "Grandma's birthday", month: new Date().getMonth() + 1, day: Math.min(28, new Date().getDate() + 9) }];
  s.pages = ["home", "calendar", "lists", "smarthome", "wordgame", "timer"];
  delete s.embeds.vault;
};
