// Event editor: add / view / edit / delete on the on-device calendar, read-only linked calendars, validation, day list.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const modal = () => page.evaluate(() => { const m = document.querySelector(".calendar-editor-modal"); return m ? { title: m.querySelector("h2")?.textContent, edit: !!m.querySelector(".event-edit-btn"), del: !!m.querySelector(".event-delete-btn"), text: m.textContent.replace(/\s+/g, " ").trim().slice(0, 200) } : null; });
  const toast = () => page.evaluate(() => { const t = document.querySelector(".os-toast.show"); return t ? t.textContent : null; });
  const fill = (vals) => page.evaluate((v) => { for (const [id, val] of Object.entries(v)) { const el = document.getElementById(id); if (el.type === "checkbox") { el.checked = val; el.onchange && el.onchange(); } else el.value = val; } }, vals);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const pillOnToday = (t) => page.evaluate((t) => [...document.querySelectorAll(".hd-day.hd-is-today .hd-event-title")].some((e) => e.textContent === t), t);
  const today = new Date();
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.querySelectorAll(".hd-week .hd-event").length)); i++) await h.sleep(1000);

  ok("'Add Event' shows when a calendar can be changed", !!(await h.box(".hd-add")));
  await h.tap(".hd-add"); await h.sleep(400);
  let m = await modal();
  ok("Add Event opens the form (one editable calendar → no calendar picker)", m && m.title === "New Event" && !(await page.evaluate(() => document.getElementById("event-calendar"))), m && m.title);
  // validation
  await fill({ "event-title": "" }); await page.evaluate(() => [...document.querySelectorAll(".event-btn-primary")].pop().click()); await h.sleep(300);
  ok("empty title → friendly error", /add a title/i.test((await toast()) || ""), await toast());
  // add
  await fill({ "event-title": "Piano lesson", "event-start-date": ymd(today), "event-start-time": "23:00", "event-end-date": ymd(today), "event-end-time": "23:45" });
  await page.evaluate(() => [...document.querySelectorAll(".event-btn-primary")].pop().click());
  for (let i = 0; i < 10 && !(await pillOnToday("Piano lesson")); i++) await h.sleep(300);
  ok("added: success toast + shows on today's tile at once", (await modal()) === null && /added/i.test((await toast()) || "") && await pillOnToday("Piano lesson"), await toast());
  const saved = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "out", "local-calendar.test.json"), "utf8"));
  ok("saved on the Pi (local-calendar file)", saved.events.some((e) => e.title === "Piano lesson" && e.calendar === "Testers"), saved.events.map((e) => e.title));
  // view + edit
  await page.evaluate(() => [...document.querySelectorAll(".hd-day.hd-is-today .hd-event")].find((p) => p.textContent.includes("Piano lesson")).click()); await h.sleep(300);
  m = await modal();
  ok("own event: details with Edit + Delete, calendar name shown", m && m.title === "Piano lesson" && m.edit && m.del && /Testers/.test(m.text), m);
  await h.tap(".event-edit-btn"); await h.sleep(300);
  await fill({ "event-title": "Piano lesson (moved)" });
  await page.evaluate(() => [...document.querySelectorAll(".event-btn-primary")].pop().click());
  for (let i = 0; i < 10 && !(await pillOnToday("Piano lesson (moved)")); i++) await h.sleep(300);
  ok("edit saved and shown", await pillOnToday("Piano lesson (moved)") && !(await pillOnToday("Piano lesson")));
  // delete
  await page.evaluate(() => [...document.querySelectorAll(".hd-day.hd-is-today .hd-event")].find((p) => p.textContent.includes("moved")).click()); await h.sleep(300);
  await h.tap(".event-delete-btn"); await h.sleep(300);
  m = await modal();
  ok("delete asks first, naming the calendar", m && /removed from the Testers calendar\./.test(m.text), m && m.text);
  await page.evaluate(() => document.querySelector(".event-btn-danger").click());
  for (let i = 0; i < 10 && (await pillOnToday("Piano lesson (moved)")); i++) await h.sleep(300);
  ok("deleted", !(await pillOnToday("Piano lesson (moved)")) && /deleted/i.test((await toast()) || ""));
  // read-only linked calendar
  await page.evaluate(() => { const p = [...document.querySelectorAll(".hd-week .hd-event")].find((e) => /Soccer|Dentist|Family dinner|School/.test(e.textContent)); p.click(); }); await h.sleep(300);
  m = await modal();
  ok("linked calendar event: read-only (no Edit/Delete)", m && !m.edit && !m.del, m && m.title);
  await page.evaluate(() => document.querySelector(".event-close-btn").click()); await h.sleep(200);
  // day list on the Calendar page
  await h.tap(".os-page-calendar"); await h.sleep(1500);
  const cell = await page.evaluate(() => { const c = document.querySelector(".CX3 .cell.today"); const b = c.getBoundingClientRect(); return { x: b.x + 12, y: b.y + 20 }; });
  await page.mouse.click(cell.x, cell.y); await h.sleep(400);
  m = await modal();
  ok("tap a day → that day's list with + Add Event", m && /\+ Add Event/.test(m.text), m && m.title);
  await h.shot("event-editor-day");
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_IDLE_RESET")); await h.sleep(300);
  ok("idle reset closes the popup", (await modal()) === null);
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
