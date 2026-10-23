#!/usr/bin/env node
/* OpenSky Music add-on: writes a speaker's config file from opensky.json. Its service runs this just before it
 * starts, so a new speaker name (phone setup → Extras → Music) is used after the next restart.
 *   node render.js airplay <dir>   → <dir>/shairport-sync.conf   (AirPlay: shairport-sync)
 *   node render.js spotify <dir>   → <dir>/spotify/config.yml    (Spotify Connect: go-librespot)
 * Settings: OPENSKY_SETTINGS (default ../../config/opensky.json).
 */
const fs = require("fs");
const path = require("path");

const SETTINGS = process.env.OPENSKY_SETTINGS || path.join(__dirname, "..", "..", "config", "opensky.json");
const SPOTIFY_PORT = 3678;     // go-librespot's API (127.0.0.1 only) — lib/music.js reads it
const AIRPLAY_PORT = 5100;     // AirPlay 1 (not 5000: often used by other things on a Pi)

function settings() { try { return JSON.parse(fs.readFileSync(SETTINGS, "utf8")); } catch (e) { return {}; } }

/** The speaker's name on phones: music.name, else the family name, else "OpenSky" (same rule as config/config.js). */
function speakerName(s) {
  const n = String((s.music && s.music.name) || (s.family && s.family.name) || "OpenSky").replace(/[\u0000-\u001f"\\]/g, "").trim().slice(0, 40);
  return n || "OpenSky";
}

function airplay(s, dir) {
  const q = (v) => `"${String(v).replace(/[\\"]/g, "")}"`;   // (names and paths have no quotes or backslashes)
  return `// OpenSky Music add-on — written by services/music/render.js from opensky.json; edits here are replaced.
general = {
  name = ${q(speakerName(s))};
  output_backend = "pa";
  port = ${AIRPLAY_PORT};
  dbus_service_bus = "session";
  mpris_service_bus = "session";
};
sessioncontrol = {
  allow_session_interruption = "yes";   // another phone can take over
  session_timeout = 20;
};
pa = {
  application_name = "OpenSky AirPlay";
};
metadata = {
  enabled = "yes";
  include_cover_art = "yes";
  cover_art_cache_directory = ${q(path.join(dir, "coverart"))};
  pipe_name = ${q(path.join(dir, "airplay-metadata"))};
};
`;
}

function spotify(s) {
  const y = (v) => JSON.stringify(String(v));   // a JSON string is a valid YAML string
  return `# OpenSky Music add-on — written by services/music/render.js from opensky.json; edits here are replaced.
device_name: ${y(speakerName(s))}
device_type: speaker
audio_backend: pulseaudio
bitrate: 320
volume_steps: 100
zeroconf_enabled: true
zeroconf_backend: avahi
credentials:
  type: zeroconf
  zeroconf:
    persist_credentials: false
server:
  enabled: true
  address: localhost
  port: ${SPOTIFY_PORT}
`;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
}

if (require.main === module) {
  const [what, dir] = process.argv.slice(2);
  if (!dir || !["airplay", "spotify"].includes(what)) { console.error("usage: render.js airplay|spotify <dir>"); process.exit(2); }
  const s = settings();
  if (what === "airplay") write(path.join(dir, "shairport-sync.conf"), airplay(s, dir));
  else write(path.join(dir, "spotify", "config.yml"), spotify(s));
  console.log(`[OpenSky] music: ${what} speaker "${speakerName(s)}"`);
}

module.exports = { speakerName, airplay, spotify, SPOTIFY_PORT, AIRPLAY_PORT };
