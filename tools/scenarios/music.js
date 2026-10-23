// Music add-on page: idle help with the speaker name, Spotify playing (art, title, progress, buttons reach the
// speaker), AirPlay playing, the volume slider (shared with Settings), not-installed help, the phone page's Music
// settings. Fake go-librespot (port 8096) and a fake busctl stand in for the real speakers.
const fs = require("fs"), path = require("path"), http = require("http");
const OUT = path.join(__dirname, "..", "out");
const MPRIS = path.join(OUT, "music-mpris.json"), BUSLOG = path.join(OUT, "music-busctl.log"), BUSCTL = path.join(OUT, "fake-busctl");
fs.rmSync(MPRIS, { force: true }); fs.writeFileSync(BUSLOG, "");
fs.writeFileSync(BUSCTL, `#!/bin/sh\necho "$@" >> "${BUSLOG}"\ncase "$*" in *GetAll*) [ -f "${MPRIS}" ] && cat "${MPRIS}" || exit 1 ;; esac\n`, { mode: 0o755 });
const ART = path.join(OUT, "music-cover.png");
fs.copyFileSync(path.join(__dirname, "..", "..", "lib", "client", "assets", "opensky-icon.png"), ART);

let spot = null; const calls = [];
const PORT = 8096;
const fake = http.createServer((req, res) => {
  if (req.url === "/status") { if (!spot) { res.writeHead(204); return res.end(); } res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(spot)); }
  if (req.method === "POST" && req.url.startsWith("/player/")) {
    calls.push(req.url);
    if (req.url === "/player/playpause" && spot) spot.paused = !spot.paused;
    res.writeHead(200); return res.end();
  }
  res.writeHead(404); res.end();
});
fake.listen(PORT, "127.0.0.1"); fake.unref();

module.exports = async (page, h) => {
  const R = {}; const ok = (k, v, i) => { R[k] = v; h.log(`${v ? "PASS" : "FAIL"}  ${k}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
  const until = async (fn, n = 30) => { for (let i = 0; i < n && !(await fn()); i++) await h.sleep(250); return fn(); };
  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent || "", sel);

  await h.tap(".os-page-music"); await h.sleep(1200);
  ok("a Music tile in the sidebar opens the Music page", await page.evaluate(() => !!document.querySelector(".mu-root")?.getBoundingClientRect().width));
  await until(async () => /Play music on this screen/.test(await text(".mu-root")));
  const idle = await text(".mu-root");
  ok("nothing playing: how to pick the speaker, with its name, for AirPlay and Spotify", /Play music on this screen/.test(idle) && /“The Testers”/.test(idle) && /AirPlay/.test(idle) && /Spotify/.test(idle) && /Premium/.test(idle), idle.slice(0, 200));
  await h.shot("music-idle");

  // Spotify starts playing
  spot = { stopped: false, paused: false, buffering: false, track: { name: "Here Comes the Sun", artist_names: ["The Beatles"], album_name: "Abbey Road", album_cover_url: `file://${ART}`, position: 42000, duration: 185000 } };
  spot.track.album_cover_url = null;   // (the real one is an https:// picture; offline here)
  await until(async () => /Here Comes the Sun/.test(await text(".mu-title")));
  const p1 = await page.evaluate(() => ({ title: document.querySelector(".mu-title")?.textContent, artist: document.querySelector(".mu-artist")?.textContent, album: document.querySelector(".mu-album")?.textContent, chip: document.querySelector(".mu-chip")?.textContent, pos: document.querySelector(".mu-pos")?.textContent, dur: document.querySelector(".mu-dur")?.textContent, play: document.querySelector(".mu-play")?.getAttribute("aria-label") }));
  ok("Spotify playing: title, artist, album, 'Spotify', progress 0:4x / 3:05, a Pause button", p1.title === "Here Comes the Sun" && p1.artist === "The Beatles" && p1.album === "Abbey Road" && p1.chip === "Spotify" && /^0:4\d$/.test(p1.pos) && p1.dur === "3:05" && p1.play === "Pause", p1);
  await h.sleep(2200);
  const pos2 = await text(".mu-pos");
  ok("the progress moves on between updates", pos2 !== p1.pos, [p1.pos, pos2]);
  await h.shot("music-spotify");

  await h.tap(".mu-play"); await h.sleep(300);
  ok("tap Pause: the button turns to Play at once, the speaker gets playpause", (await page.evaluate(() => document.querySelector(".mu-play").getAttribute("aria-label"))) === "Play" && calls.includes("/player/playpause"), calls);
  await h.tap(".mu-next"); await h.sleep(300); await h.tap(".mu-prev"); await h.sleep(600);
  ok("Next / Previous reach the speaker", calls.includes("/player/next") && calls.includes("/player/prev"), calls);

  // AirPlay plays (Spotify paused)
  fs.writeFileSync(MPRIS, JSON.stringify({ type: "a{sv}", data: [{ PlaybackStatus: { type: "s", data: "Playing" }, Position: { type: "x", data: 5000000 }, Metadata: { type: "a{sv}", data: {
    "xesam:title": { type: "s", data: "Clair de Lune" }, "xesam:artist": { type: "as", data: ["Claude Debussy"] }, "mpris:artUrl": { type: "s", data: `file://${ART}` }, "mpris:length": { type: "x", data: 300000000 } } } }] }));
  await until(async () => /Clair de Lune/.test(await text(".mu-title")));
  const p2 = await page.evaluate(() => ({ title: document.querySelector(".mu-title")?.textContent, chip: document.querySelector(".mu-chip")?.textContent, art: (document.querySelector(".mu-art img")?.src || "").slice(0, 22), backdrop: !!document.querySelector(".mu-backdrop") }));
  ok("AirPlay playing (beats the paused Spotify): title, 'AirPlay', the cover art from the phone", p2.title === "Clair de Lune" && p2.chip === "AirPlay" && p2.art === "data:image/png;base64," && p2.backdrop, p2);
  fs.writeFileSync(BUSLOG, "");
  await h.tap(".mu-play"); await h.sleep(800);
  ok("AirPlay Pause → MPRIS PlayPause on the session bus", /--user call org\.mpris\.MediaPlayer2\.ShairportSync .* PlayPause/.test(fs.readFileSync(BUSLOG, "utf8")));
  await h.shot("music-airplay");

  // volume: the Music slider is the Settings volume
  const vol = await page.evaluate(() => ({ shown: !document.querySelector(".mu-volume").hidden, value: document.querySelector(".mu-range").value }));
  ok("the volume slider shows the screen's volume (from Settings)", vol.shown && vol.value === "50", vol);
  await page.evaluate(() => { const r = document.querySelector(".mu-range"); r.value = "80"; r.dispatchEvent(new Event("input", { bubbles: true })); });
  await h.sleep(900);
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Sidebar")[0].sendNotification("OPENSKY_SETTINGS_OPEN"));
  await h.sleep(900);
  const setVol = await page.evaluate(() => document.querySelector('.ost-slider[data-id="volume"]')?.value);
  ok("moving it changes the volume in Settings too", setVol === "80", setVol);
  await page.evaluate(() => document.querySelector(".ost-x")?.click());
  await h.sleep(400);

  // nothing playing again → the help; then the not-installed view
  fs.rmSync(MPRIS, { force: true }); spot = null;
  await until(async () => /Play music on this screen/.test(await text(".mu-root")));
  ok("music stops → back to the help", /Play music on this screen/.test(await text(".mu-root")));
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Music")[0].socketNotificationReceived("OS_MUSIC_STATE", { now: null, installed: { spotify: false, airplay: false } }));
  await h.sleep(200);
  ok("not installed yet: says how (opensky addon music)", /opensky addon music/.test(await text(".mu-root")));
  await h.shot("music-not-installed");

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => { s.pages = ["home", "calendar", "lists", "music", "timer"]; };
module.exports.env = { OPENSKY_SPOTIFY_API: `http://127.0.0.1:${PORT}`, OPENSKY_BUSCTL: BUSCTL, OPENSKY_MUSIC_INSTALLED: "spotify,airplay" };
