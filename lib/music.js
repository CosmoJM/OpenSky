/* OpenSky Music add-on (server side) — what's playing on this screen's speakers, and its buttons.
 * Used by MMM-OpenSky-Music's node helper. Both receivers are optional; `opensky addon music` installs them.
 *   spotify — go-librespot (Spotify Connect) and its local API on 127.0.0.1:3678   (OPENSKY_SPOTIFY_API to test)
 *   airplay — shairport-sync (AirPlay) on the session D-Bus (MPRIS), read with busctl  (OPENSKY_BUSCTL to test)
 * state()  → { source, playing, title, artist, album, art, position, duration } or null (nothing playing)
 * control(source, action)   action: "playpause" | "next" | "previous"
 */
const fs = require("fs");
const { execFile } = require("child_process");

const SPOTIFY = process.env.OPENSKY_SPOTIFY_API || "http://127.0.0.1:3678";
const BUSCTL = process.env.OPENSKY_BUSCTL || "busctl";
const MPRIS = ["org.mpris.MediaPlayer2.ShairportSync", "/org/mpris/MediaPlayer2"];

/* ---------------- Spotify Connect (go-librespot) ---------------- */
async function spotifyCall(method, path, body) {
  const r = await fetch(`${SPOTIFY}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Spotify speaker: HTTP ${r.status}`);
  return method === "GET" ? r.json() : null;
}

const spotify = {
  async state() {
    let st;
    try { st = await spotifyCall("GET", "/status"); } catch (e) { return null; }   // not installed / not running
    const t = st && st.track;
    if (!t || st.stopped) return null;
    return {
      source: "spotify", playing: !st.paused, buffering: !!st.buffering,
      title: String(t.name || ""), artist: (t.artist_names || []).join(", "), album: String(t.album_name || ""),
      art: t.album_cover_url || null, position: Number(t.position) || 0, duration: Number(t.duration) || 0
    };
  },
  async control(action) {
    const path = { playpause: "/player/playpause", next: "/player/next", previous: "/player/prev" }[action];
    if (path) await spotifyCall("POST", path);
  }
};

/* ---------------- AirPlay (shairport-sync over MPRIS) ---------------- */
const busctl = (args) => new Promise((resolve) => {
  execFile(BUSCTL, ["--user", ...args], { timeout: 3000 }, (e, out) => resolve(e ? null : String(out)));
});
const val = (v) => (v && typeof v === "object" && "data" in v ? v.data : v);
let artCache = { path: null, url: null };

// cover art is a file in shairport-sync's cache: sent to the page as a data: URL (once per new picture)
function artFrom(url) {
  if (!url || !/^file:\/\//.test(url)) return /^https?:\/\//.test(url || "") ? url : null;
  const file = decodeURIComponent(url.slice(7));
  if (artCache.path === file) return artCache.url;
  try {
    const buf = fs.readFileSync(file);
    if (buf.length > 3 * 1024 * 1024) return null;
    const type = buf[0] === 0x89 ? "image/png" : "image/jpeg";
    artCache = { path: file, url: `data:${type};base64,${buf.toString("base64")}` };
    return artCache.url;
  } catch (e) { return null; }
}

const airplay = {
  async state() {
    const out = await busctl(["--json=short", "call", ...MPRIS, "org.freedesktop.DBus.Properties", "GetAll", "s", "org.mpris.MediaPlayer2.Player"]);
    if (!out) return null;
    let p;
    try { p = (JSON.parse(out).data || [])[0] || {}; } catch (e) { return null; }
    const status = val(p.PlaybackStatus), md = val(p.Metadata) || {};
    const title = val(md["xesam:title"]);
    if (!status || status === "Stopped" || !title) return null;
    const artists = val(md["xesam:artist"]);
    return {
      source: "airplay", playing: status === "Playing", buffering: false,
      title: String(title), artist: Array.isArray(artists) ? artists.join(", ") : String(artists || ""), album: String(val(md["xesam:album"]) || ""),
      art: artFrom(val(md["mpris:artUrl"])),
      position: Math.round((Number(val(p.Position)) || 0) / 1000), duration: Math.round((Number(val(md["mpris:length"])) || 0) / 1000)
    };
  },
  async control(action) {
    const method = { playpause: "PlayPause", next: "Next", previous: "Previous" }[action];
    if (method && (await busctl(["call", ...MPRIS, "org.mpris.MediaPlayer2.Player", method])) === null) throw new Error("The AirPlay phone didn't take the button — use the phone");
  }
};

const SOURCES = { spotify, airplay };

module.exports = {
  /** What's playing: the source that plays beats a paused one; null when nothing is on. */
  async state(enabled = { spotify: true, airplay: true }) {
    const all = (await Promise.all(Object.entries(SOURCES).filter(([k]) => enabled[k] !== false).map(([, s]) => s.state()))).filter(Boolean);
    return all.find((s) => s.playing) || all[0] || null;
  },
  async control(source, action) {
    if (!SOURCES[source]) throw new Error("Unknown music source");
    return SOURCES[source].control(action);
  },
  SOURCES: Object.keys(SOURCES)
};
