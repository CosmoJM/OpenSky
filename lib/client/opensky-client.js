/* OpenSky shared screen-side helpers (loaded by modules via getScripts: "modules/opensky-lib/client/opensky-client.js").
 * Defines window.OpenSkyEventColors and window.OpenSkyFit. Safe to load more than once.
 */
(function () {
  if (window.OpenSkyEventColors) return;

  /* ---------- Event colours ----------
   * Every event gets a pale background + a solid side bar from a named palette. Choose colours in opensky.json:
   *   calendar.colors.calendars: { "<calendar name>": "blue" }       — all events of one calendar
   *   calendar.colors.rules: [{ "match": "dentist", "color": "indigo" }] — title keywords (case-insensitive)
   * Anything else gets a palette colour picked from its title, so the same title always has the same colour. */
  const PALETTE = {
    pink: ["#ffc2e2", "#dd4f98"], green: ["#d7f199", "#78b014"], blue: ["#b9ddff", "#2e8bd6"],
    orange: ["#ffc9a3", "#ec7a2c"], yellow: ["#ffe882", "#cfa000"], emerald: ["#b5edc4", "#2e9e57"],
    purple: ["#cdb4ff", "#7b4ae2"], red: ["#ffb3b3", "#e04848"], teal: ["#95e8d6", "#11998e"],
    indigo: ["#b8c2ff", "#4a5bd8"], tan: ["#efd9b5", "#b8864b"], gray: ["#e5e7eb", "#9ca3af"]
  };
  const AUTO = ["pink", "green", "blue", "orange", "yellow", "emerald"];

  window.OpenSkyEventColors = {
    PALETTE,
    calendars: {},
    rules: [],

    /** Called by modules with calendar.colors from the settings (any module may call it; last call wins). */
    configure(colors) {
      if (!colors) return;
      if (colors.calendars && typeof colors.calendars === "object") this.calendars = colors.calendars;
      if (Array.isArray(colors.rules)) {
        this.rules = colors.rules.filter((r) => r && r.match && PALETTE[r.color])
          .map((r) => ({ re: new RegExp(String(r.match).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), color: r.color }));
      }
    },

    name(ev) {
      const cal = this.calendars[ev.calendarName];
      if (PALETTE[cal]) return cal;
      const title = String(ev.title || "").toLowerCase().replace(/\s+/g, " ").trim();
      const rule = this.rules.find((r) => r.re.test(title));
      if (rule) return rule.color;
      let hash = 0;
      for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      return AUTO[hash % AUTO.length];
    },

    /** CSS custom properties for an event element: `style="${vars(ev)}"` */
    vars(ev) { const [bg, bar] = PALETTE[this.name(ev)]; return `--evc-bg:${bg};--evc-bar:${bar}`; },
    bar(ev) { return PALETTE[this.name(ev)][1]; }
  };

  /* ---------- Two-line event names, only where there's room ----------
   * A cut-off title may wrap to a second line, but only if that can't push another event out of view. */
  window.OpenSkyFit = {
    truncated(el) { return !!el && el.scrollWidth > el.clientWidth + 1; },

    // Widen cut-off titles one at a time while `fits()` stays true
    grow(pills, titleSel, fits) {
      for (const pill of pills) {
        if (!this.truncated(pill.querySelector(titleSel))) continue;
        pill.classList.add("mf-two");
        if (!fits()) { pill.classList.remove("mf-two"); break; }
      }
    }
  };
})();
