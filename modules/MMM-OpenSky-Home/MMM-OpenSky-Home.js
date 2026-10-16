/* MMM-OpenSky-Home
 * The Home page: the week ahead (left), the family's lists and a photo card (right).
 *
 * Calendar card: today + the next 6 days as tiles, plus a "Next Week" tile.
 *   - events: any calendar source that broadcasts CALENDAR_EVENTS (MagicMirror's standard)
 *   - colours: window.OpenSkyEventColors (calendar.colors in opensky.json)
 *   - tap an event → CALENDAR_EVENT_CLICKED, a day → CALENDAR_DAY_CLICKED, "Add Event" → CALENDAR_ADD_EVENT
 *     (the event editor module answers these; "Add Event" only shows when one is installed)
 *   - daily high + icon from the header's shared forecast (OPENSKY_WEATHER)
 *   - curbside pickup icons next to the "N events" counter (pickup in opensky.json, lib/client/pickup.js)
 * Lists card: whatever list providers broadcast as OPENSKY_LISTS { source, lists: [{ id, title, color, items, loaded }] }.
 *   "Add item" → OPENSKY_LIST_ADD {source, listId}; circle → OPENSKY_LIST_CHECK {source, listId, item, el};
 *   text → OPENSKY_LIST_EDIT {source, listId, item}. No lists → the photo card takes the whole right side.
 * Photo card: a folder / USB stick (default) or Immich, via the node helper (/opensky-photo/<id>).
 *   Crossfades every photos.intervalSeconds, tap = next, pauses while another page is shown.
 */
Module.register("MMM-OpenSky-Home", {
  defaults: {
    listsPage: null,             // MMM-pages index of the Lists page ("See all"); null = no button
    canAddEvents: false,         // true when an event editor module is installed
    maxEventsPerDay: 4,
    eventColors: null,           // calendar.colors from opensky.json
    photos: { enabled: true, provider: "folder", folder: null, usb: true, url: null, intervalSeconds: 30 },
    pickup: null                 // resolved pickup schedule (see lib/client/pickup.js); null = no icons
  },

  getStyles() { return ["MMM-OpenSky-Home.css"]; },
  getScripts() { return ["modules/opensky-lib/client/opensky-client.js", "modules/opensky-lib/client/pickup.js"]; },

  start() {
    this.pools = new Map();      // sender identifier → events
    this.lists = new Map();      // list provider → lists
    this.weekOffset = 0;
    this.forecast = {};          // "YYYY-MM-DD" → { high, id }
    this.lastDay = new Date().toDateString();
    setInterval(() => {          // midnight: back to this week
      const today = new Date().toDateString();
      if (today !== this.lastDay) { this.lastDay = today; this.weekOffset = 0; this.render(); }
    }, 60 * 1000);
  },

  locale() { return (typeof config !== "undefined" && config.locale) || "en-US"; },

  resume() { this.startPhotos(); this.sendNotification("OPENSKY_LISTS_REFRESH"); this.render(); },
  suspend() { clearInterval(this.photoTimer); this.photoTimer = null; },

  notificationReceived(n, payload, sender) {
    if (n === "CALENDAR_EVENTS" && Array.isArray(payload) && sender) {
      this.pools.set(sender.identifier, payload);
      this.renderCalendar();
    } else if (n === "OPENSKY_WEATHER" && payload) {
      this.forecast = payload.daily || {};
      this.renderCalendar();
    } else if (n === "OPENSKY_LISTS" && payload && payload.source) {
      this.lists.set(payload.source, Array.isArray(payload.lists) ? payload.lists : []);
      this.renderLists();
    } else if (n === "DOM_OBJECTS_CREATED") {
      if (window.OpenSkyEventColors) window.OpenSkyEventColors.configure(this.config.eventColors);
      this.render();
      this.startPhotos();
      this.sendNotification("OPENSKY_LISTS_REFRESH");
    } else if (n === "OPENSKY_IDLE_RESET") {
      if (this.weekOffset !== 0) { this.weekOffset = 0; this.renderCalendar(); }
    } else if (n === "PAGE_CHANGED") {
      setTimeout(() => this.fitTitles(), 150);   // sizes are only measurable while the page is visible
    }
  },

  // Cut-off event names get a second line, but only while every pill (and "+N more") still fits
  fitTitles() {
    if (!this.root || !window.OpenSkyFit) return;
    this.root.querySelectorAll(".hd-day:not(.hd-nextweek)").forEach((tile) => {
      const pills = [...tile.querySelectorAll(".hd-event")];
      pills.forEach((p) => p.classList.remove("mf-two"));
      if (!pills.length || tile.getBoundingClientRect().height === 0) return;
      const inner = () => tile.getBoundingClientRect().bottom - parseFloat(getComputedStyle(tile).paddingBottom);
      const fits = () => { const last = tile.querySelector(".hd-day-events").lastElementChild; return last.getBoundingClientRect().bottom <= inner() + 0.5; };
      window.OpenSkyFit.grow(pills, ".hd-event-title", fits);
    });
  },

  getDom() {
    const root = document.createElement("div");
    root.className = "hd-root";
    root.innerHTML = `
      <section class="hd-card hd-calendar">
        <header class="hd-card-head">
          <span class="hd-card-label">${this.icon("calendar")} Calendar</span>
          <span class="hd-week-range"></span>
          <span class="hd-nav">
            ${this.config.canAddEvents ? `<button class="hd-nav-btn hd-add">${this.icon("plus")} Add Event</button>` : ""}
            <button class="hd-nav-btn hd-prev" aria-label="Previous week">${this.icon("left")}</button>
            <button class="hd-nav-btn hd-today">Today</button>
            <button class="hd-nav-btn hd-next" aria-label="Next week">${this.icon("right")}</button>
          </span>
        </header>
        <div class="hd-week"></div>
      </section>
      <div class="hd-right">
        <section class="hd-card hd-lists" hidden>
          <header class="hd-card-head">
            <span class="hd-card-label">${this.icon("list")} Lists</span>
            ${Number.isInteger(this.config.listsPage) ? `<button class="hd-see-all">See all ${this.icon("right")}</button>` : ""}
          </header>
          <div class="hd-list-columns"></div>
        </section>
        ${this.photosOn() ? `<section class="hd-photo" aria-label="Family photos">
          <div class="hd-photo-empty">${this.icon("image")}<span class="hd-photo-msg">Photos will appear here</span></div>
        </section>` : ""}
      </div>`;
    root.querySelector(".hd-prev").onclick = () => { this.weekOffset--; this.renderCalendar(); };
    root.querySelector(".hd-next").onclick = () => { this.weekOffset++; this.renderCalendar(); };
    root.querySelector(".hd-today").onclick = () => { this.weekOffset = 0; this.renderCalendar(); };
    const add = root.querySelector(".hd-add");
    if (add) add.onclick = () => this.sendNotification("CALENDAR_ADD_EVENT", { date: new Date() });
    const seeAll = root.querySelector(".hd-see-all");
    if (seeAll) seeAll.onclick = () => this.sendNotification("PAGE_CHANGED", this.config.listsPage);
    const photo = root.querySelector(".hd-photo");
    if (photo) photo.onclick = () => { this.nextPhoto(); this.startPhotos(true); };   // tap = next (restarts the interval)
    this.root = root;
    setTimeout(() => this.render(), 0);
    return root;
  },

  render() { this.renderCalendar(); this.renderLists(); },

  /* ======================= photos ======================= */
  photosOn() { return !!(this.config.photos && this.config.photos.enabled !== false); },

  startPhotos(restart = false) {
    if (!this.photosOn()) return;
    if (!this.photoInit) {
      this.photoInit = true;
      const p = this.config.photos;
      this.sendSocketNotification("PHOTO_INIT", { provider: p.provider, folder: p.folder, usb: p.usb, url: p.url });
    }
    if (this.photoTimer && !restart) return;
    clearInterval(this.photoTimer);
    if (!restart) this.nextPhoto();
    this.photoTimer = setInterval(() => this.nextPhoto(), Math.max(5, this.config.photos.intervalSeconds || 30) * 1000);
  },

  nextPhoto() {
    if (this.photoPending && Date.now() - this.photoPending < 20000) return;   // one request at a time
    this.photoPending = Date.now();
    this.sendSocketNotification("PHOTO_NEXT");
  },

  socketNotificationReceived(n, p) {
    if (n === "PHOTO") this.showPhoto(p);
    else if (n === "PHOTO_ERROR") {
      this.photoPending = 0;
      const msg = this.root && this.root.querySelector(".hd-photo-msg");
      if (msg && p && p.message) msg.textContent = p.message;   // e.g. "Add photos to ~/Pictures …"
    }
  },

  // Preload, then crossfade. Two portrait photos → side by side, each filling its half. A single photo close to the
  // card's shape fills the card; any other single photo is shown whole on a blurred copy of itself (no cropped heads).
  showPhoto(p) {
    const card = this.root && this.root.querySelector(".hd-photo");
    const photos = ((p && p.photos) || []).filter((ph) => ph && ph.id).slice(0, 2);
    if (!card || !photos.length) { this.photoPending = 0; return; }
    const url = (ph) => `/opensky-photo/${encodeURIComponent(ph.id)}`;
    const load = (ph) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url(ph); });
    Promise.all(photos.map(load)).then((imgs) => {
      this.photoPending = 0;
      const box = card.getBoundingClientRect();
      const layer = document.createElement("div");
      layer.className = "hd-ph-layer" + (photos.length === 2 ? " pair" : "");
      photos.forEach((ph, k) => {
        const img = imgs[k];
        const cellRatio = photos.length === 2 ? (box.width / 2) / box.height : box.width / box.height;
        const cover = box.height > 0 && Math.abs(img.naturalWidth / img.naturalHeight - cellRatio) < 0.45;
        const cell = document.createElement("div");
        cell.className = "hd-ph-cell" + (cover ? " cover" : "");
        cell.innerHTML = `<div class="hd-ph-blur"></div><img class="hd-ph-img" alt="">`;
        cell.querySelector(".hd-ph-blur").style.backgroundImage = `url("${url(ph)}")`;
        cell.querySelector(".hd-ph-img").src = url(ph);
        const caption = this.photoCaption(ph);
        if (caption) { const c = document.createElement("div"); c.className = "hd-ph-caption"; c.textContent = caption; cell.appendChild(c); }
        layer.appendChild(cell);
      });
      card.appendChild(layer);
      requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("shown")));
      setTimeout(() => { [...card.querySelectorAll(".hd-ph-layer")].slice(0, -1).forEach((l) => l.remove()); card.querySelector(".hd-photo-empty")?.remove(); }, 1200);
    }).catch(() => { this.photoPending = 0; });
  },

  photoCaption(p) {
    const d = p.date ? new Date(p.date) : null;
    const date = d && !isNaN(d) ? d.toLocaleDateString(this.locale(), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
    return [date, p.place].filter(Boolean).join(" · ");
  },

  /* ======================= calendar ======================= */
  allEvents() {
    const seen = new Set(), out = [];
    for (const list of this.pools.values()) {
      for (const raw of list) {
        const ev = this.normalize(raw);
        const key = `${ev.title}|${ev.startDate}|${ev.calendarName}`;
        if (!seen.has(key)) { seen.add(key); out.push(ev); }
      }
    }
    return out;
  },

  normalize(ev) {
    const clean = (v) => (v && v !== "undefined" && v !== "false" ? String(v) : "");
    const start = Number(ev.startDate), end = Number(ev.endDate);
    return {
      title: String(ev.title || "").trim(), calendarName: ev.calendarName || "",
      startDate: start, endDate: Number.isFinite(end) && end > 0 ? end : start,
      allDay: ev.fullDayEvent === true || ev.fullDayEvent === "true",
      location: clean(ev.location), description: clean(ev.description), color: ev.color || ""
    };
  },

  dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); },

  eventsBetween(events, from, to) {
    return events
      .filter((ev) => { const end = ev.endDate > ev.startDate ? ev.endDate : ev.startDate + 1; return ev.startDate < to.getTime() && end > from.getTime(); })
      .sort((a, b) => (b.allDay - a.allDay) || (a.startDate - b.startDate));
  },

  renderCalendar() {
    if (!this.root) return;
    const week = this.root.querySelector(".hd-week");
    const events = this.allEvents();
    const first = this.dayStart(new Date());
    first.setDate(first.getDate() + this.weekOffset * 7);
    const todayKey = this.dayStart(new Date()).getTime();
    const last = new Date(first); last.setDate(last.getDate() + 6);
    const fmt = (d, o) => d.toLocaleDateString(this.locale(), o);
    this.root.querySelector(".hd-week-range").textContent =
      `${fmt(first, { month: "short", day: "numeric" })} – ${fmt(last, { month: first.getMonth() === last.getMonth() ? undefined : "short", day: "numeric" })}`;
    this.root.querySelector(".hd-today").classList.toggle("active", this.weekOffset === 0);
    week.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const day = new Date(first); day.setDate(first.getDate() + i);
      const next = new Date(day); next.setDate(day.getDate() + 1);
      week.appendChild(this.dayTile(day, this.eventsBetween(events, day, next), day.getTime() === todayKey));
    }
    const nwStart = new Date(first); nwStart.setDate(first.getDate() + 7);
    const nwEnd = new Date(nwStart); nwEnd.setDate(nwStart.getDate() + 7);
    week.appendChild(this.nextWeekTile(nwStart, nwEnd, this.eventsBetween(events, nwStart, nwEnd)));
    this.fitTitles();
  },

  dayTile(day, events, isToday) {
    const tile = document.createElement("div");
    tile.className = "hd-day" + (isToday ? " hd-is-today" : "");
    const weather = this.forecast[this.dateKey(day)];
    tile.innerHTML = `
      <div class="hd-day-head">
        <span class="hd-day-name">${day.toLocaleDateString(this.locale(), { weekday: "short" })}</span>
        <span class="hd-day-num">${day.getDate()}</span>
        <span class="hd-day-wx">${weather ? `${this.weatherIcon(weather.id)}<span>${weather.high}°</span>` : ""}</span>
      </div>
      <div class="hd-day-count"><span>${events.length ? `${events.length} event${events.length > 1 ? "s" : ""}` : ""}</span>${this.pickupIcons(day)}</div>
      <div class="hd-day-events"></div>`;
    const list = tile.querySelector(".hd-day-events");
    const max = this.config.maxEventsPerDay;
    const shown = events.length > max ? events.slice(0, max - 1) : events;
    shown.forEach((ev) => list.appendChild(this.eventPill(ev, day)));
    if (events.length > shown.length) {
      const more = document.createElement("button");
      more.className = "hd-more";
      more.textContent = `+${events.length - shown.length} more`;
      list.appendChild(more);
    }
    tile.onclick = (e) => { if (!e.target.closest(".hd-event")) this.sendNotification("CALENDAR_DAY_CLICKED", { date: day.getTime(), events }); };
    return tile;
  },

  eventPill(ev, day) {
    const pill = document.createElement("button");
    pill.className = "hd-event" + (ev.endDate < Date.now() && !ev.allDay ? " passed" : "");
    if (window.OpenSkyEventColors) pill.setAttribute("style", window.OpenSkyEventColors.vars(ev));
    pill.innerHTML = `<span class="hd-event-title"></span><span class="hd-event-time"></span>`;
    pill.querySelector(".hd-event-title").textContent = ev.title;
    pill.querySelector(".hd-event-time").textContent = this.when(ev, day);
    pill.onclick = () => this.sendNotification("CALENDAR_EVENT_CLICKED", ev);
    return pill;
  },

  when(ev, day) {
    if (ev.allDay) return "All day";
    const start = new Date(ev.startDate), end = new Date(ev.endDate);
    const twelve = !(typeof config !== "undefined" && config.timeFormat === 24);
    const t = (d) => d.toLocaleTimeString(this.locale(), { hour: "numeric", minute: "2-digit", hour12: twelve }).replace(/:00(?= ?[AP]M)/, "");
    const onDay = (d) => d.toDateString() === day.toDateString();
    if (!onDay(start) && !onDay(end)) return "All day";
    if (!onDay(start)) return `Until ${t(end)}`;
    if (end.getTime() === start.getTime()) return t(start);
    return onDay(end) ? `${t(start)} – ${t(end)}` : `${t(start)} →`;
  },

  nextWeekTile(from, to, events) {
    const tile = document.createElement("div");
    tile.className = "hd-day hd-nextweek";
    const last = new Date(to); last.setDate(last.getDate() - 1);
    const f = (d) => d.toLocaleDateString(this.locale(), { month: "short", day: "numeric" });
    tile.innerHTML = `
      <div class="hd-day-head"><span class="hd-day-name hd-nw-title">Next Week</span></div>
      <div class="hd-day-count">${f(from)} – ${f(last)}${events.length ? ` · ${events.length} event${events.length === 1 ? "" : "s"}` : ""}</div>
      <div class="hd-nw-list"></div>`;
    const list = tile.querySelector(".hd-nw-list");
    events.slice(0, 5).forEach((ev) => {
      const row = document.createElement("div");
      row.className = "hd-nw-row";
      const bar = window.OpenSkyEventColors ? window.OpenSkyEventColors.bar(ev) : "#9ca3af";
      row.innerHTML = `<span class="hd-nw-dot" style="background:${bar}"></span><span class="hd-nw-day"></span><span class="hd-nw-name"></span>`;
      row.querySelector(".hd-nw-day").textContent = new Date(ev.startDate).toLocaleDateString(this.locale(), { weekday: "short" });
      row.querySelector(".hd-nw-name").textContent = ev.title;
      list.appendChild(row);
    });
    if (events.length > 5) {
      const more = document.createElement("div");
      more.className = "hd-nw-more";
      more.textContent = `+${events.length - 5} more`;
      list.appendChild(more);
    }
    tile.onclick = () => { this.weekOffset++; this.renderCalendar(); };
    return tile;
  },

  /* ======================= weather ======================= */
  dateKey(d) { const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },

  weatherIcon(id) {
    const hd = MM.getModules().withClass("MMM-OpenSky-Header")[0];
    return hd && typeof hd._svgForWeatherId === "function" && id != null ? `<span class="hd-wx-icon">${hd._svgForWeatherId(id)}</span>` : "";
  },

  /* ======================= lists ======================= */
  renderLists() {
    if (!this.root) return;
    const all = [...this.lists.entries()].flatMap(([source, lists]) => lists.map((l) => ({ ...l, source })));
    const card = this.root.querySelector(".hd-lists");
    card.hidden = !all.length;
    this.root.classList.toggle("hd-no-lists", !all.length);
    const cols = card.querySelector(".hd-list-columns");
    cols.style.setProperty("--list-count", Math.min(3, Math.max(1, all.length)));
    cols.innerHTML = "";
    const palette = window.OpenSkyEventColors && window.OpenSkyEventColors.PALETTE;
    all.slice(0, 3).forEach((list, idx) => {
      const col = document.createElement("div");
      col.className = "hd-list" + (idx % 2 ? " alt" : "");   // default: blue, peach, blue…
      const named = palette && palette[list.color];
      if (named) {                                            // a palette colour name → accent, pale tint, dark text
        col.style.setProperty("--list-accent", named[1]);
        col.style.setProperty("--list-tint", `color-mix(in srgb, ${named[1]} 7%, white)`);
        col.style.setProperty("--list-dark", `color-mix(in srgb, ${named[1]} 78%, black)`);
      }
      col.innerHTML = `
        <div class="hd-list-head"><span class="hd-list-title"></span><span class="hd-badge">${(list.items || []).length}</span></div>
        <button class="hd-add-item">${this.icon("plus")}<span>Add item</span></button>
        <div class="hd-items"></div>`;
      col.querySelector(".hd-list-title").textContent = list.title || "List";
      col.querySelector(".hd-add-item").onclick = () => this.sendNotification("OPENSKY_LIST_ADD", { source: list.source, listId: list.id });
      const items = col.querySelector(".hd-items");
      if (list.loaded === false) items.innerHTML = `<div class="hd-empty">Loading…</div>`;
      else if (!(list.items || []).length) items.innerHTML = `<div class="hd-empty">All done! 🎉</div>`;
      (list.items || []).forEach((item) => {
        const row = document.createElement("div");
        row.className = "hd-item";
        row.innerHTML = `<button class="hd-check" aria-label="Check off"></button><span class="hd-item-text"></span>`;
        row.querySelector(".hd-item-text").textContent = item.text;
        row.querySelector(".hd-check").onclick = () => {
          if (!row.classList.contains("mte-done")) this.sendNotification("OPENSKY_LIST_CHECK", { source: list.source, listId: list.id, item, el: row });
        };
        row.querySelector(".hd-item-text").onclick = () => this.sendNotification("OPENSKY_LIST_EDIT", { source: list.source, listId: list.id, item });
        items.appendChild(row);
      });
      cols.appendChild(col);
    });
  },

  /* ======================= curbside pickup ======================= */
  // Small icons next to the "N events" counter: trash can (+ recycling) on trash day, leaf on yard-waste days.
  pickupIcons(day) {
    if (!this.config.pickup || !window.OpenSkyPickup) return "";
    const c = window.OpenSkyPickup.collectionsOn(day, this.config.pickup);
    const why = c.moved ? ` (moved a day for ${c.moved})` : "";
    const weeklyRecycling = !(this.config.pickup.recycling && this.config.pickup.recycling.every === 2);
    const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    let html = "";
    if (c.trash) html += `<span class="hd-pickup hd-pickup-trash" title="${weeklyRecycling ? "Trash & recycling" : "Trash"}${why}">${svg(`<path d="M4 7h16M10 3.5h4M6 7l1 13a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20l1-13"/><path d="M10 11v6M14 11v6"/>`)}</span>`;
    if (c.recycling && !weeklyRecycling) html += `<span class="hd-pickup hd-pickup-recycle" title="Recycling${why}">${svg(`<path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L5.4 12.5"/><path d="M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7l-1.2-2.1"/><path d="M14 16l-3 3 3 3"/><path d="M8.3 7.8 10.5 4a1.8 1.8 0 0 1 3.1 0l1.2 2.1"/><path d="M13.4 6.5l4.2-.9.9 4.2"/><path d="M8.6 12.3 5.4 12.5 4.2 9.3"/>`)}</span>`;
    if (c.yard) html += `<span class="hd-pickup hd-pickup-yard${c.expected ? " hd-pickup-expected" : ""}" title="Yard waste${c.expected ? " (expected — this year's schedule isn't published yet)" : why}">${svg(`<path d="M5 19c0-8 5-14 15-15 0 10-6 15-13 15"/><path d="M5 19c3-4 6-7 10-10"/>`)}</span>`;
    return html ? `<span class="hd-pickups">${html}</span>` : "";
  },

  /* ======================= icons ======================= */
  icon(name) {
    const p = {
      calendar: `<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
      list: `<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
      image: `<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>`,
      left: `<path d="M15 5l-7 7 7 7"/>`, right: `<path d="M9 5l7 7-7 7"/>`, plus: `<path d="M12 5v14M5 12h14"/>`
    }[name];
    return `<svg class="hd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
});
