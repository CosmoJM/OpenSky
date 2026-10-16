/* OpenSky screen off / on (server side) — used by MMM-OpenSky-Settings for Sleep, the night schedule and "Test".
 *
 * Every screen is different, so there are a few ways to turn one off (device.json → screenOff):
 *   "auto"      — the display's backlight when there is one (Pi touch displays), else "soft" (recommended)
 *   "soft"      — a black cover + brightness 0 (DDC/CI or backlight when available). Works on every screen; touch keeps working.
 *   "output"    — turn the video signal off (wlr-randr). Most monitors go to sleep. Some (e.g. some touch monitors) reconnect by
 *                 themselves and come back on: a self-check notices that and switches to "soft".
 *   (No DDC/CI power-off: tested on a real touch monitor, "standby" over DDC powered it fully down — touch included — and
 *   nothing from the Pi could wake it again; only its power button. Brightness over DDC/CI is used by "soft" instead.)
 *   "cec"       — TVs: HDMI-CEC standby / on.
 *   "backlight" — the display's backlight power (official Pi displays and some DSI panels).
 * While a screen is really off the page can't see touches, so services/screen-service/input_watch.py watches the input
 * devices and the first touch wakes it.
 * OPENSKY_DRY_RUN=1 (tests): commands are logged, never run.
 */
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const DRY = process.env.OPENSKY_DRY_RUN === "1";
const WATCHER = path.join(__dirname, "..", "services", "screen-service", "input_watch.py");
const METHODS = ["auto", "soft", "output", "cec", "backlight"];
const LABELS = {
  auto: "Automatic (recommended)", soft: "Black screen + dim (works on every screen)", output: "Turn the signal off (most monitors)",
  cec: "TV standby (HDMI-CEC)", backlight: "Display backlight off (Pi displays)"
};

const run = (cmd, args, timeout = 15000) => new Promise((resolve) => {
  if (DRY) { console.log(`[OpenSky] screen (test mode, not run): ${cmd} ${args.join(" ")}`); return resolve({ ok: true, out: "" }); }
  execFile(cmd, args, { timeout }, (e, out, err) => resolve({ ok: !e, out: String(out || ""), err: String(err || (e && e.message) || "") }));
});
const has = async (cmd) => DRY ? true : (await run("sh", ["-c", `command -v ${cmd}`], 3000)).ok;

/* ---------------- what this Pi has ---------------- */
async function detect() {
  const a = { soft: true, output: false, cec: false, backlight: false, outputs: [] };
  if (DRY) return { ...a, output: true, cec: true, outputs: ["TEST-1"] };
  if (process.env.WAYLAND_DISPLAY && await has("wlr-randr")) {
    const r = await run("wlr-randr", ["--json"], 5000);
    try { a.outputs = JSON.parse(r.out).filter((o) => o.enabled).map((o) => o.name); a.output = a.outputs.length > 0; } catch (e) { /* no outputs */ }
  }
  // TV standby only when a TV actually answers over HDMI-CEC (the Pi always has CEC hardware; most monitors don't)
  if (await has("cec-ctl") && fs.existsSync("/dev/cec0")) {
    await run("cec-ctl", ["-d", "/dev/cec0", "--playback"], 10000);
    const r = await run("cec-ctl", ["-d", "/dev/cec0", "--to", "0", "--give-device-power-status"], 10000);
    a.cec = r.ok && /Tx, OK/.test(r.out) && !/Not Acknowledged/.test(r.out);
  }
  try {
    for (const d of fs.readdirSync("/sys/class/backlight")) {
      const f = path.join("/sys/class/backlight", d, "bl_power");
      fs.accessSync(f, fs.constants.W_OK);
      a.backlight = f; break;
    }
  } catch (e) { /* none */ }
  return a;
}

function resolve(method, avail) {
  if (method === "auto" || !METHODS.includes(method)) return avail.backlight ? "backlight" : "soft";
  return avail[method] ? method : "soft";
}

/* ---------------- off / on ---------------- */
async function off(method, avail) {
  if (method === "output") for (const o of avail.outputs) await run("wlr-randr", ["--output", o, "--off"]);
  else if (method === "cec") { await run("cec-ctl", ["-d", "/dev/cec0", "--playback"]); await run("cec-ctl", ["-d", "/dev/cec0", "--to", "0", "--standby"]); }
  else if (method === "backlight") await write(avail.backlight, "4");
}
async function on(method, avail) {
  if (method === "output") for (const o of avail.outputs) await run("wlr-randr", ["--output", o, "--on"]);
  else if (method === "cec") { await run("cec-ctl", ["-d", "/dev/cec0", "--playback"]); await run("cec-ctl", ["-d", "/dev/cec0", "--to", "0", "--image-view-on"]); }
  else if (method === "backlight") await write(avail.backlight, "0");
}
async function write(file, v) {
  if (DRY) { console.log(`[OpenSky] screen (test mode, not run): write ${v} > ${file}`); return; }
  try { fs.writeFileSync(file, v); } catch (e) { console.error(`[OpenSky] screen: ${e.message}`); }
}

/** After waking: is the screen really on again? (signal method: the output is enabled) */
async function isBack(method, avail) {
  if (method !== "output") return true;
  if (DRY) return !process.env.OPENSKY_FAKE_SCREEN_STAYS_OFF;
  const r = await run("wlr-randr", ["--json"], 5000);
  try { return JSON.parse(r.out).some((o) => avail.outputs.includes(o.name) && o.enabled); } catch (e) { return false; }
}

/** Did a "signal off" screen come back on by itself (some monitors reconnect)? Checked ~25 s after turning it off. */
async function cameBack(avail) {
  if (DRY) return !!process.env.OPENSKY_FAKE_SCREEN_COMES_BACK;
  const r = await run("wlr-randr", ["--json"], 5000);
  try { return JSON.parse(r.out).some((o) => avail.outputs.includes(o.name) && o.enabled); } catch (e) { return false; }
}

/** Watch touch/mouse/keys while the screen is really off: calls onInput() at the first input. Returns stop(). */
function watchInput(onInput) {
  if (DRY) { module.exports.fakeInput = onInput; return () => { module.exports.fakeInput = null; }; }
  const p = spawn("python3", [WATCHER], { stdio: ["ignore", "pipe", "ignore"] });
  let done = false;
  p.stdout.on("data", (d) => { if (!done && /input/.test(String(d))) { done = true; onInput(); } });
  p.on("error", (e) => console.error(`[OpenSky] input watcher: ${e.message}`));
  return () => { done = true; try { p.kill(); } catch (e) { /* gone */ } };
}

module.exports = { METHODS, LABELS, detect, resolve, off, on, isBack, cameBack, watchInput };
