// Unit test for the Music add-on: lib/music.js against a fake go-librespot (Spotify Connect API) and a fake busctl
// (shairport-sync's MPRIS on D-Bus), and services/music/render.js (the speakers' config files, the speaker name).
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), { execFileSync } = require("child_process");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-music-"));
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
const mpris = (status, md) => fs.writeFileSync(MPRIS, JSON.stringify({ type: "a{sv}", data: [{ PlaybackStatus: { type: "s", data: status }, Position: { type: "x", data: 61000000 }, Metadata: { type: "a{sv}", data: md } }] }));

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

  // ---- the speakers' config files ----
  const render = require(path.join(__dirname, "..", "services", "music", "render.js"));
  ok("14 speaker name: music.name, else the family name, else OpenSky; quotes/backslashes/control characters dropped, 40 letters max",
    render.speakerName({ music: { name: "Kitchen" }, family: { name: "The Smiths" } }) === "Kitchen" && render.speakerName({ family: { name: "The Smiths' screen" } }) === "The Smiths' screen" &&
    render.speakerName({}) === "OpenSky" && render.speakerName({ music: { name: 'Bad "name"\\\n' } }) === "Bad name" && render.speakerName({ music: { name: "x".repeat(60) } }).length === 40 && render.speakerName({ music: { name: '""' } }) === "OpenSky");
  const settingsFile = path.join(tmp, "opensky.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ family: { name: "Les Élèves' Café ☕" } }));
  const out = path.join(tmp, "music");
  execFileSync(process.execPath, [path.join(__dirname, "..", "services", "music", "render.js"), "airplay", out], { env: { ...process.env, OPENSKY_SETTINGS: settingsFile } });
  execFileSync(process.execPath, [path.join(__dirname, "..", "services", "music", "render.js"), "spotify", out], { env: { ...process.env, OPENSKY_SETTINGS: settingsFile } });
  const conf = fs.readFileSync(path.join(out, "shairport-sync.conf"), "utf8"), yml = fs.readFileSync(path.join(out, "spotify", "config.yml"), "utf8");
  ok("15 AirPlay config: name, PulseAudio/PipeWire output, port 5100, D-Bus + MPRIS on the session bus, cover art cached",
    /name = "Les Élèves' Café ☕";/.test(conf) && /output_backend = "pa";/.test(conf) && /port = 5100;/.test(conf) && /dbus_service_bus = "session";/.test(conf) && /mpris_service_bus = "session";/.test(conf) && conf.includes(`cover_art_cache_directory = "${path.join(out, "coverart")}"`) && /allow_session_interruption = "yes"/.test(conf));
  ok("16 Spotify config: name (a JSON-quoted YAML string), speaker, pulseaudio, zeroconf, API on localhost:3678",
    yml.includes('device_name: "Les Élèves\' Café ☕"') && /device_type: speaker/.test(yml) && /audio_backend: pulseaudio/.test(yml) && /type: zeroconf/.test(yml) && /address: localhost\n  port: 3678/.test(yml));
  const shairport = "/usr/bin/shairport-sync";
  if (fs.existsSync(shairport)) {
    let chk = "";
    try { execFileSync(shairport, ["-c", path.join(out, "shairport-sync.conf"), "--displayConfig"], { timeout: 5000, stdio: "pipe" }); chk = "ok"; } catch (e) { chk = String(e.stderr || e.message).slice(0, 200); }
    ok("17 shairport-sync reads the config", chk === "ok", chk);
  }

  // ---- config.js: the Music page ----
  fs.writeFileSync(settingsFile, JSON.stringify({ family: { name: "The Smiths" }, pages: ["home", "music", "timer"], music: { spotify: false } }));
  fs.writeFileSync(path.join(tmp, "secrets.json"), "{}");
  process.env.OPENSKY_SETTINGS = settingsFile; process.env.OPENSKY_SECRETS = path.join(tmp, "secrets.json");
  global.root_path = path.join(__dirname, "..");
  const m = { exports: {} };
  new Function("module", "exports", "require", "__dirname", fs.readFileSync(path.join(__dirname, "..", "config", "config.js"), "utf8"))(m, m.exports, require, path.join(__dirname, "..", "config"));
  const mod = m.exports.modules.find((x) => x.module === "MMM-OpenSky-Music");
  const side = m.exports.modules.find((x) => x.module === "MMM-OpenSky-Sidebar");
  ok("18 config: a Music page with the speaker name and sources; sidebar tile 'Music' with the music icon",
    mod && mod.config.name === "The Smiths" && mod.config.spotify === false && mod.config.airplay === true && side.config.pages.some((p) => p.key === "music" && p.label === "Music" && p.icon === "music"), mod && mod.config);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
})();
