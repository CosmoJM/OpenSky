// Unit test for the phone setup server (modules/MMM-OpenSky-Setup/node_helper.js): pairing limits hold even when
// many guesses arrive at once, and only a paired phone keeps setup open. Fictional "Testers" family, fake secrets.
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), net = require("net"), Module = require("module");
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-setup-"));
// a stand-in for the MagicMirror folder (node helpers require the shared library from <MagicMirror>/modules/opensky-lib)
fs.mkdirSync(path.join(tmp, "mm", "modules"), { recursive: true });
fs.symlinkSync(path.join(REPO, "lib"), path.join(tmp, "mm", "modules", "opensky-lib"));
global.root_path = path.join(tmp, "mm");
process.env.OPENSKY_DRY_RUN = "1";
process.env.OPENSKY_SETTINGS = path.join(tmp, "opensky.json");
process.env.OPENSKY_SECRETS = path.join(tmp, "secrets.json");
process.env.OPENSKY_WELCOME_FILE = path.join(tmp, ".welcomed");
// a stand-in for MagicMirror's node_helper
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { return req === "node_helper" ? path.join(tmp, "nh.js") : origResolve.call(this, req, ...a); };
fs.writeFileSync(path.join(tmp, "nh.js"), "module.exports = { create: (o) => Object.assign({ sendSocketNotification() {} }, o) };");

let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let port;
// one request; resolves { status, body, cookie }
function call(method, url, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port, path: url, method, headers: { Host: "localhost", ...(method === "POST" ? { "X-OpenSky": "1" } : {}), ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let d = ""; res.on("data", (c) => { d += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body: j, cookie: (res.headers["set-cookie"] || [""])[0].split(";")[0] }); });
    });
    r.on("error", () => resolve({ status: 0 }));
    if (data) r.write(data);
    r.end();
  });
}

// Many pairing guesses at once: every request's headers arrive first, the codes a moment later (what an attacker on
// the Wi-Fi would do). Returns how many guesses were really compared with the code (answered 401).
function burst(n) {
  return new Promise((resolve) => {
    const socks = []; let up = 0, closed = 0, checked = 0;
    for (let i = 0; i < n; i++) {
      const body = JSON.stringify({ code: String(100000 + i) });
      const s = net.connect(port, "127.0.0.1", () => {
        s.write(`POST /api/pair HTTP/1.1\r\nHost: localhost\r\nX-OpenSky: 1\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n`);
        if (++up === n) setTimeout(() => socks.forEach(([x, b]) => x.end(b)), 100);
      });
      let d = ""; s.on("data", (c) => { d += c; }); s.on("error", () => {});
      s.on("close", () => { if (/^HTTP\/1\.1 401/.test(d)) checked++; if (++closed === n) resolve(checked); });
      socks.push([s, body]);
    }
  });
}

(async () => {
  fs.writeFileSync(process.env.OPENSKY_SETTINGS, JSON.stringify({ family: { name: "The Testers" }, setup: { port: 0 } }));
  fs.writeFileSync(process.env.OPENSKY_SECRETS, JSON.stringify({ lists: { todoist: { token: "tok-testers-123" } } }));
  const h = require(path.join(REPO, "modules", "MMM-OpenSky-Setup", "node_helper.js"));
  h.start();
  // listen on a free port
  process.env.OPENSKY_SETUP_PORT = String(await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); }));
  port = Number(process.env.OPENSKY_SETUP_PORT);
  h.socketNotificationReceived("OS_SETUP_START");
  await sleep(200);

  // 1-3 pairing limits
  const checked = await burst(200);
  ok("1 200 guesses at once: only 5 are compared before the pause", checked === 5, checked);
  h.lockedUntil = 0;   // (skip the minute's wait)
  h.wrong = 14;
  const real = h.code;
  await call("POST", "/api/pair", { code: real === "000000" ? "000001" : "000000" });
  const after = await call("POST", "/api/pair", { code: h.code });
  ok("2 15 wrong codes → a new code AND the pause still holds", h.code !== real && after.status === 429, after.status);
  const idle = h.idleTimer;
  await call("GET", "/");
  await call("GET", "/api/state");
  ok("3 requests from a phone that isn't paired don't keep setup open", h.idleTimer === idle);

  // a paired phone
  h.lockedUntil = 0; h.codeUntil = Date.now() + 60000;
  const cookie = (await call("POST", "/api/pair", { code: h.code })).cookie;
  const as = { Cookie: cookie };
  ok("4 the right code pairs the phone", /^os_setup=[a-f0-9]{64}$/.test(cookie), cookie.slice(0, 12));

  // 5-7 a damaged secrets.json (a typo from editing it by hand) is never replaced by just the new value
  const damaged = '{ "lists": { "todoist": { "token": "tok-testers-123" } }, }';
  fs.writeFileSync(process.env.OPENSKY_SECRETS, damaged);
  const settings = { family: { name: "The Testers" }, pages: ["home"] };
  let r = await call("POST", "/api/save", { settings, secrets: { "weather.openweathermap.apiKey": "owm-testers" } }, as);
  ok("5 damaged secrets.json + a new password → refused, nothing lost", r.status === 409 && fs.readFileSync(process.env.OPENSKY_SECRETS, "utf8") === damaged, r.body);
  r = await call("POST", "/api/save", { settings: { ...settings, pages: ["home", "timer"] }, secrets: {} }, as);
  ok("6 damaged secrets.json + only settings changed → settings saved, secrets.json untouched",
    r.status === 200 && JSON.parse(fs.readFileSync(process.env.OPENSKY_SETTINGS, "utf8")).pages.length === 2 && fs.readFileSync(process.env.OPENSKY_SECRETS, "utf8") === damaged, r.status);
  r = await call("POST", "/api/google/start", { clientId: "123-testers.apps.googleusercontent.com", clientSecret: "cs-testers" }, as);
  ok("7 Google sign-in with a damaged secrets.json → refused, nothing lost", r.status === 409 && fs.readFileSync(process.env.OPENSKY_SECRETS, "utf8") === damaged, r.status);
  fs.writeFileSync(process.env.OPENSKY_SECRETS, JSON.stringify({ lists: { todoist: { token: "tok-testers-123" } } }));
  r = await call("POST", "/api/save", { settings, secrets: { "weather.openweathermap.apiKey": "owm-testers" } }, as);
  const sec = JSON.parse(fs.readFileSync(process.env.OPENSKY_SECRETS, "utf8"));
  ok("8 a good secrets.json: the new key is added, the others kept, the phone only learns names",
    r.status === 200 && sec.lists.todoist.token === "tok-testers-123" && sec.weather.openweathermap.apiKey === "owm-testers" && !JSON.stringify(r.body).includes("tok-testers"), r.body);

  // 9 a secret's name can't reach into JavaScript itself ("embeds.__proto__.x" passed the allowed-names check)
  r = await call("POST", "/api/save", { settings, secrets: { "embeds.__proto__.pin": "1234", "calendar.sources.constructor.prototype.url": "http://x" } }, as);
  ok("9 secret names like embeds.__proto__.pin are ignored (no change to every object on the Pi)", r.status === 200 && ({}).pin === undefined && ({}).url === undefined, ({}).pin);
  delete Object.prototype.pin;

  // 10 a damaged opensky.json: the phone is told, not shown the example settings (which Save would then write)
  fs.writeFileSync(process.env.OPENSKY_SETTINGS, '{ "family": { "name": "The Testers" }, }');
  r = await call("GET", "/api/state", undefined, as);
  ok("10 damaged opensky.json → the phone says so instead of offering the example settings", r.status === 409 && /mistake/.test(r.body.error), r.status);

  h.stopServer("test over");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
  process.exit(failed ? 1 : 0);
})();
