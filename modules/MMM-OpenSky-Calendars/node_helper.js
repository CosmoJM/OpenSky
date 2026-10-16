/* MMM-OpenSky-Calendars node helper — fetches every calendar source on the Pi and hands the events to the page.
 * Uses MagicMirror's own calendar fetcher (recurring events, time zones, iCloud/Google/Outlook quirks).
 * Private calendar links (Google "secret address", iCloud sharing links, the local CalDAV feed) come from
 * secrets.json → calendar.sources.<name>, so they never appear in the config MagicMirror serves to the network.
 *   OS_CAL_START {sources: [{name, url|null, fetchMinutes}], days} → OS_CAL_EVENTS {name, events} | OS_CAL_ERROR {name, message}
 */
const NodeHelper = require("node_helper");
const path = require("path");
const CalendarFetcher = require(path.join(global.root_path, "defaultmodules", "calendar", "calendarfetcher.js"));
const { secret } = require(path.join(global.root_path, "modules", "opensky-lib", "secrets.js"));

module.exports = NodeHelper.create({
  start() { this.fetchers = new Map(); },

  socketNotificationReceived(n, p) {
    if (n !== "OS_CAL_START" || !p || !Array.isArray(p.sources)) return;
    for (const src of p.sources) {
      if (this.fetchers.has(src.name)) { this.fetchers.get(src.name).broadcastEvents(); continue; }   // page reload
      let url = src.url || secret(`calendar.sources.${src.name}`);
      if (!url) { this.sendSocketNotification("OS_CAL_ERROR", { name: src.name, message: `no link for "${src.name}" (set calendar.sources in opensky.json or secrets.json)` }); continue; }
      url = String(url).replace(/^webcal:\/\//i, "https://");
      try { new URL(url); } catch (e) { this.sendSocketNotification("OS_CAL_ERROR", { name: src.name, message: `"${src.name}" link isn't a valid URL` }); continue; }
      const f = new CalendarFetcher(url, Math.max(1, src.fetchMinutes || 5) * 60 * 1000, [], 1000, p.days || 400, undefined, true, false);
      f.onReceive((fetcher) => this.sendSocketNotification("OS_CAL_EVENTS", { name: src.name, events: fetcher.events }));
      f.onError((fetcher, err) => this.sendSocketNotification("OS_CAL_ERROR", { name: src.name, message: (err && err.message) || String(err) }));
      this.fetchers.set(src.name, f);
      f.fetchCalendar();
    }
  }
});
