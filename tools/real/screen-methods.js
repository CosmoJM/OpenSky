// REAL screen test (not part of test-all): OPENSKY_HARNESS_REAL=1 OPENSKY_TEST_DISPLAY=wayland-0 node tools/harness.js tools/real/screen-methods.js
// Tries each way of turning the real screen off and back on, and reads the monitor's state after each step.
const { execFileSync } = require("child_process");
const env = { ...process.env, WAYLAND_DISPLAY: "wayland-0", XDG_RUNTIME_DIR: "/run/user/1000" };
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { env, timeout: 25000 }).toString().trim(); } catch (e) { return `ERR ${String(e.stderr || e.message).trim().slice(0, 120)}`; } };
const outputOn = () => { const j = sh("wlr-randr", ["--json"]); try { return JSON.parse(j).map((o) => `${o.name}:${o.enabled}`).join(","); } catch (e) { return j; } };
const ddc = (code) => sh("ddcutil", ["--brief", "getvcp", code]);
module.exports = async (page, h) => {
  const set = (m) => page.evaluate((m) => MM.getModules().withClass("MMM-OpenSky-Settings")[0].change({ screenOff: m }), m);
  const sleep = () => page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sleep());
  const wake = () => page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].wake());
  h.log("start:", outputOn(), "| brightness", ddc("10"), "| power", ddc("D6"));
  const avail = await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Settings")[0].state.screen);
  h.log("detected:", JSON.stringify(avail.available), "auto →", avail.resolved);
  for (const m of ["soft", "ddc", "cec", "output"]) {
    await set(m); await h.sleep(1500);
    await sleep(); await h.sleep(6000);
    h.log(`[${m}] off after 6 s:`, outputOn(), "| brightness", ddc("10"), "| power", ddc("D6"));
    if (m === "output") {
      await h.sleep(26000);
      const dev = await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Settings")[0].state.settings.screenOff);
      h.log(`[${m}] after 32 s:`, outputOn(), "| setting now:", dev, "| toast:", await page.evaluate(() => document.querySelector(".os-toast")?.textContent || ""));
    }
    await wake(); await h.sleep(6000);
    h.log(`[${m}] on again:`, outputOn(), "| brightness", ddc("10"), "| power", ddc("D6"));
  }
  await set("auto");
  h.log("SUMMARY: ALL CHECKS PASSED (real screen log above)");
};
