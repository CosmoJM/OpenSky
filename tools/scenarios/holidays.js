// Another country's holidays (calendar.holidays = "GB", from a fake Nager.Date): they show on the week as their own
// calendar and drive the countdown pill.
const http = require("http");
const PORT = 8094;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const soon = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 2); })();
const fake = http.createServer((req, res) => {
  const m = req.url.match(/PublicHolidays\/(\d{4})\/GB$/);
  res.writeHead(m ? 200 : 404, { "Content-Type": "application/json" });
  res.end(m ? JSON.stringify(Number(m[1]) === soon.getFullYear() ? [{ date: ymd(soon), localName: "Test Bank Holiday", name: "Test Bank Holiday", global: true, counties: null }] : []) : "[]");
});
fake.listen(PORT, "127.0.0.1"); fake.unref();

module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 40) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const onWeek = () => page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event-title")].some((e) => e.textContent === "Test Bank Holiday"));
  await until(onWeek);
  ok("GB holidays show on the week (all day)", await onWeek());
  const cd = await page.evaluate(() => document.querySelector(".hb-countdown")?.textContent.replace(/\s+/g, " ").trim());
  ok("the countdown pill follows them", /Test Bank Holiday/.test(cd || "") && /2 days/.test(cd || ""), cd);
  ok("no US holiday calendar alongside", await page.evaluate(() => !MM.getModules().withClass("MMM-OpenSky-Calendars")[0].config.sources.some((s) => /calendar\.google\.com/.test(s.url || ""))));
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => { s.calendar.holidays = "GB"; s.header.occasions = []; s.header.birthdaysFromCalendar = false; };
module.exports.env = { OPENSKY_HOLIDAYS_URL: `http://127.0.0.1:${PORT}/api/v3` };
