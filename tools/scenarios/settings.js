// Settings panel (test mode: OPENSKY_DRY_RUN=1 — nothing real is touched): brightness, evening dim, sleep schedule,
// sound, status, confirm-twice system buttons, and the night schedule putting the screen to sleep and waking it.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const fs = require("fs"), path = require("path");
  const saved = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "device.test.json"), "utf8")); } catch (e) { return null; } };
  const until = async (fn, tries = 20) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(250); return fn(); };
  const slide = (id, v) => page.evaluate(([id, v]) => { const el = document.querySelector(`.ost-slider[data-id="${id}"]`); el.value = v; el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); }, [id, v]);
  const open = () => page.evaluate(() => !!document.querySelector(".ost-overlay:not([hidden]) .ost-panel"));
  // wait until every change has its reply and the panel has redrawn (taps go by position; the layout must be settled)
  const settled = () => until(async () => page.evaluate(() => !MM.getModules().withClass("MMM-OpenSky-Settings")[0].inflight));
  const asleep = () => page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].isAsleep());

  ok("sidebar has a Settings tile", !!(await h.box(".os-settings")) || !!(await page.$("[class*='settings']")));
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN"));
  await until(open);
  await until(async () => page.evaluate(() => !!document.querySelector(".ost-prefs .ost-section")));
  const secs = await page.evaluate(() => [...document.querySelectorAll(".ost-section h3")].map((x) => x.textContent));
  ok("panel opens with Screen / Sleep / Sound / Pages / Look & extras / Backups / System", JSON.stringify(secs) === JSON.stringify(["Screen", "Sleep at night", "Sound", "Pages", "Look & extras", "Backups", "System"]), secs);
  ok("brightness method explained (no hardware here → dims the picture)", await page.evaluate(() => /Dims the picture/.test(document.querySelector(".ost-note").textContent)));

  await slide("brightness", 40);
  await until(async () => saved() && saved().brightness === 40);
  await h.sleep(700);   // (the dim fades in)
  const dim = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".ost-dim")).opacity).toFixed(2));
  ok("brightness 40% → saved, picture dimmed (software)", saved().brightness === 40 && Math.abs(dim - 0.6) < 0.05, { saved: saved().brightness, dim });

  await settled(); await h.tap('.ost-toggle[data-id="dim"]');
  await until(async () => saved().eveningDim.enabled); await settled();
  await page.evaluate(() => document.querySelector('.ost-stepper[data-id="dimFrom"] .ost-step[data-d="15"]').click());
  await until(async () => saved().eveningDim.from === "19:15");
  ok("evening dim on + its time steps by 15 min", saved().eveningDim.enabled && saved().eveningDim.from === "19:15" && await page.evaluate(() => /7:15/.test(document.querySelector('.ost-stepper[data-id="dimFrom"] .ost-time').textContent)), saved().eveningDim);

  await settled(); await h.tap('.ost-toggle[data-id="sleep"]');
  await until(async () => saved().sleep.enabled); await settled();
  for (let i = 0; i < 4; i++) { await page.evaluate(() => document.querySelector('.ost-stepper[data-id="sleepOff"] .ost-step[data-d="-15"]').click()); await h.sleep(150); }
  await until(async () => saved().sleep.off === "21:00");
  ok("sleep schedule on; off time 10 PM → 9 PM", saved().sleep.enabled && saved().sleep.off === "21:00" && saved().sleep.on === "06:30", saved().sleep);

  await slide("volume", 30);
  await page.evaluate(() => { window.__chime = 0; const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; t.playChime = () => { window.__chime++; }; });
  await h.tap(".ost-test"); await h.sleep(200);
  const vol = await page.evaluate(() => [document.querySelector('.ost-value[data-for="volume"]').textContent, window.__chime, document.querySelectorAll(".ost-section")[2].textContent]);
  ok("volume slider + Test plays the timer chime; speaker named", vol[0] === "30%" && vol[1] === 1 && /Test speaker/.test(vol[2]), vol);

  await until(async () => page.evaluate(() => /up to date/.test(document.querySelector(".ost-status").textContent)));
  const stat = await page.evaluate(() => document.querySelector(".ost-status").textContent);
  ok("status: internet, address, version", /Internet/.test(stat) && /Address/.test(stat) && /up to date/.test(stat), stat);

  await page.evaluate(() => document.querySelector('[data-act="shutdown"]').click()); await h.sleep(200);
  const first = await page.evaluate(() => document.querySelector('[data-act="shutdown"]').textContent);
  await page.evaluate(() => document.querySelector('[data-act="shutdown"]').click());
  const t = await until(async () => page.evaluate(() => document.querySelector(".os-toast.show")?.textContent));
  ok("Shut down asks 'Tap again' first; then runs (test mode: nothing happens)", first === "Tap again to shut down" && /test mode/.test(t || ""), { first, t });
  await h.shot("settings");

  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_IDLE_RESET")); await h.sleep(200);
  ok("idle reset closes the panel", !(await open()));

  // ---- the night schedule (clock times passed in; off 21:00, on 06:30) ----
  const at = (hh, mm) => page.evaluate(([hh, mm]) => { const d = new Date(); d.setHours(hh, mm, 0, 0); MM.getModules().withClass("MMM-OpenSky-Settings")[0].checkSchedule(d); }, [hh, mm]);
  await at(20, 59); await at(20, 59.5); await h.sleep(300);
  ok("evening, before 9 PM: awake", !(await asleep()));
  await page.evaluate(() => { const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; t.__timers = t.timers; t.timers = [{}]; });
  await at(21, 0); await h.sleep(300);
  ok("9 PM with a timer running: stays awake", !(await asleep()));
  await page.evaluate(() => { const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; t.timers = t.__timers || []; });
  await at(20, 59); await at(21, 0); await h.sleep(500);
  ok("9 PM: the screen sleeps", await asleep());
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].wake()); await h.sleep(600);
  await at(22, 0); await h.sleep(300);
  ok("woken at night: stays on while being used", !(await asleep()));
  await page.evaluate(() => { const sb = MM.getModules().withClass("MMM-OpenSky-Sidebar")[0]; sb.lastActivity = Date.now() - 4 * 60 * 1000; });
  await at(22, 5); await h.sleep(500);
  ok("…and sleeps again after 3 quiet minutes", await asleep());
  await at(6, 30); await h.sleep(800);
  ok("6:30 AM: wakes up", !(await asleep()));

  // ---- pages, look & extras, backups (the same settings as the phone page) ----
  const S = () => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "opensky.test.json"), "utf8"));
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN"));
  await until(async () => page.evaluate(() => document.querySelectorAll(".ost-page").length > 3));
  const before = S().pages;
  await page.evaluate(() => document.querySelector('.ost-page[data-page="wordgame"] .ost-toggle').click());
  await until(async () => !S().pages.includes("wordgame"));
  ok("Pages: switch one off on the screen → saved, 'Restart now' offered", !S().pages.includes("wordgame") && before.includes("wordgame") && await until(async () => page.evaluate(() => !!document.querySelector(".ost-restart"))), S().pages);
  await page.evaluate(() => document.querySelector('.ost-page[data-page="lists"] [data-move="-1"]').click());
  await until(async () => S().pages.indexOf("lists") < before.indexOf("lists"));
  ok("Pages: move one up", S().pages.indexOf("lists") === before.indexOf("lists") - 1, S().pages);
  await page.evaluate(() => document.querySelector('[data-accent="teal"]').click());
  await until(async () => S().look && S().look.accent === "teal");
  ok("accent color from the screen: saved and applied at once", S().look.accent === "teal" && await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--os-accent").trim()) === "#11998e");
  // any color as a code, typed with the on-screen keyboard (no # needed, any case): previewed, then saved + applied
  const css = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--os-accent").trim());
  await page.evaluate(() => document.querySelector(".ost-hex").scrollIntoView({ block: "center" })); await h.sleep(300);
  await h.tap(".ost-hex"); await h.sleep(300);
  await h.shot("settings-accent-code");
  for (const k of ["{numbers}", "1", "{letters}", "d", "{numbers}", "4", "{letters}", "e", "d", "{numbers}", "8"]) await h.tap(`.okb-key[data-key="${k}"]`);
  const typed = await page.evaluate(() => ({ v: document.querySelector(".ost-hex").value, sw: document.querySelector(".ost-swatch").style.getPropertyValue("--c"), empty: document.querySelector(".ost-swatch").classList.contains("empty") }));
  await h.tap(".ost-hex-use");
  await until(async () => S().look && S().look.accent === "#1d4ed8");
  ok("accent color code: typed on the on-screen keyboard, previewed, Use → saved as #rrggbb and applied at once", typed.v === "1d4ed8" && typed.sw === "#1d4ed8" && !typed.empty &&
    S().look.accent === "#1d4ed8" && await css() === "#1d4ed8", typed);
  await until(async () => page.evaluate(() => !!document.querySelector('.ost-chip.on[data-accent="#1d4ed8"]')));
  ok("…and it shows as the chosen chip, with the code still in the box", await page.evaluate(() => !!document.querySelector('.ost-chip.on[data-accent="#1d4ed8"]') && document.querySelector(".ost-hex").value === "#1d4ed8"));
  await page.evaluate(() => { const i = document.querySelector(".ost-hex"); i.value = "#ffffe0"; i.dispatchEvent(new Event("input")); });
  ok("a very light color gets a warning before it's used", await page.evaluate(() => /very light/.test(document.querySelector(".ost-hex-note").textContent)));
  await page.evaluate(() => { const i = document.querySelector(".ost-hex"); i.value = "#12zz45"; i.dispatchEvent(new Event("input")); document.querySelector(".ost-hex-use").click(); });
  await h.sleep(400);
  ok("a code that isn't a color is refused (a message; nothing saved)", S().look.accent === "#1d4ed8" && await page.evaluate(() => /color code like/.test(document.querySelector(".os-toast")?.textContent || "")) && await css() === "#1d4ed8");
  await page.evaluate(() => document.querySelector('[data-accent="teal"]').click());
  await until(async () => S().look && S().look.accent === "teal");
  const places = await page.evaluate(() => [...document.querySelectorAll('[data-backup="destination"] option')].map((o) => o.textContent));
  ok("backups: the places this Pi can write to are listed (here: a network folder + the home folder)", places.some((t) => /Network folder/.test(t)) && places.some((t) => /home folder/.test(t)), places);
  const nas = path.join(__dirname, "..", "out", "fake-nas");
  await page.evaluate((v) => { const s = document.querySelector('[data-backup="destination"]'); s.value = v; s.dispatchEvent(new Event("change")); }, nas);
  await until(async () => S().backup && S().backup.destination === nas);
  await until(async () => page.evaluate(() => !!document.querySelector(".ost-backup-now")));
  await page.evaluate(() => document.querySelector(".ost-backup-now").click());
  await until(() => fs.existsSync(path.join(nas, "OpenSky-backups")) && fs.readdirSync(path.join(nas, "OpenSky-backups")).length > 0);
  const bfile = fs.readdirSync(path.join(nas, "OpenSky-backups"))[0];
  const bdata = JSON.parse(fs.readFileSync(path.join(nas, "OpenSky-backups", bfile), "utf8"));
  ok("Back up now → a backup on the network folder (no passwords unless switched on)", /^opensky-backup-\d{4}-\d\d-\d\d\.json$/.test(bfile) && bdata.opensky === "backup" && !bdata.secrets, bfile);
  // ---- add your own web page (name, address, icon, optional PIN) ----
  const SEC = () => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "secrets.test.json"), "utf8"));
  const fillWf = (k, v) => page.evaluate(([k, v]) => { const el = document.querySelector(`[data-wf="${k}"]`); el.value = v; el.dispatchEvent(new Event("input")); }, [k, v]);
  await page.evaluate(() => document.querySelector(".ost-add-web").click());
  await until(async () => page.evaluate(() => !!document.querySelector(".ost-webform")));
  const icons = await page.evaluate(() => document.querySelectorAll(".ost-webform .ost-icon").length);
  await page.evaluate(() => document.querySelector(".ost-wf-save").click()); await h.sleep(200);
  const emptyErr = await page.evaluate(() => document.querySelector(".ost-err").textContent);
  await fillWf("title", "Recipes"); await fillWf("url", "http://localhost:8083/modules/opensky-fixtures/embed.html");
  await page.evaluate(() => document.querySelector('.ost-icon[data-icon="food"]').click());
  await page.evaluate(() => document.querySelector(".ost-wf-save").click());
  await until(async () => S().embeds && S().embeds.recipes);
  const rec = S().embeds.recipes;
  ok("Add a web page on the screen: name + address + icon → its own page in the sidebar (before Timer)", icons === 16 && /name/.test(emptyErr) && rec.title === "Recipes" && rec.icon === "food" && /embed\.html$/.test(rec.url) && S().pages.includes("recipes") && S().pages.indexOf("recipes") < S().pages.indexOf("timer"), { rec, pages: S().pages, emptyErr });
  await until(async () => page.evaluate(() => !!document.querySelector('.ost-edit-web[data-key="recipes"]')));
  await page.evaluate(() => document.querySelector('.ost-edit-web[data-key="recipes"]').click());
  await until(async () => page.evaluate(() => !!document.querySelector(".ost-webform")));
  await page.evaluate(() => document.querySelector('.ost-toggle[data-id="wf-lock"]').click());
  await fillWf("pin", "2580");
  await page.evaluate(() => document.querySelector(".ost-wf-save").click());
  await until(async () => (SEC().embeds || {}).recipes && !S().embeds.recipes.url);   // (both files are written; wait for the second)
  ok("lock it with a PIN: the address moves to secrets.json with the PIN; opensky.json keeps only name + icon", SEC().embeds.recipes.pin === "2580" && /embed\.html$/.test(SEC().embeds.recipes.url) && !S().embeds.recipes.url && S().embeds.recipes.icon === "food", { set: S().embeds.recipes });
  await until(async () => page.evaluate(() => !!document.querySelector('.ost-edit-web[data-key="recipes"]')));
  await page.evaluate(() => document.querySelector('.ost-edit-web[data-key="recipes"]').click());
  await until(async () => page.evaluate(() => !!document.querySelector(".ost-webform")));
  await page.evaluate(() => document.querySelector('.ost-toggle[data-id="wf-lock"]').click());
  await page.evaluate(() => document.querySelector(".ost-wf-save").click());
  await until(async () => S().embeds.recipes.url);
  ok("PIN off again: the address comes back to opensky.json, nothing left in secrets", /embed\.html$/.test(S().embeds.recipes.url) && !(SEC().embeds || {}).recipes);
  await until(async () => page.evaluate(() => !!document.querySelector('.ost-edit-web[data-key="recipes"]')));
  await page.evaluate(() => document.querySelector('.ost-edit-web[data-key="recipes"]').click());
  await until(async () => page.evaluate(() => !!document.querySelector(".ost-wf-remove")));
  await page.evaluate(() => document.querySelector(".ost-wf-remove").click());
  await page.evaluate(() => document.querySelector(".ost-wf-remove").click());
  await until(async () => !S().embeds.recipes);
  ok("Remove (tap twice): gone from the sidebar and the settings", !S().embeds.recipes && !S().pages.includes("recipes"));
  await h.shot("settings-webpage");

  await page.evaluate(() => document.querySelector(".ost-x").click());
  await page.evaluate(() => { const sb = MM.getModules().withClass("MMM-OpenSky-Sidebar")[0]; ["--os-accent", "--os-accent-mid", "--os-accent-light", "--os-accent-soft", "--os-accent-tint", "--os-accent-dark"].forEach((p) => document.documentElement.style.removeProperty(p)); });

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.writableSettings = true;   // the Settings panel saves to opensky.json
module.exports.env = (() => {
  const out = require("path").join(__dirname, "..", "out"), fs = require("fs");
  const nas = require("path").join(out, "fake-nas");
  fs.rmSync(nas, { recursive: true, force: true }); fs.mkdirSync(nas, { recursive: true });
  fs.mkdirSync(require("path").join(out, "backup-home"), { recursive: true });
  fs.writeFileSync(require("path").join(out, "mounts.test"), `//nas/family ${nas} cifs rw 0 0\n/dev/mmcblk0p2 / ext4 rw 0 0\n`);
  fs.rmSync(require("path").join(out, "backup-status.test.json"), { force: true });
  return { OPENSKY_MOUNTS: require("path").join(out, "mounts.test"), OPENSKY_GVFS: require("path").join(out, "no-gvfs"),
    OPENSKY_BACKUP_HOME: require("path").join(out, "backup-home"), OPENSKY_BACKUP_STATUS: require("path").join(out, "backup-status.test.json") };
})();
