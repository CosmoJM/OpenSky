// Unit test for lib/client/pickup.js using the New Bedford, MA preset: reproduces the city's official fall 2026
// yard-waste flyer (every green day, all five routes) and checks holiday shifts. Run: node tools/test-pickup.js
const P = require("../lib/client/pickup.js");
const preset = require("../lib/pickup-presets/new-bedford-ma.json");
const C = { collectionsOn: (d, route) => P.collectionsOn(d, { ...preset, trashDay: route }), holidayOn: (d) => P.holidayOn(d, preset.holidays) };
let pass = 0, fail = 0; const ok = (k, v, info = "") => { v ? pass++ : fail++; console.log(`${v ? "PASS" : "FAIL"}  ${k} ${info}`); };
const d = (s) => new Date(s + "T12:00");
const ymd = (x) => x.toISOString().slice(0, 10);
// 1. Flyer (2026-New-Yard-Waste-Schedule.v2.pdf): union of yard-waste days over all routes, Sept–Dec 2026
const FLYER = { 9: [1,2,3,4,14,15,16,17,18], 10: [5,6,7,8,9,19,20,21,22,23], 11: [2,3,4,5,6,9,10,12,13,14,16,17,18,19,20,23,24,25,27,28], 12: [7,8,9,10,11] };
const flyer = new Set(Object.entries(FLYER).flatMap(([m, days]) => days.map((x) => `2026-${String(m).padStart(2, "0")}-${String(x).padStart(2, "0")}`)));
const mine = new Set();
for (let t = d("2026-09-01"); t <= d("2026-12-31"); t.setDate(t.getDate() + 1)) for (let r = 1; r <= 5; r++) if (C.collectionsOn(t, r).yard) mine.add(ymd(t));
const missing = [...flyer].filter((x) => !mine.has(x)), extra = [...mine].filter((x) => !flyer.has(x));
ok("1 yard-waste days = every green day on the city flyer (all 5 routes, Sept–Dec 2026)", !missing.length && !extra.length, JSON.stringify({ missing, extra }));
// 2. Holidays that the flyer marks (pink)
for (const [k, name] of [["2026-09-07", "Labor Day"], ["2026-10-12", "Columbus Day"], ["2026-11-11", "Veterans Day"], ["2026-11-26", "Thanksgiving"]])
  ok(`2 holiday ${k} = ${name}`, C.holidayOn(d(k)) === name, C.holidayOn(d(k)));
// 3. a Monday route
const J = (k) => C.collectionsOn(d(k), 1);
// generic options
const bi = (k) => P.collectionsOn(d(k), { trashDay: 3, recycling: { every: 2, firstDate: "2026-10-05" } });
// (the Oct 12 week has Columbus Day on Monday, so this Wednesday route runs on Thursday Oct 15 that week)
ok("6 every-other-week recycling: on Oct 7, off Thu Oct 15 (holiday-shifted trash), on Oct 21", bi("2026-10-07").recycling && bi("2026-10-15").trash && !bi("2026-10-15").recycling && bi("2026-10-21").recycling);
ok("7 holidayRule none: Columbus Day Monday keeps trash", P.collectionsOn(d("2026-10-12"), { trashDay: 1, holidayRule: "none" }).trash);
ok("8 same-day yard waste", P.collectionsOn(d("2026-10-20"), { trashDay: 2, yardWaste: { when: "same-day", weeks: ["2026-10-19"] } }).yard);
ok("3a today Mon Oct 12 (Columbus Day): no trash", !J("2026-10-12").trash);
ok("3b trash moved to Tue Oct 13", J("2026-10-13").trash && J("2026-10-13").moved === "Columbus Day");
ok("3c no yard waste the week of Oct 12", ![12,13,14,15,16].some((x) => J(`2026-10-${x}`).yard));
ok("3d normal Monday Oct 19: trash", J("2026-10-19").trash && !J("2026-10-19").moved);
ok("3e yard waste Tue Oct 20", J("2026-10-20").yard && !J("2026-10-21").yard);
ok("3f Veterans Day week: trash Mon Nov 9, leaves Tue Nov 10", J("2026-11-09").trash && J("2026-11-10").yard);
ok("3g Thanksgiving week: trash Mon Nov 23, leaves Tue Nov 24", J("2026-11-23").trash && J("2026-11-24").yard);
ok("3h Nov 30 week: trash, no leaves", J("2026-11-30").trash && !J("2026-12-01").yard);
ok("3i final leaves Tue Dec 8, none after", J("2026-12-08").yard && !J("2026-12-15").yard && !J("2026-12-22").yard);
ok("3j Christmas (Fri Dec 25) doesn't move Monday trash: Mon Dec 21 + Mon Dec 28", J("2026-12-21").trash && J("2026-12-28").trash);
ok("3k New Year's 2027 (Fri) doesn't move Monday Jan 4", J("2027-01-04").trash);
ok("3l MLK Day 2027 (Jan 18): trash Tue Jan 19", !J("2027-01-18").trash && J("2027-01-19").trash);
ok("3m Patriots' Day 2027 (Apr 19): trash Tue, leaves Wed (expected 2027)", J("2027-04-20").trash && J("2027-04-21").yard && J("2027-04-21").expected);
ok("3n July 4 2027 is a Sunday → observed Mon Jul 5: trash Tue Jul 6", !J("2027-07-05").trash && J("2027-07-06").trash);
ok("3o summer 2026 weekly: leaves Tue Jun 16, 2026", J("2026-06-16").yard);
ok("3p 2025 checks: Christmas Thu 2025 doesn't move Mon Dec 22; Mon Dec 29 trash", J("2025-12-22").trash && J("2025-12-29").trash);
// 4. Christmas 2025 notice: Thursday + Friday routes delayed one day, Mon–Wed not
ok("4 Christmas 2025 (Thu): Thu route → Fri, Fri route → Sat, Wed route unchanged", C.collectionsOn(d("2025-12-26"), 4).trash && C.collectionsOn(d("2025-12-27"), 5).trash && C.collectionsOn(d("2025-12-24"), 3).trash);
// 5. every week has exactly one trash day for each route (no gaps, no doubles), 2026–2027
let bad = 0;
for (let wk = d("2026-01-05"); wk <= d("2027-12-27"); wk.setDate(wk.getDate() + 7)) for (let r = 1; r <= 5; r++) { let n = 0; for (let i = 0; i < 7; i++) { const x = new Date(wk); x.setDate(x.getDate() + i); if (C.collectionsOn(x, r).trash) n++; } if (n !== 1) bad++; }
ok("5 exactly one trash day per week per route (2026–2027)", bad === 0, `bad weeks: ${bad}`);
console.log(`SUMMARY pass=${pass} fail=${fail}`);
