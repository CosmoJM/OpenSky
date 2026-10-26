// Accent color code in Settings, used like a person would: real taps on the on-screen keyboard to type a code
// ("#", digits on the 123 page, letters), a finger-hold on Use; a very light color warns; a bad code is refused; a
// settings file with something that isn't a color can't put markup into the panel.
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "out");
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, n = 25) => { for (let i = 0; i < n && !(await fn()); i++) await h.sleep(200); return fn(); };
  const S = () => JSON.parse(fs.readFileSync(path.join(OUT, "opensky.test.json"), "utf8"));
  const centre = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  const tap = async (sel, hold = 60) => { const c = await centre(sel); if (!c) throw new Error(`nothing at ${sel}`); await page.mouse.move(c[0], c[1]); await page.mouse.down(); await h.sleep(hold); await page.mouse.up(); await h.sleep(120); };
  const key = (k) => tap(`.okb-key[data-key="${k}"]`);
  const settle = async () => { let last = null; for (let i = 0; i < 20; i++) { const t = await page.evaluate(() => document.querySelector(".okb")?.getBoundingClientRect().top); if (t === last) break; last = t; await h.sleep(100); } };
  const typeCode = async (code) => {
    await tap(".ost-hex"); await until(() => page.evaluate(() => document.body.classList.contains("kb-open"))); await settle();
    await page.evaluate(() => { const i = document.querySelector(".ost-hex"); i.value = ""; i.dispatchEvent(new Event("input")); });
    let layer = "letters";
    for (const ch of code) {
      const want = /[0-9#]/.test(ch) ? "numbers" : "letters";
      if (want !== layer) { await key(want === "numbers" ? "{numbers}" : "{letters}"); layer = want; }
      await key(ch);
    }
    return page.evaluate(() => document.querySelector(".ost-hex").value);
  };
  const open = async () => { await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN")); await until(() => page.evaluate(() => !!document.querySelector(".ost-hex"))); await page.evaluate(() => document.querySelector(".ost-hex").scrollIntoView({ block: "center" })); await h.sleep(300); };

  await open();
  const typed = await typeCode("#3b82f6");
  ok("typed on the on-screen keyboard (# and digits on the 123 page, letters), no capital at the start", typed === "#3b82f6", typed);
  const sw = await page.evaluate(() => getComputedStyle(document.querySelector(".ost-swatch")).getPropertyValue("--c").trim());
  ok("the swatch shows the color while typing", sw === "#3b82f6", sw);
  await tap(".ost-hex-use", 250);   // a finger
  await until(() => S().look && S().look.accent === "#3b82f6");
  const acc = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--os-accent").trim());
  ok("Use (a finger, keyboard open): saved as #3b82f6, the screen's accent changes, the keyboard closes",
    (S().look || {}).accent === "#3b82f6" && acc === "#3b82f6" && !(await page.evaluate(() => document.body.classList.contains("kb-open"))), { saved: (S().look || {}).accent, acc });
  ok("the custom color gets its own chip, selected", await page.evaluate(() => !!document.querySelector('.ost-chip.on[data-accent="#3b82f6"]')));

  // a very light color warns (white button text); a code that isn't one is refused and nothing changes
  await page.evaluate(() => { const i = document.querySelector(".ost-hex"); i.value = "fff"; i.dispatchEvent(new Event("input")); });
  ok("a very light color warns about white button text", await page.evaluate(() => /very light/.test(document.querySelector(".ost-hex-note").textContent)));
  await page.evaluate(() => { const i = document.querySelector(".ost-hex"); i.value = "#12zz45"; i.dispatchEvent(new Event("input")); document.querySelector(".ost-hex-use").click(); });
  await h.sleep(600);
  ok("a bad code is refused (a message), the saved color stays", (S().look || {}).accent === "#3b82f6" && await page.evaluate(() => /color code/i.test(document.querySelector(".os-toast")?.textContent || "")));

  // back to a palette chip
  await tap('.ost-chip[data-accent="teal"]');
  await until(() => S().look && S().look.accent === "teal");
  ok("a palette chip after a code: saved by name, accent follows", (S().look || {}).accent === "teal" && (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--os-accent").trim())) === "#11998e");
  await page.evaluate(() => document.querySelector(".ost-x")?.click()); await h.sleep(300);

  // a settings file with something that isn't a color: no markup reaches the panel
  const s = S(); s.look = { accent: '#"><img src=x onerror="window.__pwned=1">' }; fs.writeFileSync(path.join(OUT, "opensky.test.json"), JSON.stringify(s));
  await open(); await h.sleep(500);
  ok("a non-color accent in the settings file can't put markup into Settings (shown as the default)", await page.evaluate(() => !window.__pwned && !document.querySelector(".ost-root img, .ost-overlay img") && !!document.querySelector('.ost-chip.on[data-accent="peach"]')));

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.writableSettings = true;
