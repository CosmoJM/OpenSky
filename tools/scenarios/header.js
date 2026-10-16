// Header: family name, clock format, Open-Meteo weather (shared as OPENSKY_WEATHER), countdown with a custom
// occasion, sports helper reachable. Needs config/opensky.json with a location (see tools/README or testing.md).
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  // capture the weather broadcast
  await page.evaluate(() => {
    window.__wx = null;
    const probe = MM.getModules().withClass("MMM-OpenSky-Timer")[0];
    const orig = probe.notificationReceived.bind(probe);
    probe.notificationReceived = (n, p, s) => { if (n === "OPENSKY_WEATHER") window.__wx = p; return orig(n, p, s); };
    MM.getModules().withClass("MMM-OpenSky-Header")[0]._fetchWeather();
  });
  for (let i = 0; i < 25 && !(await page.evaluate(() => window.__wx && document.querySelector(".hb-wx-temp"))); i++) await h.sleep(1000);
  const hd = await page.evaluate(() => ({
    title: document.querySelector(".hb-title")?.textContent, time: document.querySelector(".hb-time")?.textContent,
    temp: document.querySelector(".hb-wx-temp")?.textContent, icon: !!document.querySelector(".hb-wx-ico svg"),
    cd: document.querySelector(".hb-countdown")?.textContent.replace(/\s+/g, " ").trim(), wx: window.__wx && { cur: window.__wx.current, days: Object.keys(window.__wx.daily || {}).length }
  }));
  ok("family name from settings", hd.title === "The Testers", hd.title);
  ok("12-hour clock", /^\d{1,2}:\d{2} (AM|PM)$/.test(hd.time || ""), hd.time);
  ok("current weather from Open-Meteo (no key)", /^-?\d+°$/.test(hd.temp || "") && hd.icon, hd.temp);
  ok("weather shared with other modules (8 days)", hd.wx && hd.wx.days >= 7 && hd.wx.cur, hd.wx);
  ok("countdown shows the custom occasion (Oct 20) before Halloween", /Test Day/.test(hd.cd || ""), hd.cd);
  await h.shot("header");
  // sports helper: a real ESPN request for the configured league, and a friendly error for an unknown league
  const res = await page.evaluate(() => new Promise((resolve) => {
    const m = MM.getModules().withClass("MMM-OpenSky-Header")[0];
    const out = []; const orig = m.socketNotificationReceived.bind(m);
    m.socketNotificationReceived = (n, p) => { if (n === "GAME_RESULT") out.push(p); return orig(n, p); };
    m.sendSocketNotification("GAME_FETCH", { league: "nfl", team: "NE", ymd: "20261018" });
    setTimeout(() => m.sendSocketNotification("GAME_FETCH", { league: "cricket", team: "NE", ymd: "20261018" }), 3000);
    setTimeout(() => resolve(out), 7000);
  }));
  ok("ESPN scoreboard reachable for the chosen league", res[0] && res[0].ok === true, res[0] && { ok: res[0].ok, hasEvent: !!res[0].event, error: res[0].error });
  ok("unknown league → clear error message", res[1] && res[1].ok === false && /unknown league/.test(res[1].error), res[1] && res[1].error);
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
