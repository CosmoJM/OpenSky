// Calendar sources: a public ICS link from settings + a private webcal link from secrets.json, recurring events,
// colours by source and keyword rule, delivered to the Home page as CALENDAR_EVENTS.
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
  ok("source colour: Family → pink", one("Family dinner").bar === "rgb(221, 79, 152)", one("Family dinner").bar);
  ok("private source (link from secrets.json) → teal", one("School assembly").bar === "rgb(17, 153, 142)", one("School assembly").bar);
  ok("keyword rule beats the source colour: Dentist → indigo", one("Dentist").bar === "rgb(74, 91, 216)", one("Dentist").bar);
  const cfg = await page.evaluate(async () => (await fetch("/config")).text());
  ok("the private link is not in the config served to the network", !/school\.ics/.test(cfg) && /family\.ics/.test(cfg));
  await h.shot("calendars-home");
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
