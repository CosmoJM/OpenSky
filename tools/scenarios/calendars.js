// Calendar sources: a public ICS link from settings + a private webcal link from secrets.json, recurring events,
// colors by source and keyword rule, delivered to the Home page as CALENDAR_EVENTS.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  for (let i = 0; i < 30 && (await page.evaluate(() => document.querySelectorAll(".hd-week .hd-event").length)) < 3; i++) await h.sleep(1000);
  const pills = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-day:not(.hd-nextweek)")].flatMap((t) => [...t.querySelectorAll(".hd-event")].map((p) => ({
    day: t.querySelector(".hd-day-name").textContent, title: p.querySelector(".hd-event-title").textContent, time: p.querySelector(".hd-event-time").textContent, bar: getComputedStyle(p).borderLeftColor }))));
  const titles = [...new Set(pills.map((p) => p.title))];
  ok("events from both sources this week", ["Soccer practice", "Family dinner", "Dentist", "School assembly"].every((t) => titles.includes(t)), titles);
  const one = (t) => pills.find((p) => p.title === t) || {};
  ok("recurring weekly event on the right weekdays (Mon + Wed)", pills.filter((p) => p.title === "Soccer practice").every((p) => /Mon|Wed/.test(p.day)) && pills.filter((p) => p.title === "Soccer practice").length >= 1, pills.filter((p) => p.title === "Soccer practice").map((p) => p.day));
  ok("time zone respected (5 PM – 6:30 PM)", one("Soccer practice").time === "5 PM – 6:30 PM", one("Soccer practice").time);
  ok("all-day event", one("Family dinner").time === "All day");
  ok("source color: Family → pink", one("Family dinner").bar === "rgb(221, 79, 152)", one("Family dinner").bar);
  ok("private source (link from secrets.json) → teal", one("School assembly").bar === "rgb(17, 153, 142)", one("School assembly").bar);
  ok("keyword rule beats the source color: Dentist → indigo", one("Dentist").bar === "rgb(74, 91, 216)", one("Dentist").bar);
  const cfg = await page.evaluate(async () => (await fetch("/config")).text());
  ok("the private link is not in the config served to the network", !/school\.ics/.test(cfg) && /family\.ics/.test(cfg));
  await h.shot("calendars-home");
  // a pickup calendar never shows as events; it goes to the Home page as OPENSKY_PICKUP_EVENTS
  const pk = await page.evaluate(() => {
    const m = MM.getModules().withClass("MMM-OpenSky-Calendars")[0];
    const sent = []; const orig = m.sendNotification.bind(m);
    m.sendNotification = (n, p) => { sent.push([n, p]); };
    m.config.sources.push({ name: "Pickup", type: "link", role: "pickup" });
    m.events.set("Pickup", [{ title: "Trash", startDate: String(Date.now() + 86400000), endDate: String(Date.now() + 2 * 86400000), fullDayEvent: true }]);
    m.broadcast();
    m.sendNotification = orig; m.config.sources.pop(); m.events.delete("Pickup"); m.broadcast();
    const ev = sent.find(([n]) => n === "CALENDAR_EVENTS")[1], pe = (sent.find(([n]) => n === "OPENSKY_PICKUP_EVENTS") || [])[1];
    return { inEvents: ev.some((e) => e.calendarName === "Pickup"), pickup: pe && pe.map((e) => e.title) };
  });
  ok("a pickup calendar is kept out of the events and sent for the icons", !pk.inEvents && pk.pickup && pk.pickup[0] === "Trash", pk);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
