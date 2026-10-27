// Color codes for calendars, keyword rules and lists (a user put "#8cbfc4" in "color" and got automatic colors —
// only palette names worked there). The fixture's Family calendar gets "#8CBFC4" (upper case), a rule "#e32a36",
// Groceries "#5f8f38"; checked on the Home week, the month view and the list columns.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, n = 40) => { for (let i = 0; i < n && !(await fn()); i++) await h.sleep(250); return fn(); };
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

  // Home: the Family calendar's events (Soccer practice, Mon/Wed) get #8cbfc4; "dinner" events the rule's #e32a36
  await until(() => page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].some((p) => /Soccer|dinner/i.test(p.textContent))));
  const pills = await page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].map((p) => ({ t: p.querySelector(".hd-event-title").textContent, bar: getComputedStyle(p).borderLeftColor, bg: getComputedStyle(p).backgroundColor })));
  const soccer = pills.find((p) => p.t === "Soccer practice"), dinner = pills.find((p) => p.t === "Family dinner");
  ok("Home: a calendar's color code (upper case) colors its events — the bar in that color on a pale background of it",
    soccer && soccer.bar === rgb("#8cbfc4") && soccer.bg !== soccer.bar && !/rgba?\(0, 0, 0/.test(soccer.bg), soccer);
  ok("Home: a keyword rule with a color code wins over the calendar's color", dinner && dinner.bar === rgb("#e32a36"), dinner);

  // the list column
  const list = await page.evaluate(() => { const c = [...document.querySelectorAll(".hd-lists .lc-list")].find((x) => x.querySelector(".lc-list-title").textContent === "Groceries"); return c ? getComputedStyle(c).getPropertyValue("--list-accent").trim() : null; });
  ok("a list's color code colors its column", list === "#5f8f38", list);

  // the month view (CalendarExt3)
  await h.tap(".os-page-calendar"); await h.sleep(2500);
  const month = await page.evaluate(() => { const e = [...document.querySelectorAll(".CX3 .event")].find((x) => /Soccer practice/.test(x.textContent)); if (!e) return null; const cs = getComputedStyle(e); return { cls: e.className, bar: cs.getPropertyValue("--evc-bar").trim(), cal: cs.getPropertyValue("--calendarColor").trim() }; });
  ok("month view: the event has the code's color (evc-custom + CX3's --calendarColor)", month && /evc-custom/.test(month.cls) && month.cal === "#8cbfc4", month);
  await h.shot("color-codes-month");

  // the shared rule: codes in any case or short form; anything else isn't a color
  const r = await page.evaluate(() => { const C = window.OpenSkyEventColors; return [C.colorOf("#8CBFC4"), C.colorOf("#8cf"), C.colorOf("teal"), C.colorOf("**#8cbfc4"), C.colorOf("8cbfc4"), C.colorOf("#12zz45")]; });
  ok("color codes: #RRGGBB / #rgb any case; names; anything else (markdown stars, no #, not hex) isn't a color", JSON.stringify(r) === '["#8cbfc4","#88ccff","teal",null,null,null]', r);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => {
  const fam = s.calendar.sources.find((c) => c.name === "Family"); fam.color = "#8CBFC4";
  s.calendar.colors = { calendars: {}, rules: [{ match: "dentist", color: "indigo" }, { match: "dinner", color: "#e32a36" }] };
  s.lists.lists = s.lists.lists.map((l) => (l.name === "Groceries" ? { ...l, color: "#5f8f38" } : l));
};
