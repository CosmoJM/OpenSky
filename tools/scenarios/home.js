// Home page: week tiles (events + colours + weather + pickup icons), lists from a provider, photos from a folder.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }, sel);
  ok("Home is the first page and visible", await vis(".hd-root"));
  ok("'Add Event' shows (the fixture has an on-device calendar)", await vis(".hd-add"));

  // events (any calendar source broadcasts CALENDAR_EVENTS; here we play one)
  await page.evaluate(() => {
    const t = new Date(); const at = (dd, hh, mm = 0) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + dd, hh, mm).getTime();
    const evs = [
      { title: "Dentist", startDate: at(0, 15), endDate: at(0, 16), calendarName: "Family" },
      { title: "Swim lesson", startDate: at(1, 17), endDate: at(1, 18, 30), calendarName: "Testers" },
      { title: "Family dinner", startDate: at(2, 0), endDate: at(3, 0), fullDayEvent: true, calendarName: "Family" }
    ];
    const home = MM.getModules().withClass("MMM-OpenSky-Home")[0];
    home.notificationReceived("CALENDAR_EVENTS", evs.map((e) => ({ ...e, startDate: String(e.startDate), endDate: String(e.endDate) })), { identifier: "test_calendar" });
  });
  await h.sleep(500);
  const pills = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].map((p) => ({ title: p.querySelector(".hd-event-title").textContent, time: p.querySelector(".hd-event-time").textContent, bar: getComputedStyle(p).borderLeftColor })));
  const by = (t) => pills.find((p) => p.title === t);
  ok("events on their days with times", by("Dentist") && /3 PM – 4 PM|3 – 4 PM/.test(by("Dentist").time) && by("Family dinner") && by("Family dinner").time === "All day", pills);
  ok("keyword colour rule (dentist → indigo)", by("Dentist") && by("Dentist").bar === "rgb(74, 91, 216)", by("Dentist") && by("Dentist").bar);
  ok("calendar colour (Testers → blue)", by("Swim lesson") && by("Swim lesson").bar === "rgb(46, 139, 214)", by("Swim lesson") && by("Swim lesson").bar);   // a title the fixture calendar doesn't have (its Soccer practice is pink)

  // weather on the tiles (from the header's shared forecast)
  for (let i = 0; i < 25 && !(await page.evaluate(() => document.querySelectorAll(".hd-day-wx span").length)); i++) await h.sleep(1000);
  const wx = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-day:not(.hd-nextweek) .hd-day-wx")].filter((w) => /°/.test(w.textContent)).length);
  ok("daily highs on the day tiles (shared weather)", wx >= 7, wx);

  // pickup icons (New Bedford preset, Monday route): trash on Mondays (Tuesday after a Monday holiday), leaf on yard-waste Tuesdays
  const pick = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-day:not(.hd-nextweek)")].map((t) => ({
    day: t.querySelector(".hd-day-name").textContent + " " + t.querySelector(".hd-day-num").textContent,
    trash: !!t.querySelector(".hd-pickup-trash"), yard: !!t.querySelector(".hd-pickup-yard") })));
  const expect = await page.evaluate(() => [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); const c = window.OpenSkyPickup.collectionsOn(d, MM.getModules().withClass("MMM-OpenSky-Home")[0].config.pickup); return { trash: c.trash, yard: c.yard }; }));
  ok("pickup icons match the schedule engine for all 7 days", pick.every((p, i) => p.trash === expect[i].trash && p.yard === expect[i].yard) && pick.some((p) => p.trash), pick.filter((p) => p.trash || p.yard));

  // a pickup calendar (calendar link with role "pickup") adds icons by keyword
  await page.evaluate(() => {
    const t = new Date(); const at = (dd) => String(new Date(t.getFullYear(), t.getMonth(), t.getDate() + dd).getTime());
    MM.getModules().withClass("MMM-OpenSky-Home")[0].notificationReceived("OPENSKY_PICKUP_EVENTS", [
      { title: "Recycling Collection", startDate: at(3), fullDayEvent: true }, { title: "Yard Waste", startDate: at(4), fullDayEvent: true }]);
  });
  await h.sleep(500);
  const pc = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-day:not(.hd-nextweek)")].map((t) => ({ rec: !!t.querySelector(".hd-pickup-recycle"), yard: !!t.querySelector(".hd-pickup-yard") })));
  ok("pickup calendar: 'Recycling' and 'Yard Waste' events become icons on their days", pc[3] && pc[3].rec && pc[4] && pc[4].yard, pc.slice(2, 6));
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Home")[0].notificationReceived("OPENSKY_PICKUP_EVENTS", []));

  // a calendar that keeps failing gets a small notice (after 2 minutes; 0 here), gone once it loads again
  const alertText = () => page.evaluate(() => { const a = document.querySelector(".hd-cal-alert"); return a && !a.hidden ? a.textContent : null; });
  await page.evaluate(() => { const hm = MM.getModules().withClass("MMM-OpenSky-Home")[0]; hm.config.calendarAlertAfter = 0; hm.notificationReceived("OPENSKY_CALENDAR_STATUS", { Family: "ok", Mom: "HTTP 404" }); });
  await h.sleep(200);
  const shown = await alertText();
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Home")[0].notificationReceived("OPENSKY_CALENDAR_STATUS", { Mom: "ok" }));
  await h.sleep(200);
  ok("a failing calendar shows 'Mom isn't loading' on Home; it goes once Mom loads", shown === "Mom isn't loading" && (await alertText()) === null, shown);

  // on-device lists (MMM-OpenSky-Lists, seeded by the harness) show on the lists card
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.querySelectorAll(".hd-lists .lc-list").length)); i++) await h.sleep(500);
  const own = await page.evaluate(() => [...document.querySelectorAll(".hd-lists .lc-list")].map((c) => ({ title: c.querySelector(".lc-list-title").textContent, badge: c.querySelector(".lc-badge").textContent, items: [...c.querySelectorAll(".lc-item-text")].map((x) => x.textContent), empty: c.querySelector(".lc-empty")?.textContent || "" })));
  ok("on-device lists from settings show (Groceries 2 items, Chores empty)", own.length === 2 && own[0].title === "Groceries" && own[0].badge === "2" && own[0].items.join() === "Milk,Apples" && /All done/.test(own[1].empty), own);

  // no lists at all → no lists card, photo takes the right column
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Home")[0].notificationReceived("OPENSKY_LISTS", { source: "opensky", lists: [] }));
  await h.sleep(300);
  const right = await page.evaluate(() => { const r = document.querySelector(".hd-right").getBoundingClientRect(), p = document.querySelector(".hd-photo").getBoundingClientRect(); return { listsHidden: document.querySelector(".hd-lists").hidden, photoShare: +(p.height / r.height).toFixed(2) }; });
  ok("no lists → photo card fills the right column", right.listsHidden && right.photoShare > 0.95, right);
  // photos from the folder
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.querySelectorAll(".hd-ph-layer.shown img").length)); i++) await h.sleep(1000);
  const ph = await page.evaluate(() => { const l = [...document.querySelectorAll(".hd-ph-layer.shown")].pop(); return l ? { imgs: [...l.querySelectorAll("img")].map((i) => i.naturalWidth > 0), caption: l.querySelector(".hd-ph-caption")?.textContent || "" } : null; });
  ok("a photo from the folder is showing", ph && ph.imgs.length >= 1 && ph.imgs.every(Boolean), ph);
  await h.shot("home-no-lists");

  // a list provider appears
  await page.evaluate(() => {
    window.__listEvents = [];
    const timer = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; const orig = timer.notificationReceived.bind(timer);
    timer.notificationReceived = (n, p, s) => { if (/^OPENSKY_LIST_/.test(n)) window.__listEvents.push([n, p && p.listId, p && p.item && p.item.text]); return orig(n, p, s); };
    MM.getModules().withClass("MMM-OpenSky-Home")[0].notificationReceived("OPENSKY_LISTS", { source: "test", lists: [
      { id: "g", title: "Groceries", color: "blue", items: [{ id: "1", text: "Milk" }, { id: "2", text: "Apples" }] },
      { id: "t", title: "To-Dos", items: [] } ] });
  });
  await h.sleep(500);
  const L = await page.evaluate(() => ({ hidden: document.querySelector(".hd-lists").hidden, cols: [...document.querySelectorAll(".hd-lists .lc-list")].map((c) => ({ title: c.querySelector(".lc-list-title").textContent, badge: c.querySelector(".lc-badge").textContent, empty: c.querySelector(".lc-empty")?.textContent || "" })) }));
  ok("lists card shows each list with counts", !L.hidden && L.cols.length === 2 && L.cols[0].badge === "2" && /All done/.test(L.cols[1].empty), L);
  await h.tap(".hd-lists .lc-check"); await h.tap(".hd-lists .lc-add-item"); await h.sleep(300);
  const le = await page.evaluate(() => window.__listEvents);
  ok("check-off and Add item go to the list provider", le.some((e) => e[0] === "OPENSKY_LIST_CHECK" && e[2] === "Milk") && le.some((e) => e[0] === "OPENSKY_LIST_ADD" && e[1] === "g"), le);
  await h.sleep(1500); await h.shot("home-with-lists");

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
