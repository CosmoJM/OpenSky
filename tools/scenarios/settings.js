// Settings panel (test mode: OPENSKY_DRY_RUN=1 — nothing real is touched): brightness, evening dim, sleep schedule,
// sound, status, confirm-twice system buttons, and the night schedule putting the screen to sleep and waking it.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const fs = require("fs"), path = require("path");
  const saved = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "device.test.json"), "utf8")); } catch (e) { return null; } };
  const until = async (fn, tries = 20) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const slide = (id, v) => page.evaluate(([id, v]) => { const el = document.querySelector(`.ost-slider[data-id="${id}"]`); el.value = v; el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); }, [id, v]);
  const open = () => page.evaluate(() => !!document.querySelector(".ost-overlay:not([hidden]) .ost-panel"));
  // wait until every change has its reply and the panel has redrawn (taps go by position; the layout must be settled)
  const settled = () => until(async () => page.evaluate(() => !MM.getModules().withClass("MMM-OpenSky-Settings")[0].inflight));
  const asleep = () => page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].isAsleep());

  ok("sidebar has a Settings tile", !!(await h.box(".os-settings")) || !!(await page.$("[class*='settings']")));
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN"));
  await until(open);
  const secs = await page.evaluate(() => [...document.querySelectorAll(".ost-section h3")].map((x) => x.textContent));
  ok("panel opens with Screen / Sleep / Sound / System", JSON.stringify(secs) === JSON.stringify(["Screen", "Sleep at night", "Sound", "System"]), secs);
  ok("brightness method explained (no hardware here → dims the picture)", await page.evaluate(() => /Dims the picture/.test(document.querySelector(".ost-note").textContent)));

  await slide("brightness", 40);
  await until(async () => saved() && saved().brightness === 40);
  await h.sleep(700);   // (the dim fades in)
  const dim = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".ost-dim")).opacity).toFixed(2));
  ok("brightness 40% → saved, picture dimmed (software)", saved().brightness === 40 && Math.abs(dim - 0.6) < 0.05, { saved: saved().brightness, dim });

  await settled(); await h.tap('.ost-toggle[data-id="dim"]');
  await until(async () => saved().eveningDim.enabled); await settled();
  await page.evaluate(() => document.querySelector('.ost-stepper[data-id="dimFrom"] .ost-step[data-d="15"]').click());
  await until(async () => saved().eveningDim.from === "19:15");
  ok("evening dim on + its time steps by 15 min", saved().eveningDim.enabled && saved().eveningDim.from === "19:15" && await page.evaluate(() => /7:15/.test(document.querySelector('.ost-stepper[data-id="dimFrom"] .ost-time').textContent)), saved().eveningDim);

  await settled(); await h.tap('.ost-toggle[data-id="sleep"]');
  await until(async () => saved().sleep.enabled); await settled();
  for (let i = 0; i < 4; i++) { await page.evaluate(() => document.querySelector('.ost-stepper[data-id="sleepOff"] .ost-step[data-d="-15"]').click()); await h.sleep(150); }
  await until(async () => saved().sleep.off === "21:00");
  ok("sleep schedule on; off time 10 PM → 9 PM", saved().sleep.enabled && saved().sleep.off === "21:00" && saved().sleep.on === "06:30", saved().sleep);

  await slide("volume", 30);
  await page.evaluate(() => { window.__chime = 0; const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; t.playChime = () => { window.__chime++; }; });
  await h.tap(".ost-test"); await h.sleep(200);
  const vol = await page.evaluate(() => [document.querySelector('.ost-value[data-for="volume"]').textContent, window.__chime, document.querySelectorAll(".ost-section")[2].textContent]);
  ok("volume slider + Test plays the timer chime; speaker named", vol[0] === "30%" && vol[1] === 1 && /Test speaker/.test(vol[2]), vol);

  await until(async () => page.evaluate(() => /up to date/.test(document.querySelector(".ost-status").textContent)));
  const stat = await page.evaluate(() => document.querySelector(".ost-status").textContent);
  ok("status: internet, address, version", /Internet/.test(stat) && /Address/.test(stat) && /up to date/.test(stat), stat);

  await page.evaluate(() => document.querySelector('[data-act="shutdown"]').click()); await h.sleep(200);
  const first = await page.evaluate(() => document.querySelector('[data-act="shutdown"]').textContent);
  await page.evaluate(() => document.querySelector('[data-act="shutdown"]').click());
  const t = await until(async () => page.evaluate(() => document.querySelector(".os-toast.show")?.textContent));
  ok("Shut down asks 'Tap again' first; then runs (test mode: nothing happens)", first === "Tap again to shut down" && /test mode/.test(t || ""), { first, t });
  await h.shot("settings");

  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_IDLE_RESET")); await h.sleep(200);
  ok("idle reset closes the panel", !(await open()));

  // ---- the night schedule (clock times passed in; off 21:00, on 06:30) ----
  const at = (hh, mm) => page.evaluate(([hh, mm]) => { const d = new Date(); d.setHours(hh, mm, 0, 0); MM.getModules().withClass("MMM-OpenSky-Settings")[0].checkSchedule(d); }, [hh, mm]);
  await at(20, 59); await at(20, 59.5); await h.sleep(300);
  ok("evening, before 9 PM: awake", !(await asleep()));
  await page.evaluate(() => { const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; t.__timers = t.timers; t.timers = [{}]; });
  await at(21, 0); await h.sleep(300);
  ok("9 PM with a timer running: stays awake", !(await asleep()));
  await page.evaluate(() => { const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; t.timers = t.__timers || []; });
  await at(20, 59); await at(21, 0); await h.sleep(500);
  ok("9 PM: the screen sleeps", await asleep());
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].wake()); await h.sleep(600);
  await at(22, 0); await h.sleep(300);
  ok("woken at night: stays on while being used", !(await asleep()));
  await page.evaluate(() => { const sb = MM.getModules().withClass("MMM-OpenSky-Sidebar")[0]; sb.lastActivity = Date.now() - 4 * 60 * 1000; });
  await at(22, 5); await h.sleep(500);
  ok("…and sleeps again after 3 quiet minutes", await asleep());
  await at(6, 30); await h.sleep(800);
  ok("6:30 AM: wakes up", !(await asleep()));

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
