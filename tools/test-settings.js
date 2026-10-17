// Unit test for the Settings node helper (modules/MMM-OpenSky-Settings/node_helper.js): changes made on the screen
// never wipe a settings file that has a typo in it. Fictional "Testers" family, fake secrets. OPENSKY_DRY_RUN=1.
const fs = require("fs"), os = require("os"), path = require("path"), Module = require("module");
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-settings-"));
fs.mkdirSync(path.join(tmp, "mm", "modules"), { recursive: true });
fs.symlinkSync(path.join(REPO, "lib"), path.join(tmp, "mm", "modules", "opensky-lib"));
global.root_path = path.join(tmp, "mm");
process.env.OPENSKY_DRY_RUN = "1";
process.env.OPENSKY_SETTINGS = path.join(tmp, "opensky.json");
process.env.OPENSKY_SECRETS = path.join(tmp, "secrets.json");
const sent = [];
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { return req === "node_helper" ? path.join(tmp, "nh.js") : origResolve.call(this, req, ...a); };
fs.writeFileSync(path.join(tmp, "nh.js"), "module.exports = { create: (o) => Object.assign({ sendSocketNotification(n, p) { global.__sent.push([n, p]); } }, o) };");
global.__sent = sent;

let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
const read = (f) => fs.readFileSync(f, "utf8");
const notice = () => (sent.filter(([n]) => n === "OS_SET_NOTICE").pop() || [])[1];

(async () => {
  const goodSettings = JSON.stringify({ family: { name: "The Testers" }, pages: ["home", "timer"] });
  fs.writeFileSync(process.env.OPENSKY_SETTINGS, goodSettings);
  const h = require(path.join(REPO, "modules", "MMM-OpenSky-Settings", "node_helper.js"));
  h.start();
  await h.ready;

  // 1-2 a damaged secrets.json (a typo from editing it by hand) is never replaced by just the new web page
  const damaged = '{ "google": { "refreshToken": "rt-testers" }, "embeds": { } ';
  fs.writeFileSync(process.env.OPENSKY_SECRETS, damaged);
  await h.socketNotificationReceived("OS_SET_PREFS_SAVE", { patch: { webPage: { title: "Cameras", url: "http://192.168.1.50", pin: "2468" } } });
  ok("1 add a locked web page with a damaged secrets.json → refused, nothing lost", read(process.env.OPENSKY_SECRETS) === damaged && read(process.env.OPENSKY_SETTINGS) === goodSettings, notice());
  fs.writeFileSync(process.env.OPENSKY_SECRETS, JSON.stringify({ google: { refreshToken: "rt-testers" } }));
  await h.socketNotificationReceived("OS_SET_PREFS_SAVE", { patch: { webPage: { title: "Cameras", url: "http://192.168.1.50", pin: "2468" } } });
  const sec = JSON.parse(read(process.env.OPENSKY_SECRETS));
  ok("2 a good secrets.json: the page's address + PIN added, the Google sign-in kept",
    sec.google.refreshToken === "rt-testers" && sec.embeds.cameras.pin === "2468" && !read(process.env.OPENSKY_SETTINGS).includes("192.168.1.50"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
  process.exit(failed ? 1 : 0);
})();
