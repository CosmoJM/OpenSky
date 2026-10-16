// Safety net: if a screen doesn't come back after "turn the signal off" (test mode fakes it), OpenSky retries, says so
// plainly and switches to Black screen + dim, which always comes back.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 60) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Settings")[0].change({ screenOff: "output" }));
  await h.sleep(800);
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sleep());
  await h.sleep(1500);
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].wake());
  const msg = await until(async () => page.evaluate(() => document.querySelector(".os-toast.show")?.textContent || ""));
  const dev = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "out", "device.test.json"), "utf8"));
  const tries = h.serverLog().split("\n").filter((l) => /not run\): wlr-randr --output TEST-1 --on/.test(l)).length;
  ok("a screen that doesn't come back: retried, told to press its power button, switched to Black screen + dim", /power button/.test(msg) && dev.screenOff === "soft" && tries >= 2, { msg, screenOff: dev.screenOff, tries });
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.env = { OPENSKY_FAKE_SCREEN_STAYS_OFF: "1" };
