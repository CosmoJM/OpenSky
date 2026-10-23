// Lists on a fresh install (the example settings: To-Dos + Groceries, no lists file yet), used like a person would:
// a real tap on each list's "Add item" (on Home and on the Lists page), typing on the on-screen keyboard, a tap on Add —
// at a few screen sizes. (A user reported that adding to Groceries didn't work.)
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "out", "lists.test.json");
fs.rmSync(FILE, { force: true });   // no lists file yet (sample items may still appear; the checks only count the typed ones)

module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const centre = (sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
  const tapAt = async (xy) => { await page.mouse.click(xy[0], xy[1]); await h.sleep(150); };
  const results = [], typedInto = { "To-Dos": [], Groceries: [] };
  let n = 0;
  for (const [w, hh] of [[1920, 1080], [1280, 720], [1024, 600]]) {
    await page.setViewportSize({ width: w, height: hh }); await h.sleep(1200);
    for (const [pageTile, scope] of [[".os-page-home", ".hd-lists"], [".os-page-lists", ".lp-root"]]) {
      await tapAt(await centre(pageTile)); await h.sleep(1200);
      for (const name of ["To-Dos", "Groceries"]) {
        const text = `Item ${++n}`;
        const btn = await page.evaluate(([sc, l]) => {
          const c = [...document.querySelectorAll(`${sc} .lc-list`)].find((x) => x.querySelector(".lc-list-title").textContent === l);
          if (!c) return { err: "no column" };
          const b = c.querySelector(".lc-add-item").getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
          const at = document.elementFromPoint(x, y);
          return at && at.closest(".lc-add-item") === c.querySelector(".lc-add-item") ? { x, y } : { err: `covered by ${at && at.className}` };
        }, [scope, name]);
        if (btn.err) { results.push(`${w}×${hh} ${scope} ${name}: Add item ${btn.err}`); continue; }
        await tapAt([btn.x, btn.y]); await h.sleep(400);
        let last = null;   // (the keyboard slides up: wait until it stands still before tapping keys)
        for (let i = 0; i < 20; i++) { const t = await page.evaluate(() => document.querySelector(".okb")?.getBoundingClientRect().top); if (t === last) break; last = t; await h.sleep(100); }
        for (const ch of text) {
          const k = ch === " " ? "{space}" : /\d/.test(ch) ? null : ch.toLowerCase();
          if (/\d/.test(ch)) { await tapAt(await centre('.okb-key[data-key="{numbers}"]')); await tapAt(await centre(`.okb-key[data-key="${ch}"]`)); await tapAt(await centre('.okb-key[data-key="{letters}"]')); continue; }
          await tapAt(await centre(`.okb-key[data-key="${k}"]`));
        }
        const add = await page.evaluate(() => {
          const b = [...document.querySelectorAll(".osl-btn")].find((x) => x.textContent === "Add"); if (!b) return { err: "no Add button" };
          const r = b.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return b.contains(at) ? { x: r.x + r.width / 2, y: r.y + r.height / 2, typed: document.querySelector(".osl-input").value } : { err: `Add covered by ${at && at.className}` };
        });
        if (add.err) { results.push(`${w}×${hh} ${scope} ${name}: ${add.err}`); await page.evaluate(() => [...document.querySelectorAll(".osl-btn")].find((b) => b.textContent === "Cancel")?.click()); continue; }
        typedInto[name].push(add.typed);
        await tapAt([add.x, add.y]); await h.sleep(1200);
        const shown = await page.evaluate(([sc, l, t]) => !document.querySelector(".osl-overlay") && [...document.querySelectorAll(`${sc} .lc-list`)].find((x) => x.querySelector(".lc-list-title").textContent === l).textContent.includes(t), [scope, name, add.typed]);
        const stored = ((JSON.parse(fs.readFileSync(FILE, "utf8")).lists || {})[name] || []).map((x) => x.text);
        if (!shown || !stored.includes(add.typed)) results.push(`${w}×${hh} ${scope} ${name}: typed "${add.typed}", shown=${shown}, saved=${stored.includes(add.typed)}`);
      }
    }
  }
  ok("To-Dos and Groceries: real taps add items on Home and the Lists page at 1920×1080, 1280×720 and 1024×600", results.length === 0, results);
  const stored = JSON.parse(fs.readFileSync(FILE, "utf8")).lists;
  const saved = (l) => (stored[l] || []).map((x) => x.text);
  ok("all 12 items saved on the Pi, each in the list it was added to (typed on the on-screen keyboard)",
    typedInto["To-Dos"].length === 6 && typedInto.Groceries.length === 6 && typedInto["To-Dos"].every((t) => t && saved("To-Dos").includes(t) && !saved("Groceries").includes(t)) &&
    typedInto.Groceries.every((t) => t && saved("Groceries").includes(t) && !saved("To-Dos").includes(t)), { typedInto, "To-Dos": saved("To-Dos"), Groceries: saved("Groceries") });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => {   // the example settings' lists (what a fresh install has)
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "config", "opensky.example.json"), "utf8"));
  s.lists = ex.lists;
};
