// Finger-like taps (press, hold 250 ms, lift at the same spot) on popup buttons while the on-screen keyboard is open.
// A user's "Add" did nothing on a touchscreen (Return worked): pressing the button took the focus off the text box,
// the keyboard closed, the popup slid down under the finger, and the finger was lifted over something else.
// The other scenarios tap instantly, before anything moves — which is why they never saw it.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, n = 25) => { for (let i = 0; i < n && !(await fn()); i++) await h.sleep(200); return fn(); };
  const kbOpen = () => page.evaluate(() => document.body.classList.contains("kb-open"));
  // press the button found by fn, hold, lift; returns where it was under the finger while held
  const fingerTap = async (find) => {
    const at = await page.evaluate(find);
    if (!at) return { err: "no button" };
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await h.sleep(250);
    const held = await page.evaluate(([x, y]) => ({ kb: document.body.classList.contains("kb-open"), under: (document.elementFromPoint(x, y) || {}).className || "" }), [at.x, at.y]);
    await page.mouse.up(); await h.sleep(600);
    return held;
  };
  const centre = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.querySelectorAll(".hd-lists .lc-add-item").length)); i++) await h.sleep(500);

  // 1. a list's "Add to …" popup → Add
  await h.tap(".hd-lists .lc-add-item"); await until(kbOpen);
  await page.evaluate(() => { document.querySelector(".osl-input").value = "Bread"; });
  let held = await fingerTap(() => { const b = [...document.querySelectorAll(".osl-btn")].find((x) => x.textContent === "Add"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ok("list popup: a finger on Add keeps the keyboard and the button in place, and the item is added", held.kb && /osl-btn/.test(held.under) && await page.evaluate(() => !document.querySelector(".osl-overlay") && [...document.querySelectorAll(".hd-lists .lc-item-text")].some((x) => x.textContent === "Bread")), held);

  // 2. editing an item → Save
  await page.evaluate(() => [...document.querySelectorAll(".hd-lists .lc-item")].find((r) => r.textContent.includes("Bread")).querySelector(".lc-item-text").click());
  await until(kbOpen);
  await page.evaluate(() => { document.querySelector(".osl-input").value = "Brown bread"; });
  held = await fingerTap(() => { const b = [...document.querySelectorAll(".osl-btn")].find((x) => x.textContent === "Save"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ok("edit popup: a finger on Save keeps it in place and saves", held.kb && await until(() => page.evaluate(() => [...document.querySelectorAll(".hd-lists .lc-item-text")].some((x) => x.textContent === "Brown bread"))), held);

  // 3. the event editor (Add Event) → the Add / Save button
  await h.tap(".hd-add"); await h.sleep(500);
  await page.evaluate(() => document.getElementById("event-title").focus());
  await until(kbOpen);
  await page.evaluate(() => { const t = document.getElementById("event-title"); t.value = "Finger test"; t.dispatchEvent(new Event("input", { bubbles: true })); });
  // (with the keyboard open the editor fits above it; its buttons are a scroll down inside it, as a person would)
  await page.evaluate(() => [...document.querySelectorAll(".event-btn-primary")].pop().scrollIntoView({ block: "nearest" })); await h.sleep(400);
  held = await fingerTap(() => { const b = [...document.querySelectorAll(".event-btn-primary")].pop(); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ok("event editor: a finger on the save button keeps it in place and the event is added", held.kb && await until(() => page.evaluate(() => [...document.querySelectorAll(".hd-week .hd-event")].some((e) => e.textContent.includes("Finger test")))), held);

  // 4. a press that starts inside a popup and ends on its background doesn't close it; a tap on the background does
  await h.tap(".hd-lists .lc-add-item"); await until(kbOpen);
  const title = await page.evaluate(() => { const r = document.querySelector(".osl-title").getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; });
  await page.mouse.move(title.x, title.y); await page.mouse.down(); await page.mouse.move(20, 1060, { steps: 4 }); await page.mouse.up(); await h.sleep(400);
  const stillOpen = await page.evaluate(() => !!document.querySelector(".osl-overlay"));
  await page.mouse.click(20, 1060); await h.sleep(500);
  ok("a press from inside the popup lifted on the background keeps it open; a tap on the background closes it", stillOpen && !(await page.evaluate(() => !!document.querySelector(".osl-overlay"))));

  // 5. Settings → add a web page: a finger on Save with the keyboard open
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN")); await h.sleep(800);
  await page.evaluate(() => document.querySelector(".ost-add-web").click()); await h.sleep(400);
  await page.evaluate(() => { const t = document.querySelector('[data-wf="title"]'); t.focus(); t.value = "Finger"; t.dispatchEvent(new Event("input")); const u = document.querySelector('[data-wf="url"]'); u.value = "http://localhost:8083/modules/opensky-fixtures/embed.html"; u.dispatchEvent(new Event("input")); t.focus(); });
  await until(kbOpen);
  await page.evaluate(() => document.querySelector(".ost-wf-save").scrollIntoView({ block: "nearest" })); await h.sleep(400);
  held = await fingerTap(() => { const b = document.querySelector(".ost-wf-save"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  ok("Settings web page form: a finger on Save keeps it in place and saves", held.kb && /ost-wf-save/.test(held.under) && await until(() => page.evaluate(() => !!document.querySelector('.ost-edit-web[data-key="finger"]'))), held);
  await page.evaluate(() => document.querySelector(".ost-x")?.click()); await h.sleep(400);

  // 6. Cancel still closes the popup and the keyboard
  await h.tap(".hd-lists .lc-add-item"); await until(kbOpen);
  await page.evaluate(() => [...document.querySelectorAll(".osl-btn")].find((x) => x.textContent === "Cancel").click());
  await h.sleep(500);
  ok("Cancel closes the popup and the keyboard", !(await kbOpen()) && !(await page.evaluate(() => !!document.querySelector(".osl-overlay"))));

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};

module.exports.writableSettings = true;   // (Settings → web page saves: a copy, never the fixtures)
