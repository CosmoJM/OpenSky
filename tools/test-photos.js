// Unit test for lib/photos.js (folder provider) with the synthetic photos in tools/fixtures/photos.
// Run: node tools/test-photos.js
const path = require("path");
const { createPhotoSource, readInfo } = require("../lib/photos.js");
let pass = 0, fail = 0; const ok = (k, v, i = "") => { v ? pass++ : fail++; console.log(`${v ? "PASS" : "FAIL"}  ${k} ${i}`); };
const DIR = path.join(__dirname, "fixtures", "photos");
(async () => {
  const r = readInfo(path.join(DIR, "rotated-portrait.jpg"));
  ok("1 JPEG size + EXIF orientation + date taken", r.width === 1400 && r.height === 900 && r.orientation === 6 && /^2024:07:04/.test(r.taken || ""), JSON.stringify(r));
  const src = createPhotoSource({ provider: "folder", folder: DIR, usb: false }, () => null);
  const seen = new Map();
  for (let k = 0; k < 40; k++) { const n = await src.next(); n.photos.forEach((p) => seen.set(p.id, p)); if (n.photos.length === 2) ok.pairs = (ok.pairs || 0) + 1; if (n.photos[0].portrait && n.photos.length !== 2) ok.lonelyPortrait = true; }
  ok("2 finds all 5 photos", seen.size === 5, `(${seen.size})`);
  const portraits = [...seen.values()].filter((p) => p.portrait).length;
  ok("3 portrait detection incl. the rotated one (3 portraits)", portraits === 3, `(${portraits})`);
  ok("4 portraits come in pairs", ok.pairs > 0 && !ok.lonelyPortrait, `(pairs ${ok.pairs})`);
  const rot = [...seen.values()].find((p) => p.date && p.date.startsWith("2024-07-04"));
  ok("5 date from EXIF", !!rot);
  const img = await src.image([...seen.keys()][0]);
  ok("6 serves image bytes by opaque id", img && img.body.length > 1000 && /image\//.test(img.type));
  ok("7 unknown id → nothing (no path tricks)", (await src.image("../../etc/passwd")) === null);
  const empty = createPhotoSource({ provider: "folder", folder: "/nonexistent-folder", usb: false }, () => null);
  ok("8 empty folder → clear error", await empty.next().then(() => false, (e) => /no photos/.test(e.message)));
  const im = createPhotoSource({ provider: "immich", url: "" }, () => null);
  ok("9 Immich without settings → explains what's missing", await im.next().then(() => false, (e) => /photos\.url/.test(e.message)));
  console.log(`SUMMARY pass=${pass} fail=${fail}`);
})();
