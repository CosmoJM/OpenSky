/* MMM-OpenSky-EventEditor node helper — makes the change the page asked for.
 *   OS_EV {id, op: "create"|"update"|"delete", calendar, ref: {originalTitle, originalStart}, data} → OS_EV_RESULT {id, ok, error}
 * type "local"  → lib/local-calendar.js (the on-device calendar)
 * type "caldav" → OpenSky's calendar service on this Pi (services/calendar-service, 127.0.0.1 only)
 */
const NodeHelper = require("node_helper");
const path = require("path");
const local = require(path.join(global.root_path, "modules", "opensky-lib", "local-calendar.js"));

module.exports = NodeHelper.create({
  socketNotificationReceived(n, p) {
    if (n === "OS_EV_INIT") { this.editable = (p && p.editable) || []; this.servicePort = (p && p.servicePort) || 5050; return; }
    if (n !== "OS_EV" || !p || !p.id) return;
    this.handle(p).then(
      () => this.sendSocketNotification("OS_EV_RESULT", { id: p.id, ok: true }),
      (e) => this.sendSocketNotification("OS_EV_RESULT", { id: p.id, ok: false, error: e.message })
    );
  },

  async handle({ op, calendar, ref, data }) {
    const cal = (this.editable || []).find((c) => c.name === calendar);
    if (!cal) throw new Error(`"${calendar}" can't be changed from this screen`);
    if (!["create", "update", "delete"].includes(op)) throw new Error("Unknown change");
    if (cal.type === "local") {
      if (op === "create") return local.create(calendar, data);
      if (op === "update") return local.update(calendar, ref, data);
      return local.remove(calendar, ref);
    }
    // CalDAV through the calendar service (it holds the account; the page never sees it)
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${this.servicePort}/${encodeURIComponent(calendar)}/${op}-event`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(ref || {}), ...(data || {}) }), signal: AbortSignal.timeout(25000)
      });
    } catch (e) {
      throw new Error("Can't reach the calendar service. Try again in a minute.");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Calendar service error (HTTP ${res.status})`);
  }
});
