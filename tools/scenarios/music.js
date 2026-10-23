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

// a fake Home Assistant with two speakers (port 8097)
const HA = 8097; let kitchen = "idle"; const haCalls = [];
const ha = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.url === "/api/states/media_player.kitchen") return send(200, { state: kitchen, attributes: { friendly_name: "Kitchen", volume_level: 0.3, ...(kitchen === "idle" ? {} : { media_title: "Dreams", media_artist: "Fleetwood Mac", media_album_name: "Rumours", media_duration: 257, media_position: 10, media_position_updated_at: new Date().toISOString() }) } });
    if (req.url === "/api/states/media_player.attic") return send(200, { state: "unavailable", attributes: { friendly_name: "Attic" } });
    if (req.url.startsWith("/api/services/media_player/")) { const svc = req.url.split("/").pop(); haCalls.push(`${svc} ${raw}`); if (svc === "media_play_pause") kitchen = kitchen === "playing" ? "paused" : "playing"; return send(200, []); }
    send(404, {});
  });
});
ha.listen(HA, "127.0.0.1"); ha.unref();

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
  // the cover goes to the page once; the updates after it only name it
  const counts = await page.evaluate(async () => {
    const m = MM.getModules().withClass("MMM-OpenSky-Music")[0], orig = m.socketNotificationReceived;
    const c = { states: 0, statesWithPicture: 0, pictures: 0 };
    m.socketNotificationReceived = function (n, p) { if (n === "OS_MUSIC_STATE") { c.states++; if (JSON.stringify(p).includes("data:")) c.statesWithPicture++; } if (n === "OS_MUSIC_ART") c.pictures++; return orig.call(this, n, p); };
    await new Promise((r) => setTimeout(r, 4000));
    m.socketNotificationReceived = orig;
    return { ...c, img: (document.querySelector(".mu-art img")?.src || "").slice(0, 22) };
  });
  ok("the cover isn't sent again with every update (none of them carries the picture; it's still shown)", counts.statesWithPicture === 0 && counts.pictures === 0 && counts.img === "data:image/png;base64,", counts);
  // the page keeps only the last few covers: one it dropped (a long session) is asked for again and comes back
  const resent = await page.evaluate(async () => {
    const m = MM.getModules().withClass("MMM-OpenSky-Music")[0], orig = m.socketNotificationReceived;
    let pictures = 0;
    m.socketNotificationReceived = function (n, p) { if (n === "OS_MUSIC_ART") pictures++; return orig.call(this, n, p); };
    m.arts = {}; m.updateDom();
    for (let i = 0; i < 40 && !(pictures && (document.querySelector(".mu-art img")?.src || "").startsWith("data:image/png")); i++) await new Promise((r) => setTimeout(r, 100));
    m.socketNotificationReceived = orig;
    return { pictures, img: (document.querySelector(".mu-art img")?.src || "none").slice(0, 22) };
  });
  ok("a cover the page dropped is asked for again, sent once more, and shows again", resent.pictures === 1 && resent.img === "data:image/png;base64,", resent);
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
  await page.evaluate(() => MM.getModules().withClass("MMM-OpenSky-Music")[0].sendSocketNotification("OS_MUSIC_VISIBLE", true));   // a fresh update

  // ---- other speakers (Home Assistant) ----
  const tabs = () => page.evaluate(() => [...document.querySelectorAll(".mu-tab")].map((t) => `${t.textContent}${t.classList.contains("on") ? "*" : ""}${t.classList.contains("off") ? "(off)" : ""}`));
  await until(async () => (await tabs()).length === 3);
  ok("tabs: This screen, Kitchen, Attic (switched off)", JSON.stringify(await tabs()) === '["This screen*","Kitchen","Attic(off)"]', await tabs());
  kitchen = "playing";
  await until(async () => /Dreams/.test(await text(".mu-title")));
  const k = await page.evaluate(() => ({ title: document.querySelector(".mu-title")?.textContent, artist: document.querySelector(".mu-artist")?.textContent, chip: document.querySelector(".mu-chip")?.textContent, vol: document.querySelector(".mu-range")?.value, tab: document.querySelector(".mu-tab.on")?.textContent, eq: !!document.querySelector(".mu-tab.on .mu-eq") }));
  ok("music starts on Kitchen → its tab opens by itself: song, artist, the speaker's name, its volume (30)", k.title === "Dreams" && k.artist === "Fleetwood Mac" && k.chip === "Kitchen" && k.vol === "30" && /Kitchen/.test(k.tab) && k.eq, k);
  await h.shot("music-kitchen");
  await h.tap(".mu-play"); await h.sleep(1500);
  ok("paused on Kitchen: it stays on Kitchen (with a Play button), it doesn't jump to another speaker", (await page.evaluate(() => [document.querySelector(".mu-tab.on")?.textContent, document.querySelector(".mu-play")?.getAttribute("aria-label")])).join() === "Kitchen,Play");
  await h.tap(".mu-next"); await h.sleep(600);
  await page.evaluate(() => { const r = document.querySelector(".mu-range"); r.value = "65"; r.dispatchEvent(new Event("input", { bubbles: true })); });
  await h.sleep(900);
  ok("Kitchen's buttons and volume go to Kitchen (media_player services)", haCalls.some((c) => c === 'media_play_pause {"entity_id":"media_player.kitchen"}') && haCalls.some((c) => /^media_next_track .*kitchen/.test(c)) && haCalls.some((c) => c === 'volume_set {"entity_id":"media_player.kitchen","volume_level":0.65}'), haCalls);
  await page.evaluate(() => [...document.querySelectorAll(".mu-tab")].find((t) => t.textContent === "Attic").click()); await h.sleep(400);
  ok("Attic (off): says it isn't reachable", /Attic isn't reachable/.test(await text(".mu-root")));
  await h.tap(".os-page-home"); await h.sleep(800); await h.tap(".os-page-music"); await h.sleep(1200);
  const back = await page.evaluate(() => document.querySelector(".mu-tab.on")?.textContent);
  ok("leaving the page forgets the tapped tab: back on Music it shows the speaker with music (Kitchen), not Attic", back === "Kitchen", back);
  await page.evaluate(() => [...document.querySelectorAll(".mu-tab")].find((t) => t.textContent === "This screen").click()); await h.sleep(400);
  ok("back to This screen: how to play to it", /Play music on this screen/.test(await text(".mu-root")));

  const f = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  h.log(`SUMMARY: ${f.length ? "FAILED: " + f.join("; ") : "ALL CHECKS PASSED"} (${Object.keys(R).length} checks)`);
};
module.exports.patchSettings = (s) => { s.pages = ["home", "calendar", "lists", "music", "timer"]; s.music = { speakers: ["media_player.kitchen", "media_player.attic"] }; };
module.exports.patchSecrets = (x) => { x.homeassistant = { url: `http://127.0.0.1:${HA}`, token: "ha-test-token" }; };
module.exports.env = { OPENSKY_SPOTIFY_API: `http://127.0.0.1:${PORT}`, OPENSKY_BUSCTL: BUSCTL, OPENSKY_MUSIC_INSTALLED: "spotify,airplay" };
