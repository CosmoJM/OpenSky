// Phone setup: the first-run welcome card, the pairing card (QR + code), the phone page in a phone-sized window
// (pair, edit, add a list + a private calendar link, save, finish), and the server's guards.
// Uses writable copies of the settings (tools/out), never the fixtures.
const fs = require("fs"), path = require("path"), http = require("http");
const OUT = path.join(__dirname, "..", "out");

module.exports = async (page, h, app) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 40) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const raw = (method, p, headers = {}, body) => new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: 8091, path: p, method, headers: { Host: "localhost:8091", ...headers } }, (res) => { let d = ""; res.on("data", (c) => { d += c; }); res.on("end", () => resolve({ status: res.statusCode, body: d, headers: res.headers })); });
    req.on("error", (e) => resolve({ status: 0, body: e.message }));
    if (body) req.write(body);
    req.end();
  });
  const status = () => page.evaluate(() => document.querySelector(".osu-status")?.textContent || "");

  // first run: the welcome card
  fs.rmSync(path.join(OUT, "welcomed.test"), { force: true });
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Setup")[0].sendSocketNotification("OS_SETUP_INIT"));
  await until(() => page.evaluate(() => !!document.querySelector(".osu-welcome")));
  ok("first run: a welcome card offers phone setup", await page.evaluate(() => /Welcome to OpenSky/.test(document.querySelector(".osu-welcome")?.textContent || "")));
  await h.shot("setup-welcome");
  await h.tap(".osu-go");
  await until(() => page.evaluate(() => document.querySelectorAll(".osu-code span").length === 6));
  const card = await page.evaluate(() => ({ code: [...document.querySelectorAll(".osu-code span")].map((s) => s.textContent).join(""), qr: !!document.querySelector(".osu-qr svg path"), url: document.querySelector(".osu-url")?.textContent }));
  ok("pairing card: QR code, address and a 6-digit code; welcome remembered", /^\d{6}$/.test(card.code) && card.qr && /:8091$/.test(card.url) && fs.existsSync(path.join(OUT, "welcomed.test")), { qr: card.qr, url: card.url });
  await h.shot("setup-pair-card");

  // the server's guards
  const st = await raw("GET", "/api/state");
  const noHeader = await raw("POST", "/api/pair", { "Content-Type": "application/json" }, JSON.stringify({ code: card.code }));
  const evil = await raw("GET", "/", { Host: "evil.example.com" });
  const page0 = await raw("GET", "/");
  ok("server: not paired → 401; POST without the app header → 403; a foreign host name → 421; strict CSP", st.status === 401 && noHeader.status === 403 && evil.status === 421 && /default-src 'self'/.test(page0.headers["content-security-policy"] || ""), [st.status, noHeader.status, evil.status]);

  // the phone (a phone-sized window)
  await app.evaluate(({ BrowserWindow }) => { const w = new BrowserWindow({ width: 390, height: 844, show: true }); w.loadURL("http://localhost:8091/"); });
  const phone = await app.waitForEvent("window", { predicate: (w) => w.url().includes(":8091") || true, timeout: 20000 });
  await phone.waitForLoadState();
  await until(() => phone.evaluate(() => !!document.querySelector(".code-input")));
  await phone.screenshot({ path: path.join(OUT, "setup-phone-pair.png") });
  const wrong = card.code === "000000" ? "111111" : "000000";
  await phone.fill(".code-input", wrong);
  await until(() => phone.evaluate(() => /not the code/.test(document.querySelector(".pair-msg")?.textContent || "")));
  ok("phone: a wrong code is refused kindly", await phone.evaluate(() => /not the code/.test(document.querySelector(".pair-msg").textContent)));
  await phone.fill(".code-input", card.code);
  await until(() => phone.evaluate(() => !!document.querySelector("#family")));
  ok("phone: the right code opens the settings; the screen says the phone is connected", await phone.evaluate(() => document.querySelectorAll("section.card").length === 7) && /Phone connected/.test(await status()));
  await phone.screenshot({ path: path.join(OUT, "setup-phone-main.png"), fullPage: true });

  // edit: family name, a list, a private calendar link
  await phone.fill("#family input.input", "The Testers Too");
  await phone.click("#lists .add"); await h.sleep(400);
  await phone.fill(".sheet input.input", "Hardware");
  await phone.click(".sheet .btn.primary"); await h.sleep(400);
  await phone.click("#calendars .add"); await h.sleep(400);
  await phone.fill(".sheet input.input", "Grandma");
  await phone.fill(".sheet textarea", "https://calendar.example.com/private-abc123/basic.ics");
  await phone.screenshot({ path: path.join(OUT, "setup-phone-sheet.png") });
  await phone.click(".sheet .btn.primary"); await h.sleep(400);
  ok("phone: the new list and calendar show, with 'Unsaved changes'", await phone.evaluate(() => /Hardware/.test(document.querySelector("#lists").textContent) && /Grandma/.test(document.querySelector("#calendars").textContent) && /Unsaved/.test(document.querySelector(".bar").textContent)));
  await phone.click(".bar .btn.primary");
  await until(() => phone.evaluate(() => /Finish/.test(document.querySelector(".bar")?.textContent || "")));
  const S = JSON.parse(fs.readFileSync(path.join(OUT, "opensky.test.json"), "utf8"));
  const sec = JSON.parse(fs.readFileSync(path.join(OUT, "secrets.test.json"), "utf8"));
  ok("saved: settings updated (old copy kept), the private link only in secrets.json (chmod 600)",
    S.family.name === "The Testers Too" && S.lists.lists.some((l) => l.name === "Hardware") && S.calendar.sources.some((c) => c.name === "Grandma" && !c.url) &&
    sec.calendar.sources.Grandma === "https://calendar.example.com/private-abc123/basic.ics" && sec.calendar.sources.School && fs.existsSync(path.join(OUT, "opensky.test.json.bak")) &&
    (fs.statSync(path.join(OUT, "secrets.test.json")).mode & 0o777) === 0o600, { family: S.family.name });
  const state = await phone.evaluate(() => fetch("/api/state").then((r) => r.text()));
  ok("the phone is told WHICH secrets are set, never their values", /calendar\.sources\.Grandma/.test(state) && !/private-abc123/.test(state) && !/school\.ics/.test(state));
  ok("the screen follows along ('Saved!')", /Saved/.test(await status()));

  await phone.click(".bar .btn.primary");
  await until(() => phone.evaluate(() => /All set/.test(document.body.textContent)));
  await phone.screenshot({ path: path.join(OUT, "setup-phone-done.png") });
  await until(async () => /All done/.test(await status()));
  await h.sleep(500);
  const after = await raw("GET", "/");
  ok("Finish: the phone says All set, the screen says done, and the server is gone", /All done/.test(await status()) && after.status === 0, after.status);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.writableSettings = true;
