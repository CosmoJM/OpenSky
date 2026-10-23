/* MMM-OpenSky-Music node helper — polls what's playing (lib/music.js) and passes the buttons on.
 * Screen ↔ helper:  OS_MUSIC_INIT {spotify, airplay, speakers: [entity…]} → OS_MUSIC_STATE {now, installed, speakers}
 *                   OS_MUSIC_CONTROL {source, action, entity?, value?} → OS_MUSIC_STATE (or OS_MUSIC_ERROR {message})
 *                   OS_MUSIC_VISIBLE true|false   (every second while the page shows; else this screen's speakers every 2 s —
 *                   so a song's start is seen at once — and the other speakers every 3 s while one plays, else 10 s)
 *                   OS_MUSIC_ART {id, url}   — a cover picture, sent once; the states name it "art:<id>"
 *                   OS_MUSIC_ART_GET id      — the page lost a picture (it keeps the last few): send it again
 * now = what plays on this screen (AirPlay / Spotify); speakers = the other speakers (Home Assistant media players).
 */
const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const music = require(path.join(global.root_path, "modules", "opensky-lib", "music.js"));

// installed by `opensky addon music` (tests: OPENSKY_MUSIC_INSTALLED=spotify,airplay)
function installed() {
  if (process.env.OPENSKY_MUSIC_INSTALLED != null) {
    const on = process.env.OPENSKY_MUSIC_INSTALLED.split(",");
    return { spotify: on.includes("spotify"), airplay: on.includes("airplay") };
  }
  const units = path.join(process.env.XDG_CONFIG_HOME || path.join(require("os").homedir(), ".config"), "systemd", "user");
  return { spotify: fs.existsSync(path.join(units, "opensky-spotify.service")), airplay: fs.existsSync(path.join(units, "opensky-airplay.service")) };
}

module.exports = NodeHelper.create({
  start() {
    this.enabled = { spotify: true, airplay: true };
    this.entities = [];
    this.visible = false;
    this.last = "";
    this.timer = null;
    this.artSent = new Set();   // cover pictures the page already has
    this.speakerState = [];     // the other speakers, last asked
    this.speakersAt = 0;
  },

  // a cover picture (a data: URL up to a few MB) goes to the page once; the states only name it
  slim(n) {
    if (!n || !n.art || !n.art.startsWith("data:")) return n;
    const id = crypto.createHash("sha1").update(n.art).digest("hex").slice(0, 16);
    if (!this.artSent.has(id)) { this.artSent.add(id); this.sendSocketNotification("OS_MUSIC_ART", { id, url: n.art }); }
    return { ...n, art: `art:${id}` };
  },

  socketNotificationReceived(n, p) {
    if (n === "OS_MUSIC_INIT") {
      this.enabled = { spotify: !(p && p.spotify === false), airplay: !(p && p.airplay === false) };
      this.entities = Array.isArray(p && p.speakers) ? p.speakers : [];
      this.installed = installed();
      this.artSent.clear();   // (a new page: it has no pictures yet)
      this.last = "";
      this.poll();
    } else if (n === "OS_MUSIC_VISIBLE") {
      this.visible = !!p;
      if (this.visible) { this.last = ""; this.poll(); }
    } else if (n === "OS_MUSIC_ART_GET" && p) {
      this.artSent.delete(String(p));
      this.last = ""; this.poll();
    } else if (n === "OS_MUSIC_CONTROL" && p) {
      music.control(p.source, p.action, p.entity, p.value)
        .catch((e) => { console.error(`[OpenSky] music: ${e.message}`); this.sendSocketNotification("OS_MUSIC_ERROR", { message: e.message }); })
        .finally(() => setTimeout(() => { this.last = ""; this.poll(); }, 400));
    }
  },

  async poll() {
    clearTimeout(this.timer);
    const otherBusy = this.speakerState.some((s) => s.now && s.now.playing);
    const askSpeakers = this.entities.length && (this.visible || Date.now() - this.speakersAt >= (otherBusy ? 3000 : 10000));
    const [now, speakers] = await Promise.all([
      music.state(this.enabled).catch(() => null),
      askSpeakers ? music.speakers(this.entities).catch(() => []) : Promise.resolve(this.speakerState)
    ]);
    if (askSpeakers) { this.speakerState = speakers; this.speakersAt = Date.now(); }
    const msg = { now: this.slim(now), installed: this.installed || installed(), speakers: speakers.map((sp) => ({ ...sp, now: this.slim(sp.now) })) };
    // sent when something changed — not for the position alone (the page moves the bar on by itself) — and every 15 s
    const key = JSON.stringify(msg, (k, v) => (k === "position" ? undefined : v)) + Math.floor(Date.now() / 15000);
    if (key !== this.last) { this.last = key; this.sendSocketNotification("OS_MUSIC_STATE", msg); }
    this.timer = setTimeout(() => this.poll(), this.visible ? 1000 : 2000);
  },

  stop() { clearTimeout(this.timer); }
});
