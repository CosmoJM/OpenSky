// Profiles: circles with initials in the top bar (Mom pink, Kid teal); tapping one filters the calendars and lists
// to that person's. One person at a time: tapping another switches to them, tapping the picked one again shows everyone.
// Fixture: Family → Mom+Kid, School → Kid, Testers → Mom; Groceries → Mom+Kid, Chores → Kid.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  for (let i = 0; i < 30 && (await page.evaluate(() => document.querySelectorAll(".hd-week .hd-event").length)) < 3; i++) await h.sleep(1000);
  // what the calendar and list modules broadcast, as the month view and Home receive it
  await page.evaluate(() => {
    window.__sent = {};
    const probe = MM.getModules().withClass("MMM-OpenSky-Timer")[0], orig = probe.notificationReceived.bind(probe);
    probe.notificationReceived = (n, p, s) => {
      if (n === "CALENDAR_EVENTS") window.__sent.cal = [...new Set(p.map((e) => e.calendarName))].sort();
      if (n === "OPENSKY_LISTS") window.__sent.lists = p.lists.map((l) => l.id).sort();
      return orig(n, p, s);
    };
    MM.getModules().withClass("MMM-OpenSky-Calendars")[0].broadcast();
    MM.getModules().withClass("MMM-OpenSky-Lists")[0].broadcast();
  });
  const circles = () => page.evaluate(() => [...document.querySelectorAll(".hb-profile")].map((b) => ({ t: b.textContent, on: b.classList.contains("hb-profile-on"), bg: getComputedStyle(b).backgroundColor, w: b.offsetWidth })));
  const sent = () => page.evaluate(() => window.__sent);
  const tap = async (name) => { await page.click(`.hb-profile[aria-label="${name}"]`); await h.sleep(600); };
  const c0 = await circles();
  ok("one circle per profile, with its initial and color", c0.length === 2 && c0[0].t === "M" && c0[1].t === "K" && c0[0].bg !== c0[1].bg && c0.every((c) => !c.on && c.w === 44), c0);
  const all = await sent();
  ok("nobody picked → every calendar and list", all.cal.includes("School") && all.cal.includes("Family") && all.lists.length === 2, all);
  await h.shot("profiles-all");
  await tap("Kid");
  let s = await sent();
  ok("Kid → Family + School", s.cal.includes("School") && s.cal.includes("Family"), s.cal);
  ok("Kid → Groceries and Chores", JSON.stringify(s.lists) === '["Chores","Groceries"]', s.lists);
  await h.shot("profiles-kid");
  await tap("Mom");   // Kid is on; tapping Mom switches (Kid goes off)
  s = await sent();
  ok("Mom → Family, not Kid-only School; lists: Groceries only", !s.cal.includes("School") && s.cal.includes("Family") && JSON.stringify(s.lists) === '["Groceries"]', s);
  ok("only the tapped circle is on (Mom), Kid is off", (await circles()).map((c) => c.on).join() === "true,false");
  await tap("Mom");   // the picked person again
  s = await sent();
  ok("tapping the picked person again → everyone is back on, no circle marked", s.cal.includes("School") && s.cal.includes("Family") && s.lists.length === 2 && (await circles()).every((c) => !c.on), s);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
