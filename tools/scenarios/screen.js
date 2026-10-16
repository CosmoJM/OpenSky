// Screen off / on (test mode: the commands are only logged): Sleep with "turn the signal off", a touch wakes it,
// Test with TV standby, and the self-check that switches to Black screen when a monitor comes back by itself.
module.exports = async (page, h, app) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 40) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  // the screen commands (test mode logs them instead of running them)
  const log = async () => h.serverLog().split("\n").filter((l) => /screen \(test mode, not run\)/.test(l)).map((l) => l.replace(/.*not run\): /, ""));
  const asleep = () => page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].isAsleep());
  const open = async () => { await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN")); await until(async () => page.evaluate(() => !!document.querySelector("[data-screenoff]"))); };

  await open();
  const opts = await page.evaluate(() => [...document.querySelectorAll("[data-screenoff] option")].map((o) => [o.value, o.disabled]));
  ok("Settings lists the ways to turn the screen off (auto, black screen, signal, DDC, TV, backlight)", opts.map((o) => o[0]).join() === "auto,soft,output,ddc,cec,backlight", opts);
  await page.evaluate(() => { const s = document.querySelector("[data-screenoff]"); s.value = "output"; s.dispatchEvent(new Event("change")); });
  await h.sleep(500);
  await page.evaluate(() => document.querySelector(".ost-x").click());

  await h.tap(".os-sleep"); await h.sleep(800);
  ok("Sleep with 'turn the signal off' → the output goes off", await asleep() && (await log()).some((l) => /wlr-randr --output TEST-1 --off/.test(l)), await log());
  await h.sleep(3000);
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Settings")[0].sendSocketNotification("OS_SET_FAKE_INPUT"));
  await until(async () => !(await asleep()));
  ok("a touch (seen by the input watcher) turns it back on and wakes the page", !(await asleep()) && (await log()).some((l) => /--output TEST-1 --on/.test(l)), (await log()).slice(-2));

  await open();
  await page.evaluate(() => { const s = document.querySelector("[data-screenoff]"); s.value = "cec"; });
  await page.evaluate(() => document.querySelector(".ost-test-screen").click());
  await until(asleep);
  const during = await log();
  await until(async () => !(await asleep()), 60);
  ok("Test with TV standby: off, then back on by itself after 10 s", during.some((l) => /cec-ctl .*--standby/.test(l)) && (await log()).some((l) => /--image-view-on/.test(l)) && !(await asleep()), (await log()).slice(-3));

  // self-check: this fake monitor comes back on by itself (OPENSKY_FAKE_SCREEN_COMES_BACK)
  await open();
  await page.evaluate(() => { const s = document.querySelector("[data-screenoff]"); s.value = "output"; s.dispatchEvent(new Event("change")); });
  await h.sleep(500);
  await page.evaluate(() => document.querySelector(".ost-x").click());
  await h.tap(".os-sleep");
  const msg = await until(async () => page.evaluate(() => document.querySelector(".os-toast.show")?.textContent || ""), 140);
  const dev = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "out", "device.test.json"), "utf8"));
  ok("a monitor that comes back on by itself → switched to Black screen + dim, and told", /turns itself back on/.test(msg) && dev.screenOff === "soft", { msg, screenOff: dev.screenOff });
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].wake()); await h.sleep(600);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.env = { OPENSKY_FAKE_SCREEN_COMES_BACK: "1" };
