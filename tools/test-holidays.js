// Unit test for lib/holidays.js against a fake Nager.Date: country holidays as all-day events, regions, the offline
// copy, and friendly errors.
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-hol-"));
process.env.OPENSKY_CALENDAR_CACHE = tmp;
let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
let up = true;
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/api\/v3\/PublicHolidays\/(\d{4})\/([A-Z]{2})$/);
  if (!up) { res.writeHead(503); return res.end(); }
  if (!m || m[2] === "ZZ") { res.writeHead(404); return res.end(); }
  const y = m[1];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify([
    { date: `${y}-01-01`, localName: "New Year's Day", name: "New Year's Day", global: true, counties: null },
    { date: `${y}-01-02`, localName: "2 January", name: "2 January", global: false, counties: ["GB-SCT"] },
    { date: `${y}-12-25`, localName: "Christmas Day", name: "Christmas Day", global: true, counties: null }
  ]));
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENSKY_HOLIDAYS_URL = `http://127.0.0.1:${server.address().port}/api/v3`;
  const { events } = require(path.join(__dirname, "..", "lib", "holidays.js"));
  const y = new Date().getFullYear();
  let ev = await events("gb");
  const nyd = ev.find((e) => e.title === "New Year's Day" && new Date(Number(e.startDate)).getFullYear() === y);
  ok("1 this year + next, country-wide only; all-day local dates", ev.length === 4 && !ev.some((e) => e.title === "2 January") && nyd && nyd.fullDayEvent && new Date(Number(nyd.startDate)).getHours() === 0 && Number(nyd.endDate) - Number(nyd.startDate) >= 23 * 3600e3, ev.map((e) => e.title));
  ev = await events("GB", "gb-sct");
  ok("2 with a region: its own holidays too", ev.length === 6 && ev.some((e) => e.title === "2 January"));
  ok("3 an unknown country → says to use a two-letter code", /two-letter code/.test(await fails(() => events("ZZ"))));
  ok("4 not a country code at all → explained", /two-letter country code/.test(await fails(() => events("Britain"))));
  up = false;
  ev = await events("GB");
  ok("5 offline → the last good copy", ev.length === 4);
  ok("6 offline with no copy → a clear error", /Couldn't load FR holidays/.test(await fails(() => events("FR"))));
  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
})().catch((e) => { console.log(`SUMMARY pass=${passed} fail=${failed + 1} (crashed: ${e.message})`); process.exit(1); });
