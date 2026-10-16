// Smoke test: OpenSky boots with the example settings, the Timer page works and the chime banner appears.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const info = await page.evaluate(() => ({ modules: MM.getModules().map((m) => m.name), bg: getComputedStyle(document.body).backgroundColor, title: document.title }));
  ok("boots with MMM-pages + the Timer", info.modules.includes("MMM-pages") && info.modules.includes("MMM-OpenSky-Timer"), info.modules.join(","));
  ok("base theme applied (white page)", info.bg === "rgb(255, 255, 255)", info.bg);
  await h.tap(".os-page-timer"); await h.sleep(600);
  const setup = await page.evaluate(() => !!document.querySelector(".timer-setup-screen"));
  ok("Timer setup screen shows", setup);
  await h.shot("smoke-timer-setup");
  // start a 3-second timer through the real inputs
  await page.evaluate(() => { document.getElementById("timer-seconds").value = "3"; });
  await h.tap(".timer-start-btn"); await h.sleep(1200);
  ok("timer running", await page.evaluate(() => !!document.querySelector(".timer-display")));
  await h.sleep(3500);
  const done = await page.evaluate(() => { const b = document.querySelector(".timer-banner"); return b && !b.hidden; });
  ok("finished → 'Timer finished' banner", done);
  await h.shot("smoke-timer-done");
  await h.tap(".timer-banner-stop"); await h.sleep(500);
  ok("Stop clears it", await page.evaluate(() => !document.querySelector(".timer-display") && document.querySelector(".timer-banner").hidden));
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
