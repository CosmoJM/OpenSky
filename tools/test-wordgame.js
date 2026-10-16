// Unit test for the word game's daily word: NYT's word by default (fake NYT server), OpenSky's own word when NYT
// can't be reached, switching back to NYT's while nobody has guessed, and NYT words accepted as guesses.
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), Module = require("module");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-wg-"));
process.env.OPENSKY_WORDGAME = path.join(tmp, "wordgame.json");
// a stand-in for MagicMirror's node_helper
const sent = [];
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { return req === "node_helper" ? path.join(tmp, "nh.js") : origResolve.call(this, req, ...a); };
fs.writeFileSync(path.join(tmp, "nh.js"), "module.exports = { create: (o) => Object.assign({ sendSocketNotification(n, p) { global.__sent.push([n, p]); } }, o) };");
global.__sent = sent;

let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
let nytUp = false, hits = 0;
const WORD = "qajaq";   // the fake NYT word: deliberately not in OpenSky's lists
const server = http.createServer((req, res) => {
  hits++;
  if (!nytUp) { res.writeHead(500); return res.end(); }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ solution: WORD, days_since_launch: 1580 }));
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENSKY_NYT_URL = `http://127.0.0.1:${server.address().port}/svc`;
  const h = require(path.join(__dirname, "..", "modules", "MMM-OpenSky-WordGame", "node_helper.js"));
  h.start();
  const last = () => sent.filter(([n]) => n === "OS_WG_STATE").pop()[1];
  const lastErr = () => (sent.filter(([n]) => n === "OS_WG_ERROR").pop() || [])[1];

  await h.socketNotificationReceived("OS_WG_INIT", { source: "nyt" });
  let st = last();
  ok("1 NYT down → OpenSky's word, marked as the backup", st.backup === true && st.source === "opensky" && st.answer === null);
  nytUp = true;
  await h.socketNotificationReceived("OS_WG_SYNC");
  ok("2 within 10 minutes: no new NYT request", last().backup === true);
  h.cached.tried -= 11 * 60 * 1000;
  await h.socketNotificationReceived("OS_WG_SYNC");
  st = last();
  ok("3 after 10 minutes with no guesses: switches to NYT's word and number", st.backup === false && st.source === "nyt" && st.number === 1580);
  await h.socketNotificationReceived("OS_WG_GUESS", { word: "crane", date: st.date });
  await h.socketNotificationReceived("OS_WG_GUESS", { word: WORD, date: st.date });
  st = last();
  ok("4 NYT's word is accepted even when it isn't in OpenSky's lists; solved", st.status === "won" && st.guesses.length === 2 && st.answer === WORD, lastErr());
  const before = hits;
  await h.socketNotificationReceived("OS_WG_SYNC");
  ok("5 NYT is asked once a day, not on every look", hits === before);

  // opensky source: never asks NYT
  const h2 = Object.assign(Object.create(Object.getPrototypeOf(h)), h); h2.start(); h2.cached = null;
  fs.rmSync(process.env.OPENSKY_WORDGAME, { force: true });
  const b2 = hits;
  await h2.socketNotificationReceived("OS_WG_INIT", { source: "opensky" });
  ok("6 source \"opensky\": OpenSky's word, no NYT request", last().source === "opensky" && last().backup === false && hits === b2);

  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
})().catch((e) => { console.log(`SUMMARY pass=${passed} fail=${failed + 1} (crashed: ${e.message})`); process.exit(1); });
