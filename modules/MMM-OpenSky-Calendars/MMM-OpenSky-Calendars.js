/* MMM-OpenSky-Calendars — the family's calendar sources (no screen of its own).
 * Fetches each source on the Pi (node helper) and broadcasts all events together as CALENDAR_EVENTS, the standard
 * MagicMirror notification, so the Home page, the month view and the header's birthday countdown all see them.
 * Each event carries calendarName (the source's name) and color (its palette colour), like MagicMirror's calendar.
 * Status for a settings page: OPENSKY_CALENDAR_STATUS { name: "ok" | "error message" }.
 */
Module.register("MMM-OpenSky-Calendars", {
  defaults: {
    sources: [],          // [{ name, url (public links only — private ones go in secrets.json), color, fetchMinutes }]
    days: 400             // how far ahead (and back) to keep events
  },

  getScripts() { return ["modules/opensky-lib/client/opensky-client.js"]; },

  start() {
    this.events = new Map();   // source name → events
    this.status = {};
    this.sendSocketNotification("OS_CAL_START", {
      sources: this.config.sources.map((s) => ({ name: s.name, url: s.url || null, fetchMinutes: s.fetchMinutes })),
      days: this.config.days
    });
  },

  socketNotificationReceived(n, p) {
    if (n === "OS_CAL_EVENTS") {
      this.events.set(p.name, Array.isArray(p.events) ? p.events : []);
      this.status[p.name] = "ok";
      this.broadcast();
    } else if (n === "OS_CAL_ERROR") {
      this.status[p.name] = p.message;
      Log.warn(`${this.name}: ${p.name}: ${p.message}`);
      this.sendNotification("OPENSKY_CALENDAR_STATUS", { ...this.status });
    }
  },

  broadcast() {
    const palette = window.OpenSkyEventColors && window.OpenSkyEventColors.PALETTE;
    const list = [];
    for (const src of this.config.sources) {
      const evs = this.events.get(src.name) || [];
      const color = palette && palette[src.color] ? palette[src.color][1] : "";
      for (const ev of evs) list.push({ ...ev, calendarName: src.name, color, colorName: src.color || null });
    }
    list.sort((a, b) => Number(a.startDate) - Number(b.startDate));
    this.sendNotification("CALENDAR_EVENTS", list);
    this.sendNotification("OPENSKY_CALENDAR_STATUS", { ...this.status });
  },

  notificationReceived(n) {
    // a page that asks again (e.g. after a reload) gets the current list
    if (n === "OPENSKY_CALENDAR_REFRESH" && this.events.size) this.broadcast();
  }
});
