/* MMM-OpenSky-Music node helper — polls what's playing (lib/music.js) and passes the buttons on.
 * Screen ↔ helper:  OS_MUSIC_INIT {spotify, airplay} → OS_MUSIC_STATE {now, installed}
 *                   OS_MUSIC_CONTROL {source, action} → OS_MUSIC_STATE (or OS_MUSIC_ERROR {message})
 *                   OS_MUSIC_VISIBLE true|false   (polls every second while the page shows or music plays, else every 5 s)
 */
const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
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
    this.visible = false;
    this.now = null;
    this.last = "";
    this.timer = null;
  },

  socketNotificationReceived(n, p) {
    if (n === "OS_MUSIC_INIT") {
      this.enabled = { spotify: !(p && p.spotify === false), airplay: !(p && p.airplay === false) };
      this.installed = installed();
      this.last = "";
      this.poll();
    } else if (n === "OS_MUSIC_VISIBLE") {
      this.visible = !!p;
      if (this.visible) { this.last = ""; this.poll(); }
    } else if (n === "OS_MUSIC_CONTROL" && p) {
      music.control(p.source, p.action)
        .catch((e) => { console.error(`[OpenSky] music: ${e.message}`); this.sendSocketNotification("OS_MUSIC_ERROR", { message: e.message }); })
        .finally(() => setTimeout(() => { this.last = ""; this.poll(); }, 400));
    }
  },

  async poll() {
    clearTimeout(this.timer);
    try { this.now = await music.state(this.enabled); } catch (e) { this.now = null; }
    const msg = { now: this.now, installed: this.installed || installed() };
    const key = JSON.stringify(msg);
    if (key !== this.last) { this.last = key; this.sendSocketNotification("OS_MUSIC_STATE", msg); }
    this.timer = setTimeout(() => this.poll(), this.visible || (this.now && this.now.playing) ? 1000 : 5000);
  },

  stop() { clearTimeout(this.timer); }
});
