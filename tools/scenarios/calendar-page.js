// Calendar page: month view with this month's events (from the calendar sources), palette colours, toolbar
// navigation, taps on events/days, idle reset back to this month.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  await h.tap(".os-page-calendar"); await h.sleep(1500);
  for (let i = 0; i < 30 && !(await page.evaluate(() => document.querySelectorAll(".CX3 .event").length)); i++) await h.sleep(1000);
  const title = () => page.evaluate(() => document.querySelector(".CX3 .headerTitle")?.textContent.trim());
  const now = new Date(), month = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  ok("month view shows this month", (await title()) === month, await title());
  const evs = await page.evaluate(() => [...document.querySelectorAll(".CX3 .event")].map((e) => ({ t: e.dataset.title, cls: [...e.classList].find((c) => c.startsWith("evc-")), bar: getComputedStyle(e).borderLeftColor })));
  const has = (t) => evs.filter((e) => e.t === t);
  ok("recurring events fill the month", has("Soccer practice").length >= 6 && has("School assembly").length >= 3, { soccer: has("Soccer practice").length, assembly: has("School assembly").length });
  ok("palette colours: Family pink, School teal, Dentist indigo", has("Family dinner")[0]?.cls === "evc-pink" && has("School assembly")[0]?.cls === "evc-teal" && has("Dentist")[0]?.cls === "evc-indigo", [has("Family dinner")[0]?.cls, has("School assembly")[0]?.cls, has("Dentist")[0]?.cls]);
  ok("colour is drawn (indigo bar)", has("Dentist")[0]?.bar === "rgb(74, 91, 216)", has("Dentist")[0]?.bar);
  ok("today is highlighted", await page.evaluate(() => !!document.querySelector(".CX3 .cell.today")));
  ok("no Add Event without an editor", await page.evaluate(() => !document.querySelector(".os-nav-add")));
  await h.shot("calendar-month");
  // toolbar
  await h.tap(".os-nav-next"); await h.sleep(1500);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  ok("› goes to next month (and it isn't greyed)", (await title()) === next && await page.evaluate(() => document.querySelectorAll(".CX3 .cell.focusMonth").length >= 28), await title());
  await h.tap(".os-nav-today"); await h.sleep(1500);
  ok("Today comes back", (await title()) === month);
  // taps
  await page.evaluate(() => {
    window.__cal = [];
    const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; const o = t.notificationReceived.bind(t);
    t.notificationReceived = (n, p, s) => { if (/^CALENDAR_(EVENT|DAY)_CLICKED$/.test(n)) window.__cal.push([n, p.title || (p.events || []).length]); return o(n, p, s); };
  });
  await h.tap('.CX3 .event[data-title="Family dinner"]'); await h.sleep(300);
  const cell = await page.evaluate(() => { const c = [...document.querySelectorAll(".CX3 .cell.focusMonth")].find((x) => { const b = x.getBoundingClientRect(); return b.height > 0; }); const b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + 20 }; });
  await page.mouse.click(cell.x, cell.y); await h.sleep(300);
  const got = await page.evaluate(() => window.__cal);
  ok("tap event → CALENDAR_EVENT_CLICKED; tap day → CALENDAR_DAY_CLICKED", got.some((g) => g[0] === "CALENDAR_EVENT_CLICKED" && g[1] === "Family dinner") && got.some((g) => g[0] === "CALENDAR_DAY_CLICKED"), got);
  // idle reset
  await h.tap(".os-nav-next"); await h.sleep(800);
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_IDLE_RESET")); await h.sleep(1200);
  ok("idle reset → back to this month", (await title()) === month);
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
