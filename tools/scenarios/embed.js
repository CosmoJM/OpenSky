// Embed pages: a public web page (Smart Home) and a PIN-locked one (Vault): loading, Back, the PIN pad, locking
// again on leaving / idle, the pause after 5 wrong PINs, and that the private address + PIN never reach the page config.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, tries = 30) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(300); return fn(); };
  const root = (key) => `.opensky-embed-${key} .oe-root`;
  const viewIn = (key) => page.evaluate((sel) => { const v = document.querySelector(sel + " webview"); return v ? v.getAttribute("src") : null; }, root(key));
  const inView = (key, js) => page.evaluate(([sel, js]) => { const v = document.querySelector(sel + " webview"); return v ? v.executeJavaScript(js).catch((e) => "ERR " + e.message) : null; }, [root(key), js]);
  const pin = async (digits) => { for (const d of digits) { await page.evaluate(([sel, d]) => document.querySelector(`${sel} .oe-key[data-k="${d}"]`).click(), [root("vault"), d]); await h.sleep(60); } };
  const msg = () => page.evaluate((sel) => document.querySelector(sel + " .oe-msg")?.textContent || "", root("vault"));

  // the page config (served to the whole network) has neither the vault's address nor its PIN
  const cfg = await page.evaluate(() => fetch("/config/").then((r) => r.text()));
  ok("network-visible config: no private address, no PIN", !cfg.includes("embed2.html") && !cfg.includes("2468") && cfg.includes("embed.html"));

  // public page
  await h.tap(".os-page-smarthome");
  await until(async () => (await inView("smarthome", "document.getElementById('hello')?.textContent")) === "Test dashboard");
  ok("Smart Home: the web page loads in the page", (await inView("smarthome", "document.getElementById('hello')?.textContent")) === "Test dashboard", await viewIn("smarthome"));
  // (a scripted click has no user gesture, so Chromium keeps it out of Back's history; a real tap counts — load instead)
  await page.evaluate((sel) => document.querySelector(sel + " webview").loadURL("http://localhost:8083/modules/opensky-fixtures/embed2.html"), root("smarthome"));
  await until(async () => (await inView("smarthome", "location.pathname")) === "/modules/opensky-fixtures/embed2.html");
  await page.evaluate((sel) => document.querySelector(sel + " .oe-back").click(), root("smarthome"));
  await until(async () => /embed\.html$/.test(await inView("smarthome", "location.pathname") || ""));
  ok("Back button goes back inside the page", /embed\.html$/.test(await inView("smarthome", "location.pathname") || ""));
  await h.shot("embed-smarthome");
  // a touch inside the embedded page counts as activity (otherwise the idle return would kick the user out)
  await page.evaluate(() => { MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].lastActivity = 0; });
  await inView("smarthome", "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1");
  await until(async () => page.evaluate(() => Date.now() - MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].lastActivity < 10000), 20);
  ok("a touch inside the web page keeps the screen from returning Home", await page.evaluate(() => Date.now() - MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].lastActivity < 10000));
  await h.tap(".os-page-home"); await h.sleep(400); await h.tap(".os-page-smarthome"); await h.sleep(400);
  ok("a page without a PIN stays loaded when you come back", (await inView("smarthome", "document.getElementById('hello')?.textContent")) === "Test dashboard");

  // PIN page
  await h.tap(".os-page-vault");
  await until(async () => page.evaluate((sel) => !!document.querySelector(sel + " .oe-pad"), root("vault")));
  ok("Vault: PIN pad first, nothing loaded", !!(await page.evaluate((sel) => document.querySelector(sel + " .oe-pad"), root("vault"))) && !(await viewIn("vault")));
  await h.shot("embed-pin");
  await pin("1111");
  await until(async () => /Wrong PIN/.test(await msg()));
  ok("wrong PIN → 'Wrong PIN', still locked", /Wrong PIN/.test(await msg()) && !(await viewIn("vault")), await msg());
  await pin("2468");
  await until(async () => !!(await viewIn("vault")));
  await until(async () => (await inView("vault", "document.getElementById('second')?.textContent")) === "Second page");
  ok("right PIN → the private page opens", (await inView("vault", "document.getElementById('second')?.textContent")) === "Second page");
  await h.tap(".os-page-home"); await h.sleep(500);
  ok("leaving the page locks it and removes the page", !(await viewIn("vault")) && await page.evaluate((sel) => !!document.querySelector(sel + " .oe-pad"), root("vault")));
  await h.tap(".os-page-vault"); await h.sleep(300); await pin("2468");
  await until(async () => !!(await viewIn("vault")));
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_IDLE_RESET"));
  await h.sleep(500);
  ok("idle reset locks it too", !(await viewIn("vault")));
  await h.tap(".os-page-vault"); await h.sleep(300);
  for (let i = 0; i < 5; i++) { await pin("9999"); await h.sleep(300); }
  await until(async () => /wait/.test(await msg()));
  const m = await msg();
  await pin("2468"); await h.sleep(800);
  ok("5 wrong PINs → a pause (even the right PIN waits)", /Too many tries — wait \d+ s/.test(m) && !(await viewIn("vault")), m);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
