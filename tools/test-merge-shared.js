// calendar.mergeShared: one event on several calendars (kids invited to it) is shown once, named for the kids.
// Runs the calendars module's mergeShared() on events shaped like the real ones from Google (RAJRD Practice on
// Family + Quinn + Reese, the kids invited; Google writes the same moment with different time-zone spellings).
let results = 0, failed = 0;
const ok = (name, cond, info) => { results++; if (!cond) failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  — " + JSON.stringify(info) : ""}`); };
let mod = null;
global.Module = { register: (n, o) => { mod = o; } };
global.window = {};
require("../modules/MMM-OpenSky-Calendars/MMM-OpenSky-Calendars.js");
const sources = [{ name: "Family", role: "shared", type: "google" }, { name: "Hari", type: "google" }, { name: "Quinn", type: "google" }, { name: "Reese", type: "google" }, { name: "Holidays", type: "holidays" }];
const run = (list) => mod.mergeShared.call({ config: { sources } }, list);
const t = Date.parse("2026-11-04T18:30:00-05:00"), t2 = Date.parse("2026-11-04T23:30:00Z");
const ev = (calendarName, o = {}) => ({ title: "RAJRD Practice", startDate: String(t), endDate: String(t + 5400e3), fullDayEvent: false, calendarName, color: { Family: "#2e8bd6", Hari: "#78b014", Quinn: "#e04848", Reese: "#cfa000" }[calendarName], colorName: calendarName, uid: "u1", organizerSelf: false, response: "needsAction", ...o });

let r = run([ev("Family", { organizerSelf: true }), ev("Quinn", { startDate: String(t2) }), ev("Reese")]);
ok("same event ID + same moment on three calendars → one event", r.length === 1, r.length);
ok("named for the kids, not the shared calendar", JSON.stringify(r[0].calendarNames) === '["Quinn","Reese"]', r[0].calendarNames);
ok("a color per kid (for the striped bar)", JSON.stringify(r[0].colors) === '["#e04848","#cfa000"]', r[0].colors);
ok("the editor's calendar is the organizer's (Family) copy", r[0].calendarName === "Family");

r = run([ev("Family", { organizerSelf: true }), ev("Quinn")]);
ok("one kid + the shared calendar → that kid's color, no stripe", r.length === 1 && r[0].colors.length === 1 && r[0].color === "#e04848" && r[0].colorName === "Quinn", r[0]);
r = run([ev("Family", { organizerSelf: true })]);
ok("only on the shared calendar → untouched, its own color", r.length === 1 && r[0].calendarName === "Family" && !r[0].calendarNames, r[0]);
r = run([ev("Quinn", { organizerSelf: true, uid: "u2" }), ev("Reese", { uid: "u2" })]);
ok("Quinn invites Reese (no shared calendar involved) → one event for both", r.length === 1 && r[0].calendarName === "Quinn" && r[0].calendarNames.join() === "Quinn,Reese", r);
r = run([ev("Family", { organizerSelf: true }), ev("Quinn", { response: "declined" }), ev("Reese")]);
ok("a copy that was declined is left out", r.length === 1 && r[0].calendarNames.join() === "Reese", r[0].calendarNames);
r = run([ev("Family", { uid: "a" }), ev("Quinn", { uid: "b" })]);
ok("different event IDs at the same time stay two events", r.length === 2, r.length);
r = run([ev("Family", { uid: "u1", startDate: String(t + 7 * 864e5) }), ev("Quinn", { uid: "u1" })]);
ok("the same repeating event on another date isn't merged", r.length === 2, r.length);
r = run([ev("Quinn", { uid: null }), ev("Reese", { uid: null }), ev("Hari", { uid: null, title: "Other thing" })]);
ok("no event ID (links, hand-entered): same title + start + end merges, a different title doesn't", r.length === 2 && r.find((e) => e.calendarNames).calendarNames.join() === "Quinn,Reese", r.map((e) => e.title));
r = run([ev("Quinn"), ev("Quinn")]);
ok("two events on the same calendar are never merged", r.length === 2, r.length);
r = run([ev("Holidays", { title: "Easter", uid: "h" }), ev("Quinn", { title: "Easter", uid: "h" })]);
ok("holidays are left alone", r.length === 2, r.length);
console.log(`SUMMARY pass=${results - failed} fail=${failed}`);
process.exit(failed ? 1 : 0);
