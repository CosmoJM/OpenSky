/* OpenSky shared screen-side helpers (loaded by modules via getScripts: "modules/opensky-lib/client/opensky-client.js").
 * Defines window.OpenSkyEventColors and window.OpenSkyFit. Safe to load more than once.
 */
(function () {
  if (window.OpenSkyEventColors) return;

  /* ---------- Event colours ----------
   * Every event gets a pale background + a solid side bar from a named palette. Choose colours in opensky.json:
   *   calendar.colors.calendars: { "<calendar name>": "blue" }       — all events of one calendar
   *   calendar.colors.rules: [{ "match": "dentist", "color": "indigo" }] — title keywords (case-insensitive)
   *   calendar.sources[].color                                         — a source's own colour
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

    // Priority: keyword rule → calendar colour in settings → the source's own colour → a stable palette colour
    name(ev) {
      const title = String(ev.title || "").toLowerCase().replace(/\s+/g, " ").trim();
      const rule = this.rules.find((r) => r.re.test(title));
      if (rule) return rule.color;
      const cal = this.calendars[ev.calendarName];
      if (PALETTE[cal]) return cal;
      if (PALETTE[ev.colorName]) return ev.colorName;
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

    // Widen cut-off titles one at a time while `fits()` stays true (Home day tiles)
    grow(pills, titleSel, fits) {
      for (const pill of pills) {
        if (!this.truncated(pill.querySelector(titleSel))) continue;
        pill.classList.add("mf-two");
        if (!fits()) { pill.classList.remove("mf-two"); break; }
      }
    },

    // Month view: one week's event layer. CalendarExt3 places events in a grid of --maxeventlines rows
    // (grid-auto-flow: column dense); a single-day event may span 2 rows if its day has a free row.
    cx3Week(layer) {
      const evs = [...layer.querySelectorAll(":scope > .event")];
      const reset = (e) => { e.classList.remove("mf-two"); e.style.gridRow = ""; };
      evs.forEach(reset);
      const cx3 = layer.closest(".CX3");
      const lines = parseInt(getComputedStyle(cx3).getPropertyValue("--maxeventlines"), 10) || 3;
      const cols = (e) => { const m = (e.style.gridColumn || "").match(/(\d+)\s*\/\s*(\d+)/); return m ? [+m[1], +m[2]] : null; };
      const used = {};
      evs.forEach((e) => { const c = cols(e); if (c) for (let i = c[0]; i < c[1]; i++) used[i] = (used[i] || 0) + 1; });
      const shown = () => evs.filter((e) => e.getBoundingClientRect().height > 1).length;
      const before = shown();
      const changed = [];
      evs.forEach((e) => {
        const c = cols(e);
        if (!c || c[1] - c[0] !== 1 || used[c[0]] + 1 > lines) return;
        if (!this.truncated(e.querySelector(".title"))) return;
        used[c[0]]++;
        e.classList.add("mf-two");
        e.style.gridRow = "span 2";
        changed.push(e);
      });
      if (!changed.length) return;
      // Safety net: if anything got hidden or clipped, undo this week
      const box = layer.getBoundingClientRect();
      if (shown() < before || evs.some((e) => { const r = e.getBoundingClientRect(); return r.height > 1 && r.bottom > box.bottom + 1; })) changed.forEach(reset);
    },

    cx3All() {
      document.querySelectorAll(".CX3 .week .eventContainer").forEach((layer) => {
        if (layer.getBoundingClientRect().width > 0) this.cx3Week(layer);   // only while the page is visible
      });
    }
  };

  /* Shared toast: OpenSkyToast("Saved", "success" | "error" | "info"). Styles: css/opensky.css (.os-toast). */
  let toastTimer = null;
  window.OpenSkyToast = function (message, type = "info") {
    let toast = document.querySelector(".os-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "os-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), type === "error" ? 5000 : 2500);
  };

  /* One list as a column (Home's lists card, the Lists page). Styles: lib/client/list-columns.css.
   * list = { id, title, color, items: [{ id, text, done? }], loaded, error }
   * on = { add(), check(item, row), edit(item) } — the caller sends OPENSKY_LIST_ADD / _CHECK / _EDIT. */
  const svg = (paths, w = 2.4) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  window.OpenSkyListColumn = {
    render(list, on, { alt = false } = {}) {
      const col = document.createElement("div");
      col.className = "lc-list" + (alt ? " alt" : "");   // default colours alternate blue, peach, blue…
      const named = window.OpenSkyEventColors && window.OpenSkyEventColors.PALETTE[list.color];
      if (named) {                                         // a palette colour name → accent, pale tint, dark text
        col.style.setProperty("--list-accent", named[1]);
        col.style.setProperty("--list-tint", `color-mix(in srgb, ${named[1]} 7%, white)`);
        col.style.setProperty("--list-dark", `color-mix(in srgb, ${named[1]} 78%, black)`);
      }
      const items = list.items || [];
      col.innerHTML = `
        <div class="lc-list-head"><span class="lc-list-title"></span><span class="lc-badge">${items.filter((it) => !it.done).length}</span></div>
        <button class="lc-add-item">${svg(`<path d="M12 5v14M5 12h14"/>`, 2)}<span>Add item</span></button>
        <div class="lc-items"></div>`;
      col.querySelector(".lc-list-title").textContent = list.title || "List";
      col.querySelector(".lc-add-item").onclick = () => on.add();
      const box = col.querySelector(".lc-items");
      if (list.loaded === false) box.innerHTML = `<div class="lc-empty">Loading…</div>`;
      else if (list.error && !items.length) {
        box.innerHTML = `<div class="lc-empty lc-list-error"></div>`;
        box.firstChild.textContent = list.error;
      } else if (!items.length) {
        // (no emoji: Raspberry Pi OS has no colour-emoji font)
        box.innerHTML = `<div class="lc-empty lc-all-done">${svg(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>`)}All done!</div>`;
      }
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "lc-item" + (item.done ? " is-done" : "");
        row.innerHTML = `<button class="lc-check" aria-label="Check off"></button><span class="lc-item-text"></span>`;
        row.querySelector(".lc-item-text").textContent = item.text;
        row.querySelector(".lc-check").onclick = () => { if (!item.done) on.check(item, row); };
        row.querySelector(".lc-item-text").onclick = () => { if (!item.done) on.edit(item); };
        box.appendChild(row);
      });
      return col;
    }
  };
})();
