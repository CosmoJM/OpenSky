/* MMM-OpenSky-Sidebar — the full-height navigation strip on the left.
 *
 * - One tile per page, in the order of `pages` in opensky.json (config.js builds `config.pages`).
 *   The Home tile shows the family's initial as a badge.
 * - Sleep: asks the OpenSky screen service to turn the screen off when one is configured (`screenServiceUrl`);
 *   otherwise it shows a black "soft sleep" cover that the next touch removes. Works on any screen.
 * - Auto-return: after `idleReturnMinutes` without a touch, popups close, views reset and it goes back to the
 *   first page (not while a timer is running or ringing on the Timer page). 0 = off.
 *
 * Notifications sent: PAGE_CHANGED (MMM-pages), OPENSKY_IDLE_RESET, OPENSKY_SCREEN_SLEEP (true/false),
 * OPENSKY_SETTINGS_OPEN, HIDE_KEYBOARD.   Received: PAGE_CHANGED, OPENSKY_WAKE (e.g. a timer finished),
 * OPENSKY_SLEEP (e.g. the Settings sleep schedule),
 * OPENSKY_TOAST { message, type: "error" | "success" | "info" } (the shared toast; the sidebar is always on screen).
 */
Module.register("MMM-OpenSky-Sidebar", {
  defaults: {
    pages: [],                   // [{ key, label, icon, index }] — built by config.js from opensky.json
    familyInitial: "H",
    screenServiceUrl: null,      // e.g. "http://127.0.0.1:5000" when the OpenSky screen service is installed
    idleReturnMinutes: 5,
    showSettings: false,         // true once a settings page/module is installed
    ui: { width: 92, gap: 8, tile: 76, icon: 28, font: 12 }
  },

  getStyles() { return ["MMM-OpenSky-Sidebar.css"]; },
  getScripts() { return ["modules/opensky-lib/client/opensky-client.js"]; },

  start() {
    this.activeIndex = 0;        // MMM-pages starts on its first page
    this.lastActivity = Date.now();
    this.idleHandled = false;
    const touch = () => { this.lastActivity = Date.now(); this.idleHandled = false; };
    ["pointerdown", "touchstart", "keydown", "wheel"].forEach((ev) => document.addEventListener(ev, touch, { capture: true, passive: true }));
    if (this.config.idleReturnMinutes > 0) setInterval(() => this.checkIdle(), 10 * 1000);
    document.documentElement.style.setProperty("--os-side-width", `${this.config.ui.width}px`);
  },

  notificationReceived(n, payload) {
    if (n === "PAGE_CHANGED" && Number.isInteger(payload)) {
      this.activeIndex = payload;
      this.syncActive();
    } else if (n === "OPENSKY_WAKE") {
      this.wake();
    } else if (n === "OPENSKY_SLEEP") {
      if (!this.isAsleep()) this.sleep();
    } else if (n === "OPENSKY_TOAST" && payload && payload.message) {
      window.OpenSkyToast(payload.message, payload.type || "info");
    }
  },

  /* ---------------- auto-return ---------------- */
  timerBusy() {
    const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0];
    return !!(t && Array.isArray(t.timers) && t.timers.length);
  },

  async checkIdle() {
    const limit = this.config.idleReturnMinutes * 60 * 1000;
    if (this.idleHandled || Date.now() - this.lastActivity < limit) return;
    // Touches inside embedded pages (<webview>) never reach this page; the screen service sees every input device
    if (this.config.screenServiceUrl) {
      try {
        const r = await fetch(`${this.config.screenServiceUrl}/idle`, { signal: AbortSignal.timeout(3000) });
        const secs = (await r.json()).idle_seconds;
        if (typeof secs === "number") this.lastActivity = Math.max(this.lastActivity, Date.now() - secs * 1000);
      } catch (e) { /* not available: page events only */ }
    }
    if (this.idleHandled || Date.now() - this.lastActivity < limit) return;
    this.idleHandled = true;
    const timerPage = this.config.pages.find((p) => p.key === "timer");
    if (timerPage && this.activeIndex === timerPage.index && this.timerBusy()) return;
    Log.info(`${this.name}: idle, returning to the first page`);
    this.sendNotification("OPENSKY_IDLE_RESET");
    this.sendNotification("HIDE_KEYBOARD");
    if (this.activeIndex !== 0) this.goPage(0);
  },

  /* ---------------- DOM ---------------- */
  getDom() {
    const ui = this.config.ui;
    const wrap = document.createElement("div");
    wrap.className = "os-side-wrap";
    wrap.style.setProperty("--tile-gap", `${ui.gap}px`);
    wrap.style.setProperty("--tile-size", `${ui.tile}px`);
    wrap.style.setProperty("--icon-size", `${ui.icon}px`);
    wrap.style.setProperty("--label-size", `${ui.font}px`);
    wrap.innerHTML = `<div class="os-side-track"></div><div class="os-side-col"></div>`;
    const col = wrap.querySelector(".os-side-col");

    this.config.pages.forEach((p) => {
      const icon = p.key === "home" ? `<span class="os-badge">${this.escape(this.config.familyInitial)}</span>` : this.icon(p.icon || p.key);
      col.appendChild(this.tile(`page-${p.key}`, icon, p.label, () => this.goPage(p.index)));
    });
    const spacer = document.createElement("div");
    spacer.className = "os-side-spacer";
    col.appendChild(spacer);
    col.appendChild(this.tile("sleep", this.icon("sleep"), "Sleep", () => this.sleep(), true));
    if (this.config.showSettings) col.appendChild(this.tile("settings", this.icon("settings"), "Settings", () => this.sendNotification("OPENSKY_SETTINGS_OPEN"), true));
    this.col = col;
    this.syncActive();
    return wrap;
  },

  tile(key, iconHtml, label, handler, utility = false) {
    const b = document.createElement("button");
    b.className = `os-tile os-${key}` + (utility ? " os-utility" : "");
    b.dataset.key = key;
    b.innerHTML = `<div class="os-icon">${iconHtml}</div><div class="os-label">${this.escape(label)}</div>`;
    b.onclick = handler;
    return b;
  },

  syncActive() {
    if (!this.col) return;
    const page = this.config.pages.find((p) => p.index === this.activeIndex);
    this.col.querySelectorAll(".os-tile").forEach((el) => el.classList.toggle("active", !!page && el.dataset.key === `page-${page.key}`));
  },

  goPage(index) {
    this.activeIndex = index;
    this.sendNotification("PAGE_CHANGED", index);
    this.syncActive();
  },

  /* ---------------- sleep / wake ---------------- */
  async sleep() {
    this.sendNotification("HIDE_KEYBOARD");
    if (this.config.screenServiceUrl) {
      try {
        // the screen service has no CORS headers; a no-cors request still runs it
        await fetch(`${this.config.screenServiceUrl}/monitor/off`, { mode: "no-cors", signal: AbortSignal.timeout(3000) });
        this.sendNotification("OPENSKY_SCREEN_SLEEP", true);
        return;
      } catch (e) { /* fall back to the soft-sleep cover */ }
    }
    this.softSleep(true);
  },

  // Black cover over everything; the waking touch is swallowed so it doesn't also press a button
  softSleep(on) {
    if (!this.cover) {
      const c = document.createElement("div");
      c.className = "os-sleep-cover";
      c.hidden = true;
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      ["pointerdown", "pointerup", "click", "touchstart", "touchend", "mousedown", "mouseup"].forEach((ev) => c.addEventListener(ev, swallow, true));
      c.addEventListener("pointerup", () => this.wake(), true);
      document.addEventListener("keydown", () => { if (!c.hidden) this.wake(); }, true);
      document.body.appendChild(c);
      this.cover = c;
    }
    if (on) { this.cover.hidden = false; this.sendNotification("OPENSKY_SCREEN_SLEEP", true); }
  },

  isAsleep() { return !!(this.cover && !this.cover.hidden); },
  idleSeconds() { return (Date.now() - this.lastActivity) / 1000; },

  wake() {
    if (!this.cover || this.cover.hidden) return;
    // keep the cover a moment so the tail of the waking touch is swallowed too
    setTimeout(() => { this.cover.hidden = true; }, 400);
    this.lastActivity = Date.now();
    this.sendNotification("OPENSKY_SCREEN_SLEEP", false);
  },

  /* ---------------- helpers ---------------- */
  escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); },

  // One consistent icon set: 24×24, 2 px round strokes (Lucide-style), coloured by CSS
  icon(name) {
    const p = {
      calendar: `<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/><path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17.5h.01M12 17.5h.01"/>`,
      lists: `<path d="M3.5 6.5l1.5 1.5 3-3M3.5 12.5l1.5 1.5 3-3M3.5 18.5l1.5 1.5 3-3"/><path d="M12 7h8.5M12 13h8.5M12 19h8.5"/>`,
      food: `<path d="M5 3v7a2 2 0 0 0 2 2h1v9M10 3v7M7.5 3v6"/><path d="M18 21V3c-2.2 0-4 2.2-4 6v4h4"/>`,
      wordgame: `<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><path d="M3 18.5h18"/>`,
      smarthome: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v10.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M8.8 14.2a4.5 4.5 0 0 1 6.4 0M10.4 16.3a2.2 2.2 0 0 1 3.2 0"/><path d="M12 18.4h.01"/>`,
      embed: `<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>`,
      timer: `<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>`,
      sleep: `<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11z"/>`,
      settings: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`
    }[name] || `<circle cx="12" cy="12" r="8"/>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
});
