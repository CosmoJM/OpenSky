/* OpenSky secrets reader (server side only).
 * Keys, tokens, passwords and PINs live in config/secrets.json — never in config.js, which MagicMirror serves to every
 * device on the network. Node helpers call `secret("weather.openweathermap.apiKey")`.
 * The file is re-read when it changes, so editing it doesn't need a restart.
 */
const fs = require("fs");
const path = require("path");

// MagicMirror sets global.root_path (its own folder); it also runs with that folder as the working directory
const MM_ROOT = global.root_path || process.cwd();
const FILE = process.env.OPENSKY_SECRETS || path.join(MM_ROOT, "config", "secrets.json");
let cache = null, mtime = 0;

function load() {
  try {
    const st = fs.statSync(FILE);
    if (st.mtimeMs !== mtime) { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); mtime = st.mtimeMs; }
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`[OpenSky] can't read secrets.json: ${e.message}`);
    cache = {}; mtime = 0;
  }
  return cache;
}

/** Value at a dotted path, or `fallback` when missing/empty. */
function secret(dotted, fallback = null) {
  let v = load();
  for (const k of dotted.split(".")) { if (v == null || typeof v !== "object") return fallback; v = v[k]; }
  return v === undefined || v === null || v === "" ? fallback : v;
}

module.exports = { secret, FILE };
