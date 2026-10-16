/* MMM-OpenSky-Settings
 * The Settings panel (sidebar → Settings): Screen (brightness, evening dim), Sleep schedule, Sound, System.
 * Opens on OPENSKY_SETTINGS_OPEN; closes on OPENSKY_IDLE_RESET / PAGE_CHANGED or its × . Lives on <body> like the popups.
 * The hardware side (backlight / DDC/CI / volume / restart / update / power) is the node helper's.
 *
 * Sleep schedule: at the "off" time the screen sleeps (unless a timer is running). A touch wakes it; after a few
 * idle minutes in the night it sleeps again. At the "on" time it wakes. While asleep the hardware brightness goes to 0.
 */
Module.register("MMM-OpenSky-Settings", {
  defaults: {
    resleepMinutes: 3     // at night, back to sleep after this long without a touch
  },

  getStyles() { return ["MMM-OpenSky-Settings.css"]; },
  getScripts() { return ["modules/opensky-lib/client/opensky-client.js"]; },

  start() {
    this.state = null;
    this.status = null;
    this.confirming = null;
    this.sendSocketNotification("OS_SET_INIT");
    setInterval(() => this.checkSchedule(), 30 * 1000);
  },

  getDom() { return document.createElement("div"); },

  notificationReceived(n, p) {
    if (n === "OPENSKY_SETTINGS_OPEN") this.open();
    else if ((n === "OPENSKY_IDLE_RESET" || n === "PAGE_CHANGED") && this.isOpen()) this.close();
    else if (n === "OPENSKY_SCREEN_SLEEP") this.sendSocketNotification("OS_SET_ASLEEP", !!p);
  },

  socketNotificationReceived(n, p) {
    if (n === "OS_SET_STATE") {
      this.state = p;
      // Every change gets one reply. While some are still on their way, the controls already show what was picked;
      // once all are back the state includes every tap: redraw if the layout changed (a switch), else sync values.
      if (this.inflight > 0) this.inflight--;
      if (this.isOpen() && !this.inflight) {
        if (this.shape(p) !== this.drawnShape) this.render();
        else this.syncControls();
      }
    } else if (n === "OS_SET_STATUS") {
      this.status = p;
      if (this.isOpen()) this.renderStatus();
    } else if (n === "OS_SET_SOFT_DIM") {
      this.softDim(p);
    } else if (n === "OS_SET_SYSTEM_RESULT" && p) {
      window.OpenSkyToast(p.message, p.ok ? "success" : "error");
    }
  },

  /* ---------------- sleep schedule ---------------- */
  sidebar() { return MM.getModules().withClass("MMM-OpenSky-Sidebar")[0]; },
  timerBusy() { const t = MM.getModules().withClass("MMM-OpenSky-Timer")[0]; return !!(t && Array.isArray(t.timers) && t.timers.length); },
  nightNow(now = new Date()) {
    const z = this.state && this.state.settings.sleep;
    if (!z || !z.enabled) return false;
    const m = (t) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
    const mins = now.getHours() * 60 + now.getMinutes(), off = m(z.off), on = m(z.on);
    return off > on ? mins >= off || mins < on : mins >= off && mins < on;
  },

  checkSchedule(now = new Date()) {
    const night = this.nightNow(now), sb = this.sidebar();
    if (!sb || !this.state) return;
    const wasNight = this.wasNight;
    this.wasNight = night;
    if (wasNight === undefined) return;   // first check after start: just learn where we are
    if (night && !wasNight && !this.timerBusy()) this.sendNotification("OPENSKY_SLEEP");
    else if (!night && wasNight) this.sendNotification("OPENSKY_WAKE");
    else if (night && !sb.isAsleep() && !this.isOpen() && !this.timerBusy() && sb.idleSeconds() >= this.config.resleepMinutes * 60) this.sendNotification("OPENSKY_SLEEP");
  },

  // Software brightness (no hardware control): a see-through black layer over everything, ignoring touches
  softDim(level) {
    if (!this.dim) {
      this.dim = document.createElement("div");
      this.dim.className = "ost-dim";
      document.body.appendChild(this.dim);
    }
    this.dim.style.opacity = String(Math.max(0, Math.min(0.8, (100 - level) / 100)));
  },

  shape(st) {
    return st ? JSON.stringify([st.settings.eveningDim.enabled, st.settings.sleep.enabled, st.brightness.method, !!st.audio, st.canRestart]) : "";
  },

  /* ---------------- panel ---------------- */
  isOpen() { return !!(this.panel && !this.panel.hidden); },

  open() {
    if (!this.panel) {
      this.panel = document.createElement("div");
      this.panel.className = "ost-overlay";
      this.panel.hidden = true;
      this.panel.addEventListener("click", (e) => { if (e.target === this.panel) this.close(); });
      document.body.appendChild(this.panel);
    }
    this.confirming = null;
    this.inflight = 0;
    this.panel.hidden = false;
    this.render();
    this.sendSocketNotification("OS_SET_STATUS");
  },

  close() { if (this.panel) this.panel.hidden = true; this.confirming = null; },

  change(c) { this.inflight = (this.inflight || 0) + 1; this.sendSocketNotification("OS_SET_CHANGE", c); },

  // Put the saved values into the controls without rebuilding them
  syncControls() {
    const s = this.state.settings, q = (sel) => this.panel.querySelector(sel);
    const vals = { brightness: s.brightness, dimLevel: s.eveningDim.level, volume: this.state.audio && this.state.audio.volume };
    for (const [id, v] of Object.entries(vals)) {
      const el = q(`.ost-slider[data-id="${id}"]`);
      if (el && v != null) { el.value = v; q(`.ost-value[data-for="${id}"]`).textContent = `${v}%`; }
    }
    for (const [id, t] of Object.entries({ dimFrom: s.eveningDim.from, sleepOff: s.sleep.off, sleepOn: s.sleep.on })) {
      const el = q(`.ost-stepper[data-id="${id}"]`);
      if (el) { el.dataset.time = t; el.querySelector(".ost-time").textContent = this.fmt(t); }
    }
  },

  render() {
    if (!this.panel) return;
    const st = this.state;
    if (!st) { this.panel.innerHTML = `<div class="ost-panel"><div class="ost-loading">Loading…</div></div>`; return; }
    const s = st.settings;
    this.drawnShape = this.shape(st);
    const methodNote = { backlight: "The display's own backlight", ddc: "The monitor's brightness (over HDMI)", software: "Dims the picture (this screen doesn't take brightness commands)" }[st.brightness.method] || "";
    this.panel.innerHTML = `
      <div class="ost-panel" role="dialog" aria-label="Settings">
        <div class="ost-head"><span class="ost-title">Settings</span><button class="ost-x" aria-label="Close">×</button></div>
        <div class="ost-body">
          <section class="ost-section">
            <h3>Screen</h3>
            <div class="ost-row"><span class="ost-label">Brightness</span>${this.slider("brightness", s.brightness, 10, 100)}</div>
            <div class="ost-note">${methodNote}</div>
            <div class="ost-row">${this.toggle("dim", s.eveningDim.enabled)}<span class="ost-label">Dim in the evening</span></div>
            <div class="ost-sub" ${s.eveningDim.enabled ? "" : "hidden"}>
              <div class="ost-row"><span class="ost-label">From</span>${this.stepper("dimFrom", s.eveningDim.from)}</div>
              <div class="ost-row"><span class="ost-label">Level</span>${this.slider("dimLevel", s.eveningDim.level, 10, 100)}</div>
            </div>
          </section>
          <section class="ost-section">
            <h3>Sleep at night</h3>
            <div class="ost-row">${this.toggle("sleep", s.sleep.enabled)}<span class="ost-label">Turn the screen off at night</span></div>
            <div class="ost-sub" ${s.sleep.enabled ? "" : "hidden"}>
              <div class="ost-row"><span class="ost-label">Off at</span>${this.stepper("sleepOff", s.sleep.off)}</div>
              <div class="ost-row"><span class="ost-label">On at</span>${this.stepper("sleepOn", s.sleep.on)}</div>
              <div class="ost-note">A touch wakes it; it goes back to sleep after ${this.config.resleepMinutes} quiet minutes. A running timer keeps it on.</div>
            </div>
          </section>
          <section class="ost-section">
            <h3>Sound</h3>
            ${st.audio ? `
              <div class="ost-row"><span class="ost-label">Volume</span>${this.slider("volume", st.audio.volume, 0, 100)}<button class="ost-btn ost-test">Test</button></div>
              <div class="ost-note"></div>` : `<div class="ost-note">No speaker found. Plug one in (USB, HDMI or the headphone socket) and restart OpenSky.</div>`}
          </section>
          <section class="ost-section">
            <h3>System</h3>
            <div class="ost-status"></div>
            <div class="ost-buttons">
              <button class="ost-btn ost-phone" data-act="phone">Set up from your phone</button>
              <button class="ost-btn" data-act="reload">Reload screen</button>
              ${st.canRestart ? `<button class="ost-btn" data-act="restart-app">Restart OpenSky</button>` : ""}
              <button class="ost-btn ost-update" data-act="update" hidden>Update</button>
              <button class="ost-btn" data-act="reboot">Restart Pi</button>
              <button class="ost-btn ost-danger" data-act="shutdown">Shut down</button>
            </div>
          </section>
        </div>
      </div>`;
    const q = (sel) => this.panel.querySelector(sel);
    if (st.audio) q(".ost-section:nth-of-type(3) .ost-note").textContent = st.audio.name;
    q(".ost-x").onclick = () => this.close();
    this.bindSlider("brightness", (v) => this.change({ brightness: v }));
    this.bindSlider("dimLevel", (v) => this.change({ eveningDim: { level: v } }));
    this.bindSlider("volume", (v) => this.change({ volume: v }));
    this.bindToggle("dim", (on) => this.change({ eveningDim: { enabled: on } }));
    this.bindToggle("sleep", (on) => this.change({ sleep: { enabled: on } }));
    this.bindStepper("dimFrom", (t) => this.change({ eveningDim: { from: t } }));
    this.bindStepper("sleepOff", (t) => this.change({ sleep: { off: t } }));
    this.bindStepper("sleepOn", (t) => this.change({ sleep: { on: t } }));
    const test = q(".ost-test");
    if (test) test.onclick = () => this.sendNotification("TIMER_TEST_CHIME");
    this.panel.querySelectorAll("[data-act]").forEach((b) => { b.onclick = () => this.system(b); });
    this.renderStatus();
  },

  renderStatus() {
    const box = this.panel && this.panel.querySelector(".ost-status");
    if (!box) return;
    const s = this.status;
    if (!s) { box.textContent = "Checking…"; return; }
    const rows = [
      ["Internet", s.internet ? "Connected" : "Not connected"],
      ["Address", s.ip ? `${s.ip}` : "—"],
      ["OpenSky", (s.version || "—") + (s.updates ? ` · ${s.updates} update${s.updates === 1 ? "" : "s"} available` : s.updates === 0 ? " · up to date" : "")]
    ];
    box.innerHTML = rows.map(() => `<div class="ost-stat"><span></span><b></b></div>`).join("");
    box.querySelectorAll(".ost-stat").forEach((el, i) => { el.children[0].textContent = rows[i][0]; el.children[1].textContent = rows[i][1]; });
    const up = this.panel.querySelector(".ost-update");
    if (up) up.hidden = !(s.updates > 0);
  },

  // Restart Pi / Shut down / Update ask once more: the button changes to "Tap again to …" for a few seconds
  system(btn) {
    const act = btn.dataset.act;
    if (act === "reload") { window.location.reload(); return; }
    if (act === "phone") { this.close(); this.sendNotification("OPENSKY_SETUP_OPEN"); return; }
    const confirmText = { "restart-app": null, update: "Tap again to update", reboot: "Tap again to restart", shutdown: "Tap again to shut down" }[act];
    if (confirmText && this.confirming !== act) {
      this.confirming = act;
      const label = btn.textContent;
      btn.textContent = confirmText;
      btn.classList.add("ost-confirm");
      setTimeout(() => { if (this.confirming === act) { this.confirming = null; btn.textContent = label; btn.classList.remove("ost-confirm"); } }, 4000);
      return;
    }
    this.confirming = null;
    this.sendSocketNotification("OS_SET_SYSTEM", { action: act });
    btn.disabled = true;
  },

  /* ---------------- controls ---------------- */
  slider(id, value, min, max) {
    return `<input type="range" class="ost-slider" data-id="${id}" min="${min}" max="${max}" step="5" value="${value}"><span class="ost-value" data-for="${id}">${value}%</span>`;
  },
  toggle(id, on) { return `<button class="ost-toggle${on ? " on" : ""}" data-id="${id}" role="switch" aria-checked="${on}"><span></span></button>`; },
  stepper(id, time) {
    return `<span class="ost-stepper" data-id="${id}" data-time="${time}"><button class="ost-step" data-d="-15" aria-label="Earlier">−</button><span class="ost-time">${this.fmt(time)}</span><button class="ost-step" data-d="15" aria-label="Later">+</button></span>`;
  },
  fmt(t) {
    const [h, m] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(config.locale || "en-US", { hour: "numeric", minute: "2-digit", hour12: config.timeFormat !== 24 });
  },

  bindSlider(id, send) {
    const el = this.panel.querySelector(`.ost-slider[data-id="${id}"]`);
    if (!el) return;
    const out = this.panel.querySelector(`.ost-value[data-for="${id}"]`);
    let timer = null;
    el.addEventListener("input", () => {
      out.textContent = `${el.value}%`;
      clearTimeout(timer);
      timer = setTimeout(() => send(Number(el.value)), 150);   // follow the finger without flooding the hardware
    });
    el.addEventListener("change", () => { clearTimeout(timer); send(Number(el.value)); });
  },
  bindToggle(id, send) {
    const el = this.panel.querySelector(`.ost-toggle[data-id="${id}"]`);
    el.onclick = () => send(!el.classList.contains("on"));
  },
  bindStepper(id, send) {
    const el = this.panel.querySelector(`.ost-stepper[data-id="${id}"]`);
    el.querySelectorAll(".ost-step").forEach((b) => {
      b.onclick = () => {
        const [h, m] = el.dataset.time.split(":").map(Number);
        const mins = (((h * 60 + m + Number(b.dataset.d)) % 1440) + 1440) % 1440;
        const t = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        el.dataset.time = t;
        el.querySelector(".ost-time").textContent = this.fmt(t);
        send(t);
      };
    });
  }
});
