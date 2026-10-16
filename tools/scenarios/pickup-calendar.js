// Pickup icons from a city's calendar link (a real .ics through MagicMirror's fetcher): Tuesday garbage, Thursday
// recycling, Friday yard waste — and the pickup events don't show as calendar events.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 60) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const icons = () => page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-day:not(.hd-nextweek)")].map((t) => ({
    dow: t.querySelector(".hd-day-name").textContent.slice(0, 3), trash: !!t.querySelector(".hd-pickup-trash"), rec: !!t.querySelector(".hd-pickup-recycle"), yard: !!t.querySelector(".hd-pickup-yard") })));
  await until(async () => (await icons()).some((d) => d.rec));
  const ic = await icons();
  const on = (dow) => ic.find((d) => d.dow === dow) || {};
  ok("Tue garbage, Thu recycling, Fri yard waste — from the calendar", on("Tue").trash && on("Thu").rec && on("Fri").yard && !on("Wed").trash && !on("Mon").trash, ic);
  const titles = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event-title")].map((e) => e.textContent));
  ok("pickup events don't show as events", !titles.some((t) => /Garbage|Recycling|Yard Waste/.test(t)), titles);
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => { s.pickup = { url: "http://localhost:8083/modules/opensky-fixtures/pickup.ics" }; };
