/* OpenSky curbside pickup schedule (trash, recycling, yard waste) — works in the browser (window.OpenSkyPickup)
 * and in Node (require) for tests.
 *
 * A schedule (built by config.js from opensky.json "pickup" + an optional city preset in lib/pickup-presets/):
 * {
 *   trashDay: 1,                          // 1 = Monday … 5 = Friday
 *   recycling: { every: 1 }               // weekly with trash; or { every: 2, firstDate: "2026-01-05" } = every other week
 *   holidayRule: "shift-after",           // a weekday holiday pushes that day's and later routes one day later
 *                                         // ("none" = holidays change nothing)
 *   holidays: ["newyear", …],             // which holidays count (ids below); default = all US federal ones
 *   yardWaste: {                          // optional
 *     when: "day-after-trash",            // or "same-day"
 *     weekly: [{ from, to, expected? }],  // date ranges with collection every week
 *     weeks: ["2026-10-05", …]            // or individual weeks (the MONDAY of each week)
 *   }
 * }
 * collectionsOn(date, schedule) → { trash, recycling, yard, expected, moved: "Holiday name" | null }
 */
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mk = (y, m, d) => new Date(y, m - 1, d);
  const nthWeekday = (y, m, wd, n) => { const d = mk(y, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + (n - 1) * 7); return d; };
  const lastWeekday = (y, m, wd) => { const d = mk(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return d; };
  // Weekend holidays are observed on the Friday before (Saturday) or the Monday after (Sunday)
  const observed = (d) => { const o = new Date(d); if (o.getDay() === 6) o.setDate(o.getDate() - 1); else if (o.getDay() === 0) o.setDate(o.getDate() + 1); return o; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = (d) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };

  // Known holidays (id → name, date for a year). Massachusetts' Patriots' Day included for MA presets.
  const HOLIDAYS = {
    newyear: ["New Year's Day", (y) => observed(mk(y, 1, 1))],
    mlk: ["Martin Luther King Jr. Day", (y) => nthWeekday(y, 1, 1, 3)],
    presidents: ["Presidents' Day", (y) => nthWeekday(y, 2, 1, 3)],
    patriots: ["Patriots' Day", (y) => nthWeekday(y, 4, 1, 3)],
    memorial: ["Memorial Day", (y) => lastWeekday(y, 5, 1)],
    juneteenth: ["Juneteenth", (y) => observed(mk(y, 6, 19))],
    independence: ["Independence Day", (y) => observed(mk(y, 7, 4))],
    labor: ["Labor Day", (y) => nthWeekday(y, 9, 1, 1)],
    columbus: ["Columbus Day", (y) => nthWeekday(y, 10, 1, 2)],
    veterans: ["Veterans Day", (y) => observed(mk(y, 11, 11))],
    thanksgiving: ["Thanksgiving", (y) => nthWeekday(y, 11, 4, 4)],
    christmas: ["Christmas Day", (y) => observed(mk(y, 12, 25))]
  };
  const US_FEDERAL = ["newyear", "mlk", "presidents", "memorial", "juneteenth", "independence", "labor", "columbus", "veterans", "thanksgiving", "christmas"];

  const cache = new Map();
  function holidayOn(d, ids) {
    const key = ids.join(",");
    if (!cache.has(key)) cache.set(key, {});
    const byYear = cache.get(key), want = ymd(d);
    for (const y of [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1]) {
      byYear[y] = byYear[y] || ids.filter((id) => HOLIDAYS[id]).map((id) => [HOLIDAYS[id][0], ymd(HOLIDAYS[id][1](y))]);
      const hit = byYear[y].find(([, k]) => k === want);
      if (hit) return hit[0];
    }
    return null;
  }

  function normalize(s) {
    return {
      trashDay: s.trashDay >= 1 && s.trashDay <= 5 ? s.trashDay : 1,
      recycling: s.recycling && s.recycling.every === 2 && s.recycling.firstDate ? { every: 2, firstDate: s.recycling.firstDate } : { every: 1 },
      holidayRule: s.holidayRule === "none" ? "none" : "shift-after",
      holidays: Array.isArray(s.holidays) ? s.holidays : US_FEDERAL,
      yardWaste: s.yardWaste ? { when: s.yardWaste.when === "same-day" ? "same-day" : "day-after-trash", weekly: s.yardWaste.weekly || [], weeks: s.yardWaste.weeks || [] } : null
    };
  }

  // Weekday Mon=1..Sat=6 for a route day in a week: a holiday on/before it (Mon–Fri) pushes it one day later
  function shifted(weekMon, day, s) {
    if (s.holidayRule === "none") return day;
    for (let i = 1; i <= 5 && i <= day; i++) if (holidayOn(addDays(weekMon, i - 1), s.holidays)) return day + 1;
    return day;
  }
  function holidayInWeek(wk, s) { for (let i = 0; i < 5; i++) { const h = holidayOn(addDays(wk, i), s.holidays); if (h) return h; } return null; }

  function yardWeek(weekMon, s) {
    const yw = s.yardWaste, k = ymd(weekMon);
    if (!yw) return { on: false };
    if (yw.weeks.includes(k)) return { on: true };
    for (const r of yw.weekly) if (k >= ymd(monday(new Date(r.from + "T12:00"))) && k <= r.to) return { on: true, expected: !!r.expected };
    return { on: false };
  }

  function collectionsOn(date, schedule) {
    const s = normalize(schedule || {});
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const out = { trash: false, recycling: false, yard: false, expected: false, moved: null };
    const wk = monday(day), wd = (day.getDay() + 6) % 7 + 1;   // Mon=1 … Sun=7
    const trashDay = shifted(wk, s.trashDay, s);
    if (wd === trashDay) {
      out.trash = true;
      if (trashDay !== s.trashDay) out.moved = holidayInWeek(wk, s);
      if (s.recycling.every === 1) out.recycling = true;
      else {
        const weeks = Math.round((wk - monday(new Date(s.recycling.firstDate + "T12:00"))) / (7 * 86400000));
        out.recycling = weeks % 2 === 0;
      }
    }
    // Yard waste: same day as trash, or the day after (the Friday route's goes to the Monday of the yard week)
    const yw = yardWeek(wk, s);
    if (yw.on) {
      const base = s.yardWaste.when === "same-day" ? s.trashDay : (s.trashDay <= 4 ? s.trashDay + 1 : 1);
      const yd = shifted(wk, base, s);
      if (wd === yd) { out.yard = true; out.expected = !!yw.expected; if (yd !== base) out.moved = holidayInWeek(wk, s); }
    }
    return out;
  }

  const api = { collectionsOn, holidayOn: (d, ids = US_FEDERAL) => holidayOn(d, ids), HOLIDAYS, US_FEDERAL };
  // MagicMirror's window has Node integration (so `module` exists there too): always attach to window
  if (typeof window !== "undefined") window.OpenSkyPickup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
