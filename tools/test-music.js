// Unit test for the Music add-on: lib/music.js against a fake go-librespot (Spotify Connect API) and a fake busctl
// (shairport-sync's MPRIS on D-Bus), and services/music/render.js (the speakers' config files, the speaker name).
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), { execFileSync } = require("child_process");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-music-"));
process.env.OPENSKY_SECRETS = path.join(tmp, "secrets.json");   // (read by lib/secrets.js from the first require on)
let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// fake go-librespot
let spot = null; const spotCalls = [];
const server = http.createServer((req, res) => {
  if (req.url === "/status") { if (!spot) { res.writeHead(204); return res.end(); } res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(spot)); }
  if (req.method === "POST" && req.url.startsWith("/player/")) { spotCalls.push(req.url); res.writeHead(200); return res.end(); }
  res.writeHead(404); res.end();
});
// fake busctl: prints tmp/mpris.json for GetAll (fails when it's missing, like "no such service"); logs method calls
const ART = path.join(tmp, "cover.jpg");
fs.writeFileSync(ART, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
const BUSLOG = path.join(tmp, "busctl.log"), MPRIS = path.join(tmp, "mpris.json");
const fake = path.join(tmp, "busctl");
fs.writeFileSync(fake, `#!/bin/sh\necho "$@" >> "${BUSLOG}"\ncase "$*" in *GetAll*) [ -f "${MPRIS}" ] && cat "${MPRIS}" || exit 1 ;; *Player\\ PlayPause*|*Player\\ Next*|*Player\\ Previous*) exit \${FAKE_BUS_FAIL:-0} ;; esac\n`, { mode: 0o755 });
const mpris = (status, md, position = 61000000) => fs.writeFileSync(MPRIS, JSON.stringify({ type: "a{sv}", data: [{ PlaybackStatus: { type: "s", data: status }, Position: { type: "x", data: position }, Metadata: { type: "a{sv}", data: md } }] }));

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENSKY_SPOTIFY_API = `http://127.0.0.1:${server.address().port}`;
  process.env.OPENSKY_BUSCTL = fake;
  const music = require(path.join(__dirname, "..", "lib", "music.js"));

  ok("1 nothing installed or playing → null", (await music.state()) === null);

  spot = { stopped: false, paused: false, buffering: false, track: { name: "Here Comes the Sun", artist_names: ["The Beatles"], album_name: "Abbey Road", album_cover_url: "https://i.scdn.co/image/abc", position: 42000, duration: 185000 } };
  let s = await music.state();
  ok("2 Spotify playing: title, artists, album, art, position, duration", s && s.source === "spotify" && s.playing && s.title === "Here Comes the Sun" && s.artist === "The Beatles" && s.album === "Abbey Road" && s.art === "https://i.scdn.co/image/abc" && s.position === 42000 && s.duration === 185000, s);
  spot.track.artist_names = ["A", "B"]; spot.paused = true;
  s = await music.state();
  ok("3 several artists joined; paused", s.artist === "A, B" && s.playing === false);
  spot.stopped = true;
  ok("4 Spotify stopped → nothing", (await music.state()) === null);
  spot.stopped = false; spot.paused = false;
  await music.control("spotify", "playpause"); await music.control("spotify", "next"); await music.control("spotify", "previous");
  ok("5 Spotify buttons → /player/playpause, /player/next, /player/prev", spotCalls.join() === "/player/playpause,/player/next,/player/prev", spotCalls);

  mpris("Playing", { "xesam:title": { type: "s", data: "Clair de Lune" }, "xesam:artist": { type: "as", data: ["Debussy"] }, "xesam:album": { type: "s", data: "Suite" }, "mpris:artUrl": { type: "s", data: `file://${ART}` }, "mpris:length": { type: "x", data: 300000000 } });
  spot.paused = true;
  s = await music.state();
  ok("6 AirPlay playing beats a paused Spotify; art becomes a data: URL; µs → ms", s && s.source === "airplay" && s.title === "Clair de Lune" && s.artist === "Debussy" && /^data:image\/jpeg;base64,/.test(s.art) && s.position === 61000 && s.duration === 300000, s && { ...s, art: (s.art || "").slice(0, 30) });
  ok("7 a source switched off is ignored", (await music.state({ airplay: false })).source === "spotify");
  mpris("Paused", { "xesam:title": { type: "s", data: "Clair de Lune" } });
  s = await music.state({ spotify: false });
  ok("8 AirPlay paused; no art → null", s.playing === false && s.art === null, s);
  mpris("Stopped", {});
  ok("9 AirPlay stopped → nothing", (await music.state({ spotify: false })) === null);
  // shairport-sync reports no position (0): it's counted from when the song was first seen, paused time left out
  const song = (status, title = "Gymnopédie") => mpris(status, { "xesam:title": { type: "s", data: title }, "mpris:length": { type: "x", data: 200000000 } }, 0);   // (like the real one)
  song("Playing"); await music.state({ spotify: false }); await new Promise((r) => setTimeout(r, 1200));
  const p1 = (await music.state({ spotify: false })).position;
  song("Paused"); await music.state({ spotify: false }); await new Promise((r) => setTimeout(r, 800));
  const p2 = (await music.state({ spotify: false })).position;
  song("Playing"); await music.state({ spotify: false }); await new Promise((r) => setTimeout(r, 600));
  const p3 = (await music.state({ spotify: false })).position;
  song("Playing", "Another song");
  const p4 = (await music.state({ spotify: false })).position;
  ok("9b AirPlay without a position: counted from the song's start, stands still while paused, goes on after, a new song starts at 0",
    p1 >= 1100 && p1 < 2500 && p2 - p1 >= 0 && p2 - p1 < 500 && p3 >= p2 + 500 && p3 < p2 + 1800 && p4 < 300, [p1, p2, p3, p4]);   // (roomy: a busy test computer)
  // stopped (AirPlay disconnects) and the same song again → 0:00; a short song played again (repeat one) → a new count
  song("Playing"); await music.state({ spotify: false }); await new Promise((r) => setTimeout(r, 900));
  song("Stopped"); await music.state({ spotify: false });
  song("Playing"); const again = (await music.state({ spotify: false })).position;
  mpris("Playing", { "xesam:title": { type: "s", data: "Jingle" }, "mpris:length": { type: "x", data: 1000000 } }, 0);   // a 1-second song
  await music.state({ spotify: false }); await new Promise((r) => setTimeout(r, 2700));
  const loop = (await music.state({ spotify: false })).position;
  ok("9c after a stop the same song starts at 0:00; on repeat-one the time starts over instead of sitting at the end", again < 300 && loop < 950, [again, loop]);
  fs.writeFileSync(BUSLOG, "");
  await music.control("airplay", "playpause"); await music.control("airplay", "next");
  const bl = fs.readFileSync(BUSLOG, "utf8");
  ok("10 AirPlay buttons → MPRIS PlayPause / Next on the session bus", /--user call org\.mpris\.MediaPlayer2\.ShairportSync \/org\/mpris\/MediaPlayer2 org\.mpris\.MediaPlayer2\.Player PlayPause/.test(bl) && /Player Next/.test(bl), bl);
  process.env.FAKE_BUS_FAIL = "1";
  ok("11 a phone that refuses the button → a clear message", /use the phone/.test(await fails(() => music.control("airplay", "next"))));
  delete process.env.FAKE_BUS_FAIL;
  ok("12 an unknown source is refused", /Unknown/.test(await fails(() => music.control("radio", "next"))));
  fs.rmSync(MPRIS); spot = null; server.close();
  process.env.OPENSKY_SPOTIFY_API = "http://127.0.0.1:9";
  ok("13 receivers not running → null, no error", (await music.state()) === null);

  // ---- other speakers: Home Assistant media players ----
  const haCalls = []; let kitchen = "playing";
  const ha = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const send = (code, obj, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(type === "application/json" ? JSON.stringify(obj) : obj); };
      if (req.headers.authorization !== "Bearer ha-token") return send(401, {});
      if (req.url === "/api/states/media_player.kitchen") return send(200, { entity_id: "media_player.kitchen", state: kitchen, attributes: { friendly_name: "Kitchen", media_title: "Dreams", media_artist: "Fleetwood Mac", media_album_name: "Rumours", media_duration: 257, media_position: 60, media_position_updated_at: new Date(Date.now() - 2000).toISOString(), volume_level: 0.35, entity_picture: "/api/media_player_proxy/media_player.kitchen?token=abc&cache=1" } });
      if (req.url === "/api/states/media_player.cast") return send(200, { entity_id: "media_player.cast", state: "playing", attributes: { friendly_name: "Living room", media_title: "Song", entity_picture: `http://127.0.0.1:${outside.address().port}/image/abc` } });
      if (req.url === "/api/states/media_player.attic") return send(200, { entity_id: "media_player.attic", state: "unavailable", attributes: { friendly_name: "Attic" } });
      if (req.url.startsWith("/api/media_player_proxy/")) return send(200, Buffer.from([0xff, 0xd8, 0xff, 1]), "image/jpeg");
      if (req.url === "/api/states") return send(200, [{ entity_id: "light.x", state: "on", attributes: {} }, { entity_id: "media_player.kitchen", state: "playing", attributes: { friendly_name: "Kitchen" } }, { entity_id: "media_player.attic", state: "off", attributes: { friendly_name: "Attic" } }]);
      if (req.url.startsWith("/api/services/media_player/")) { haCalls.push(`${req.url.split("/").pop()} ${raw}`); return send(200, []); }
      send(404, {});
    });
  });
  // a picture somewhere else on the internet (Spotify, Google Cast give full addresses): must not get the HA token
  const outsideCalls = [];
  const outside = http.createServer((req, res) => { outsideCalls.push({ url: req.url, auth: req.headers.authorization || null }); res.writeHead(200, { "Content-Type": "image/png" }); res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47])); });
  await new Promise((r) => outside.listen(0, "127.0.0.1", r));
  await new Promise((r) => ha.listen(0, "127.0.0.1", r));
  fs.writeFileSync(process.env.OPENSKY_SECRETS, JSON.stringify({ homeassistant: { url: `http://127.0.0.1:${ha.address().port}/`, token: "ha-token" } }));
  let sp = await music.speakers(["media_player.kitchen", "media_player.attic", "light.nope"]);
  const k = sp[0];
  ok("18 HA speaker playing: name, song, artist, album, cover (data: URL, fetched with the token), position moves on, duration, volume",
    k.name === "Kitchen" && k.available && k.volume === 35 && k.now && k.now.source === "homeassistant" && k.now.playing && k.now.title === "Dreams" && k.now.artist === "Fleetwood Mac" && k.now.album === "Rumours" &&
    /^data:image\/jpeg;base64,/.test(k.now.art) && k.now.position >= 61500 && k.now.position < 64000 && k.now.duration === 257000, { ...k, now: k.now && { ...k.now, art: (k.now.art || "").slice(0, 25) } });
  const cast = (await music.speakers(["media_player.cast"]))[0];
  ok("18b a cover with a full address (Spotify, Google Cast) is fetched from there — without the Home Assistant token",
    /^data:image\/png;base64,/.test(cast.now.art || "") && outsideCalls.length === 1 && outsideCalls[0].url === "/image/abc" && outsideCalls[0].auth === null, outsideCalls);
  outside.close();
  ok("19 unavailable speaker → not available; a non-speaker id is refused", sp[1].available === false && sp[1].name === "Attic" && sp[1].now === null && sp[2].available === false, sp.slice(1));
  kitchen = "paused";
  sp = await music.speakers(["media_player.kitchen"]);
  ok("20 paused: shown, not playing, position not moving", sp[0].now.playing === false && sp[0].now.position === 60000, sp[0].now.position);
  await music.control("homeassistant", "playpause", "media_player.kitchen");
  await music.control("homeassistant", "next", "media_player.kitchen");
  await music.control("homeassistant", "volume", "media_player.kitchen", 80);
  ok("21 buttons and volume → media_player services for that speaker", haCalls[0] === 'media_play_pause {"entity_id":"media_player.kitchen"}' && haCalls[1] === 'media_next_track {"entity_id":"media_player.kitchen"}' && haCalls[2] === 'volume_set {"entity_id":"media_player.kitchen","volume_level":0.8}', haCalls);
  ok("22 a button for no speaker is refused", /Which speaker/.test(await fails(() => music.control("homeassistant", "next", "light.kitchen"))));
  const all = await music.listSpeakers();
  ok("23 every media player Home Assistant has (for phone setup), by name", JSON.stringify(all.map((x) => x.id)) === '["media_player.attic","media_player.kitchen"]', all);
  fs.writeFileSync(process.env.OPENSKY_SECRETS, JSON.stringify({ homeassistant: { url: `http://127.0.0.1:${ha.address().port}`, token: "wrong" } }));
  ok("24 a wrong token is explained; the speaker shows as unavailable", /refused the token/.test(await fails(() => music.listSpeakers())) && (await music.speakers(["media_player.kitchen"]))[0].available === false);
  ha.close();
  fs.writeFileSync(process.env.OPENSKY_SECRETS, "{}");
  ok("25 Home Assistant not set up → says so", /isn't set up/.test(await fails(() => music.listSpeakers())));

  // ---- the speakers' config files ----
  const render = require(path.join(__dirname, "..", "services", "music", "render.js"));
  ok("26 speaker name: music.name, else the family name, else OpenSky; quotes/backslashes/control characters dropped, 40 letters max",
    render.speakerName({ music: { name: "Kitchen" }, family: { name: "The Smiths" } }) === "Kitchen" && render.speakerName({ family: { name: "The Smiths' screen" } }) === "The Smiths' screen" &&
    render.speakerName({}) === "OpenSky" && render.speakerName({ music: { name: 'Bad "name"\\\n' } }) === "Bad name" && render.speakerName({ music: { name: "x".repeat(60) } }).length === 40 && render.speakerName({ music: { name: '""' } }) === "OpenSky");
  const settingsFile = path.join(tmp, "opensky.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ family: { name: "Les Élèves' Café ☕" } }));
  const out = path.join(tmp, "music");
  execFileSync(process.execPath, [path.join(__dirname, "..", "services", "music", "render.js"), "airplay", out], { env: { ...process.env, OPENSKY_SETTINGS: settingsFile } });
  execFileSync(process.execPath, [path.join(__dirname, "..", "services", "music", "render.js"), "spotify", out], { env: { ...process.env, OPENSKY_SETTINGS: settingsFile } });
  const conf = fs.readFileSync(path.join(out, "shairport-sync.conf"), "utf8"), yml = fs.readFileSync(path.join(out, "spotify", "config.yml"), "utf8");
  ok("27 AirPlay config: name, PulseAudio/PipeWire output, port 5100, D-Bus + MPRIS on the session bus, cover art cached",
    /name = "Les Élèves' Café ☕";/.test(conf) && /output_backend = "pa";/.test(conf) && /port = 5100;/.test(conf) && /dbus_service_bus = "session";/.test(conf) && /mpris_service_bus = "session";/.test(conf) && conf.includes(`cover_art_cache_directory = "${path.join(out, "coverart")}"`) && /allow_session_interruption = "yes"/.test(conf));
  ok("28 Spotify config: name (a JSON-quoted YAML string), speaker, pulseaudio, zeroconf, API on localhost:3678",
    yml.includes('device_name: "Les Élèves\' Café ☕"') && /device_type: speaker/.test(yml) && /audio_backend: pulseaudio/.test(yml) && /type: zeroconf/.test(yml) && /address: localhost\n  port: 3678/.test(yml));
  const shairport = "/usr/bin/shairport-sync";
  if (fs.existsSync(shairport)) {
    // --displayConfig prints what it read, then carries on as a speaker: stopped after 2 s
    const r = require("child_process").spawnSync(shairport, ["-c", path.join(out, "shairport-sync.conf"), "--displayConfig"], { timeout: 2000, killSignal: "SIGTERM", encoding: "utf8" });
    const shown = String(r.stdout || "") + String(r.stderr || "");
    ok("29 shairport-sync reads the config (name, output, port, session bus)", /Display Config End/.test(shown) && /name = "Les Élèves' Café ☕"/.test(shown) && /output_backend = "pa"/.test(shown) && /port = 5100/.test(shown) && /mpris_service_bus = "session"/.test(shown) && !/error|unrecognised|invalid/i.test(shown.split("Display Config End")[0]), shown.slice(-300));
  }

  // ---- config.js: the Music page ----
  fs.writeFileSync(settingsFile, JSON.stringify({ family: { name: "The Smiths" }, pages: ["home", "music", "timer"], music: { spotify: false, speakers: ["media_player.kitchen", "light.no", "media_player.Bad"] } }));
  fs.writeFileSync(path.join(tmp, "secrets.json"), "{}");
  process.env.OPENSKY_SETTINGS = settingsFile; process.env.OPENSKY_SECRETS = path.join(tmp, "secrets.json");
  global.root_path = path.join(__dirname, "..");
  const m = { exports: {} };
  new Function("module", "exports", "require", "__dirname", fs.readFileSync(path.join(__dirname, "..", "config", "config.js"), "utf8"))(m, m.exports, require, path.join(__dirname, "..", "config"));
  const mod = m.exports.modules.find((x) => x.module === "MMM-OpenSky-Music");
  const side = m.exports.modules.find((x) => x.module === "MMM-OpenSky-Sidebar");
  const off = path.join(tmp, "off.json"); fs.writeFileSync(off, JSON.stringify({ music: { airplay: false } }));
  const enabled = (w) => { try { execFileSync(process.execPath, [path.join(__dirname, "..", "services", "music", "render.js"), "enabled", w], { env: { ...process.env, OPENSKY_SETTINGS: off } }); return true; } catch (e) { return false; } };
  ok("29b a speaker switched off says so (its service doesn't start); the other stays on", enabled("airplay") === false && enabled("spotify") === true);
  ok("30 config: a Music page with the speaker name, sources and valid other speakers; sidebar tile 'Music' with the music icon",
    mod && mod.config.name === "The Smiths" && mod.config.spotify === false && mod.config.airplay === true && JSON.stringify(mod.config.speakers) === '["media_player.kitchen"]' && side.config.pages.some((p) => p.key === "music" && p.label === "Music" && p.icon === "music"), mod && mod.config);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
})();
