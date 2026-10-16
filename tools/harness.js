// OpenSky off-screen test harness: launches the REAL MagicMirror/Electron app on a headless Wayland compositor
// and runs a scenario against it with Playwright. It never touches a physical screen.
//
//   1. start a headless compositor once:   tools/headless.sh start      (creates WAYLAND_DISPLAY=wayland-1)
//   2. run a scenario:                     node tools/harness.js tools/scenarios/<name>.js
//   3. stop the compositor:                tools/headless.sh stop
//
// Options (environment): OPENSKY_MM = MagicMirror folder (default ~/opensky-dev/MagicMirror),
// OPENSKY_PORT = server port (default 8083, so it never clashes with a MagicMirror already running on 8080/8081),
// OPENSKY_SETTINGS = settings file (default tools/fixtures/opensky.test.json — a fictional family in Boston),
// OPENSKY_SECRETS = secrets file (default tools/fixtures/secrets.test.json — fictional values only).
// A scenario exports `async (page, h, app) => {}`; screenshots go to tools/out/.
const { _electron } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const os = require("os");

const MM = process.env.OPENSKY_MM || path.join(os.homedir(), "opensky-dev", "MagicMirror");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
// every run starts with an empty on-device calendar
const LOCAL_CAL = path.join(OUT, "local-calendar.test.json");
fs.rmSync(LOCAL_CAL, { force: true });
// on-device lists, seeded fresh each run (Groceries: Milk, Apples · Chores: empty)
const LOCAL_LISTS = path.join(OUT, "lists.test.json");
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(LOCAL_LISTS, JSON.stringify({ version: 1, lists: { Groceries: [{ id: "g1", text: "Milk" }, { id: "g2", text: "Apples" }] } }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const scenario = require(path.resolve(process.argv[2]));
  const app = await _electron.launch({
    executablePath: path.join(MM, "node_modules/electron/dist/electron"),
    args: ["js/electron.js", "--ozone-platform=wayland"],
    cwd: MM,
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`,
      WAYLAND_DISPLAY: process.env.OPENSKY_TEST_DISPLAY || "wayland-1",   // the headless compositor, NOT a real screen
      DISPLAY: "",
      OPENSKY_PORT: process.env.OPENSKY_PORT || "8083",
      OPENSKY_SETTINGS: process.env.OPENSKY_SETTINGS || path.join(__dirname, "fixtures", "opensky.test.json"),
      OPENSKY_SECRETS: process.env.OPENSKY_SECRETS || path.join(__dirname, "fixtures", "secrets.test.json"),
      OPENSKY_LOCAL_CALENDAR: LOCAL_CAL,
      OPENSKY_LOCAL_LISTS: LOCAL_LISTS,
      ELECTRON_ENABLE_LOGGING: "1"
    },
    timeout: 90000
  });
  const page = await app.firstWindow({ timeout: 90000 });
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(1, 4).join("\n")}`));
  const h = {
    sleep,
    shot: (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) }),
    log: (...a) => console.log(...a),
    box: async (sel) => (await page.$(sel))?.boundingBox(),
    tap: async (sel) => { const b = await h.box(sel); if (!b) throw new Error("no element " + sel); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
  };
  try {
    await sleep(8000);   // let modules load
    await scenario(page, h, app);
  } catch (e) {
    console.log("SCENARIO ERROR:", e.message.split("\n")[0]);
    await h.shot("error-state").catch(() => {});
  } finally {
    const noise = /gbm|dma_buf|Autofill|DevTools|Electron Security Warning/;
    console.log("---- page errors/warnings ----\n" + logs.filter((l) => !noise.test(l)).slice(0, 30).join("\n"));
    await app.close().catch(() => {});
  }
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
