// Google Calendar on the screen (against a fake Google): its events show with the family's, and the event editor
// adds, edits and deletes on Google; a view-only Google calendar can't be changed.
const http = require("http");
const PORT = 8093;
const day = (dd, h, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + dd, h, m); };
const store = { primary: [{ id: "g1", summary: "Work offsite", start: { dateTime: day(1, 13).toISOString() }, end: { dateTime: day(1, 15).toISOString() } }],
  "club@group.calendar.google.com": [{ id: "c1", summary: "Soccer match", start: { dateTime: day(2, 10).toISOString() }, end: { dateTime: day(2, 12).toISOString() } }] };
let nextId = 10;
const fake = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const u = new URL(req.url, "http://x"), send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
    if (u.pathname === "/token") return send(200, { access_token: "fa", expires_in: 3600 });
    const m = u.pathname.match(/^\/cal\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    const list = m && store[decodeURIComponent(m[1])];
    if (!list) return send(404, { error: { message: "nf" } });
    if (req.method === "GET") { const a = Date.parse(u.searchParams.get("timeMin")), b = Date.parse(u.searchParams.get("timeMax")); return send(200, { items: list.filter((e) => { const t = Date.parse(e.start.dateTime || `${e.start.date}T00:00:00`); return t >= a && t < b; }) }); }
    if (req.method === "POST") { list.push({ id: `n${nextId++}`, ...JSON.parse(raw) }); return send(200, list[list.length - 1]); }
    const i = list.findIndex((e) => e.id === m[2]);
    if (i < 0) return send(404, { error: { message: "gone" } });
    if (req.method === "PATCH") { Object.assign(list[i], JSON.parse(raw)); return send(200, list[i]); }
    if (req.method === "DELETE") { list.splice(i, 1); return send(204); }
  });
});
fake.listen(PORT, "127.0.0.1"); fake.unref();   // (never keep the test run alive)

module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 40) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const pills = () => page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event-title")].map((e) => e.textContent));
  const fill = (vals) => page.evaluate((v) => { for (const [id, val] of Object.entries(v)) { const el = document.getElementById(id); el.value = val; el.dispatchEvent(new Event("change")); } }, vals);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  await until(async () => (await pills()).includes("Work offsite") && (await pills()).includes("Soccer match"));
  ok("Google events show on the week (an editable and a view-only calendar)", (await pills()).includes("Work offsite") && (await pills()).includes("Soccer match"), await pills());

  // add to Google through the event editor
  await h.tap(".hd-add"); await h.sleep(400);
  const cals = await page.evaluate(() => [...(document.getElementById("event-calendar")?.options || [])].map((o) => o.value));
  ok("Add Event offers the Google calendar (not the view-only one)", cals.includes("Work") && !cals.includes("Club"), cals);
  await page.evaluate(() => { const s = document.getElementById("event-calendar"); s.value = "Work"; s.dispatchEvent(new Event("change")); });
  const t = day(3, 0);
  await fill({ "event-title": "Team lunch", "event-start-date": ymd(t), "event-start-time": "12:00", "event-end-date": ymd(t), "event-end-time": "13:00" });
  await page.evaluate(() => [...document.querySelectorAll(".event-btn-primary")].pop().click());
  await until(() => store.primary.some((e) => e.summary === "Team lunch"));
  await until(async () => (await pills()).includes("Team lunch"));
  const added = store.primary.find((e) => e.summary === "Team lunch");
  ok("added on Google (right time) and shown on the screen", added && new Date(added.start.dateTime).getHours() === 12 && (await pills()).includes("Team lunch"), added && added.start);

  // edit + delete
  await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].find((p) => p.textContent.includes("Work offsite")).click()); await h.sleep(400);
  await h.tap(".event-edit-btn"); await h.sleep(300);
  await fill({ "event-title": "Work offsite (moved)" });
  await page.evaluate(() => [...document.querySelectorAll(".event-btn-primary")].pop().click());
  await until(() => store.primary.some((e) => e.summary === "Work offsite (moved)"));
  ok("edited on Google", store.primary.some((e) => e.id === "g1" && e.summary === "Work offsite (moved)"));
  await until(async () => (await pills()).includes("Work offsite (moved)"));
  await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].find((p) => p.textContent.includes("Team lunch")).click()); await h.sleep(400);
  await h.tap(".event-delete-btn"); await h.sleep(300);
  await page.evaluate(() => document.querySelector(".event-btn-danger").click());
  await until(() => !store.primary.some((e) => e.summary === "Team lunch"));
  await until(async () => !(await pills()).includes("Team lunch"));
  ok("deleted on Google and gone from the screen", !store.primary.some((e) => e.summary === "Team lunch") && !(await pills()).includes("Team lunch"));
  await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].find((p) => p.textContent.includes("Soccer match")).click()); await h.sleep(400);
  ok("a view-only Google event has no Edit / Delete", await page.evaluate(() => !document.querySelector(".event-edit-btn") && !document.querySelector(".event-delete-btn")));
  await page.evaluate(() => document.querySelector(".event-close-btn")?.click());

  fake.close();
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => { s.calendar.sources.push({ name: "Work", type: "google", calendarId: "primary", color: "green", fetchMinutes: 5 }, { name: "Club", type: "google", calendarId: "club@group.calendar.google.com", readOnly: true, color: "orange" }); };
module.exports.patchSecrets = (s) => { s.google = { clientId: "9-x.apps.googleusercontent.com", clientSecret: "fake-secret-value", refreshToken: "fake-refresh-token" }; };
module.exports.env = { OPENSKY_GOOGLE_TOKEN_URL: `http://127.0.0.1:${PORT}/token`, OPENSKY_GOOGLE_API_URL: `http://127.0.0.1:${PORT}/cal` };
