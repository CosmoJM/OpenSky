// Sidebar: tiles from settings, active highlight, soft sleep (no screen service) + wake.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const tiles = await page.evaluate(() => [...document.querySelectorAll(".os-tile")].map((t) => ({ key: t.dataset.key, label: t.textContent.trim(), active: t.classList.contains("active") })));
  ok("tiles = the configured pages + Sleep + Settings", JSON.stringify(tiles.map((t) => t.key)) === JSON.stringify(["page-home", "page-calendar", "page-lists", "page-smarthome", "page-vault", "page-wordgame", "page-timer", "sleep", "settings"]), tiles);
  ok("first page tile is highlighted", tiles[0].active);
  ok("Home tile shows the family initial", await page.evaluate(() => document.querySelector(".os-page-home .os-badge")?.textContent === "T"));
  await h.tap(".os-page-timer"); await h.sleep(600);
  ok("tapping a tile switches page + highlight", await page.evaluate(() => document.querySelector(".os-page-timer").classList.contains("active") && !!document.querySelector(".timer-setup-screen").getBoundingClientRect().width));
  const content = await page.evaluate(() => { const b = document.querySelector(".timer-wrapper").getBoundingClientRect(), s = document.querySelector(".os-side-wrap").getBoundingClientRect(); return { contentLeft: Math.round(b.left), sideRight: Math.round(s.right) }; });
  ok("page content starts right of the sidebar", content.contentLeft >= content.sideRight, content);
  await h.shot("sidebar");

  // soft sleep
  await h.tap(".os-sleep"); await h.sleep(400);
  const cover = () => page.evaluate(() => { const c = document.querySelector(".os-sleep-cover"); if (!c || c.hidden) return null; const at = document.elementFromPoint(960, 540); return { top: at === c, z: getComputedStyle(c).zIndex }; });
  let c = await cover();
  ok("Sleep → black cover on top of everything", c && c.top, c);
  // a tap where the Start button is must NOT start a timer
  const start = await h.box(".timer-start-btn");
  await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2); await h.sleep(800);
  ok("waking tap wakes the screen", (await cover()) === null);
  ok("…and doesn't press the button under it", await page.evaluate(() => !document.querySelector(".timer-display")));
  // keyboard wakes too
  await h.tap(".os-sleep"); await h.sleep(300); await page.keyboard.press("Space"); await h.sleep(700);
  ok("a key press wakes it too", (await cover()) === null);

  // a timer that finishes while the screen sleeps wakes it
  await page.evaluate(() => { document.getElementById("timer-seconds").value = "3"; });
  await h.tap(".timer-start-btn"); await h.sleep(300);
  await h.tap(".os-sleep"); await h.sleep(500);
  const asleep = (await cover()) !== null;
  await h.sleep(4200);
  ok("a finished timer wakes the screen (banner visible)", asleep && (await cover()) === null && await page.evaluate(() => !document.querySelector(".timer-banner").hidden));
  await h.tap(".timer-banner-stop"); await h.sleep(300);

  // every tile can really be tapped in its middle (nothing from the header or a page lies on top of it)
  const blocked = await page.evaluate(() => [...document.querySelectorAll(".os-side-col > *")].filter((t) => t.getBoundingClientRect().width).map((t) => {
    const r = t.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return t.contains(e) ? null : `${t.className} ← ${e && (e.closest(".module")?.className || e.className)}`;
  }).filter(Boolean));
  ok("every sidebar tile is tappable in its middle", blocked.length === 0, blocked);
  await h.tap(".os-page-timer"); await h.sleep(500); await h.tap(".os-page-home"); await h.sleep(600);
  ok("tapping Home from another page goes Home", await page.evaluate(() => document.querySelector(".os-page-home").classList.contains("active") || !MM.getModules().withClass("MMM-OpenSky-Home")[0].hidden));

  // accent colour: peach by default; look.accent recolours buttons and highlights everywhere
  const acc = await page.evaluate(() => {
    const css = () => getComputedStyle(document.documentElement).getPropertyValue("--os-accent").trim();
    const add = () => getComputedStyle(document.querySelector(".hd-add")).backgroundColor;
    const before = { v: css(), add: add() };
    MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].applyAccent("teal");
    const after = { v: css(), add: add() };
    ["--os-accent", "--os-accent-mid", "--os-accent-light", "--os-accent-soft", "--os-accent-tint", "--os-accent-dark"].forEach((p) => document.documentElement.style.removeProperty(p));
    return { before, after };
  });
  ok("accent colour: peach by default, a palette name recolours the buttons", /e8663f/i.test(acc.before.v) && acc.after.v === "#11998e" && acc.after.add !== acc.before.add, acc);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
