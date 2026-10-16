// Word game: today's puzzle, guesses checked on the Pi (the page never sees the answer while playing), colours,
// the keyboard, errors, winning, stats.
module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const fs = require("fs"), path = require("path");
  const W = path.join(__dirname, "..", "..", "modules", "MMM-OpenSky-WordGame", "words");
  const list = (f) => fs.readFileSync(path.join(W, f), "utf8").split("\n").filter((w) => /^[a-z]{5}$/.test(w));
  const answers = list("answers.txt"), allowed = new Set(list("allowed.txt"));
  // today's word, worked out the same way as the node helper (the test may know it; the page may not)
  const d = new Date(), ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days = Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse("2026-01-01T12:00:00Z")) / 86400000);
  const answer = answers[((days % answers.length) + answers.length) % answers.length];
  const score = (g, a) => { const r = Array(5).fill("b"), left = {}; for (let i = 0; i < 5; i++) { if (g[i] === a[i]) r[i] = "g"; else left[a[i]] = (left[a[i]] || 0) + 1; } for (let i = 0; i < 5; i++) if (r[i] !== "g" && left[g[i]] > 0) { r[i] = "y"; left[g[i]]--; } return r.join(""); };
  const other = [...allowed].find((w) => w !== answer && new Set(w).size === 5 && [...w].some((c) => answer.includes(c)));
  const until = async (fn, tries = 30) => { for (let i = 0; i < tries && !(await fn()); i++) await h.sleep(200); return fn(); };
  const st = () => page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-WordGame")[0].state);
  const type = async (w) => { for (const c of w) { await page.evaluate((c) => document.querySelector(`.wg-key[data-k="${c}"]`).click(), c); } };
  const enter = () => page.evaluate(() => document.querySelector('.wg-key[data-k="enter"]').click());
  const toast = () => page.evaluate(() => { const t = document.querySelector(".wg-toast"); return t && !t.hidden ? t.textContent : ""; });

  await h.tap(".os-page-wordgame");
  await until(async () => !!(await st()));
  let s = await st();
  ok("today's puzzle loads (#number from Jan 1 2026), no answer sent to the page", s && s.number === days + 1 && s.answer === null && s.guesses.length === 0, s && { number: s.number, answer: s.answer });
  await type("ab"); await enter(); await h.sleep(200);
  ok("too short → 'Not enough letters'", /Not enough letters/.test(await toast()), await toast());
  await type("cde"); await h.sleep(100);
  for (let i = 0; i < 5; i++) await page.evaluate(() => document.querySelector('.wg-key[data-k="back"]').click());
  await type("zzzzz"); await enter();
  await until(async () => /word list/.test(await toast()));
  ok("not a word → 'Not in the word list'", /Not in the word list/.test(await toast()), await toast());
  for (let i = 0; i < 5; i++) await page.evaluate(() => document.querySelector('.wg-key[data-k="back"]').click());
  await type(other); await enter();
  await until(async () => ((await st()).guesses || []).length === 1);
  await h.sleep(2000);   // tiles flip
  s = await st();
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.wg-row[data-r="0"] .wg-tile')].map((t) => t.classList.contains("correct") ? "g" : t.classList.contains("present") ? "y" : t.classList.contains("absent") ? "b" : "?").join(""));
  ok("a guess is coloured right (repeated letters too) and the page still has no answer", s.guesses[0].pattern === score(other, answer) && tiles === score(other, answer) && s.answer === null, { other, tiles });
  const keyCol = await page.evaluate((c) => document.querySelector(`.wg-key[data-k="${c}"]`).className, other[0]);
  ok("the keyboard shows what's known about each letter", /correct|present|absent/.test(keyCol), keyCol);
  await type(other); await enter();
  await until(async () => /Already/.test(await toast()));
  ok("the same guess twice → 'Already tried that one'", /Already tried/.test(await toast()));
  for (let i = 0; i < 5; i++) await page.evaluate(() => document.querySelector('.wg-key[data-k="back"]').click());
  await type(answer); await enter();
  await until(async () => (await st()).status === "won");
  await h.sleep(2500);
  s = await st();
  const side = await page.evaluate(() => document.querySelector(".wg-side").textContent.replace(/\s+/g, " "));
  ok("solved: praise, stats (1 played, 100%), countdown to the next puzzle", s.status === "won" && s.stats.played === 1 && s.stats.won === 1 && /Magnificent|Genius|Impressive|Splendid|Great|Phew/.test(side) && /Next puzzle in \d+:\d\d:\d\d/.test(side), side.slice(0, 160));
  await h.shot("wordgame");
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", "wordgame.test.json"), "utf8"));
  ok("board + stats saved on the Pi", saved.today.status === "won" && saved.stats.played === 1);

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
