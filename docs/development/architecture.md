# OpenSky architecture

OpenSky is a **distribution on top of upstream MagicMirror²**, not a fork of it. The installer fetches an official
MagicMirror release (pinned), adds OpenSky's own modules and a few pinned community modules, and generates the
MagicMirror config from OpenSky's settings. Upstream MagicMirror can then be updated without merging a fork.

## Versions (development baseline)
- MagicMirror² **v2.38.0** (needs Node.js ≥ 22.22.2 or ≥ 24; development uses **Node 24 LTS**), Electron 44.
- Raspberry Pi OS (Debian 13 "trixie"), Wayland (labwc). Pi 5 reference hardware.

## Repository layout (target)
```
opensky/
  modules/            OpenSky's own MagicMirror modules (MMM-OpenSky-*), each self-contained
  vendor/             community modules OpenSky ships *modified* (with their original LICENSE kept)
  patches/            small patches applied to pinned community modules at install time
  config/             opensky.example.json (settings), secrets.example.json, config.js (builds the MM config)
  services/           helper services outside MagicMirror (screen control, calendar backend)
  installer/          install.sh and friends
  tools/              test harness (off-screen Electron + Playwright) and scenarios
  docs/               user documentation;  docs/development/ for contributors and AI agents
```

## Settings model
- **`config/opensky.json`** — everything a family configures (name, location, pages, providers, colours…).
  No secrets. Later edited through the phone setup page; hand-editable meanwhile.
- **`config/secrets.json`** — API keys, tokens, passwords, PINs. **Read only by node helpers / services on the Pi.**
  Never copied into the MagicMirror config, because MagicMirror serves its config to every device on the network
  (`http://<pi>:8080/config`).
- **`config/config.js`** — MagicMirror's config file. In OpenSky it is *code*: it reads `opensky.json` and builds the
  module list. Users don't edit it.

## Modules (planned names)
| OpenSky module | From the reference build | Notes |
|---|---|---|
| MMM-OpenSky-Sidebar | MMM-SidebarNav | page list from settings; sleep/wake via the screen service |
| MMM-OpenSky-Header | MMM-HeaderBar | family name, clock, weather provider, countdown + sports pills |
| MMM-OpenSky-Home | MMM-HomeDashboard | week tiles, lists card, photos card (providers), pickup icons |
| MMM-OpenSky-CalendarNav / -CalendarHelper / -EventEditor | MMM-CalendarNav / -CalendarHelper / -CalendarEditor | month/week view uses MMM-CalendarExt3 (pinned + patch) |
| MMM-OpenSky-Lists ✅ | MMM-Todoist / MMM-TaskEditor / MMM-TodoistQuickAdd | `lib/lists.js` providers: on-device (default, `config/lists.json`), Todoist (token in secrets.json); add / edit / check-off-with-Undo popups; broadcasts `OPENSKY_LISTS` |
| MMM-OpenSky-ListsPage ✅ | (Todoist page) | page `lists`: every list side by side; columns drawn by `lib/client` `OpenSkyListColumn` (+ `list-columns.css`), same as Home |
| MMM-OpenSky-Timer | MMM-Timer | |
| MMM-OpenSky-Settings ✅ | the reference build's settings module | panel on `OPENSKY_SETTINGS_OPEN`; `config/device.json`; brightness: sysfs backlight → ddcutil → software dim; wpctl volume; sleep schedule drives the Sidebar (`OPENSKY_SLEEP`/`OPENSKY_WAKE`); `OPENSKY_DRY_RUN=1` in tests |
| MMM-OpenSky-WordGame ✅ | MMM-Wordle | page `wordgame`; words/ from SCOWL (licence in words/SCOWL-COPYRIGHT.txt); daily word = NYT (default, `OPENSKY_NYT_URL` in tests) or answers[days since 2026-01-01] (backup / `source: "opensky"`); the answer never reaches the page before the game ends; `config/wordgame.json` |
| MMM-OpenSky-Embed ✅ | MMM-EmbedURL + MMM-Finance ideas | one instance per `embeds.<key>` page, told apart by the class `opensky-embed-<key>` (MMM-pages matches classes); `<webview>` (electronOptions.webviewTag); PIN in secrets.json checked by the node helper (timing-safe, 5 tries → 30 s); config.js only learns whether a PIN exists + its length |
| MMM-OpenSky-Music ✅ (add-on) | — | page `music`; `lib/music.js` reads what's playing from go-librespot's API (Spotify Connect, `OPENSKY_SPOTIFY_API`) and shairport-sync's MPRIS on the session bus via `busctl` (AirPlay, `OPENSKY_BUSCTL` in tests), polls 1 s while shown or playing; buttons go back the same way; the volume slider is Settings' (`OPENSKY_VOLUME_SET` / `OPENSKY_VOLUME`) |
| MMM-OpenSky-Keyboard ✅ | MMM-Keyboard (heavily modified fork) | own, dependency-free: follows focus (text boxes only), hides when the box goes away (MutationObserver — Chromium sends no focus event when a focused node is removed), `body.kb-open` moves popups up |

Community modules used (all MIT): MMM-CalendarExt3 (MMRIZE), MMM-Keyboard (lavolp3), MMM-Todoist (cbrooker),
MMM-pages (edward-shen), MMM-Remote-Control (Jopyth), MMM-HomeAssistant (ambarusa), MMM-EmbedURL (Tom-Hirschberger).

## Google Calendar (lib/google-calendar.js)
Same process as other MagicMirror Google modules (the user's own Desktop-app OAuth client) but guided from phone setup:
PKCE + loopback redirect `http://127.0.0.1:53682/` (the phone shows "can't be reached"; the user pastes that address),
scopes calendar.calendarlist.readonly + calendar.events, refresh token in secrets.json → google. Google forbids the
device ("TV") flow for calendar scopes and blocks sign-in in embedded browsers — hence the phone. Sources
`type: "google"` are fetched by MMM-OpenSky-Calendars (singleEvents, 30 days back) and edited by the event editor
(find by title + start; repeating events → 409). Tests: tools/test-google.js (fake Google), setup scenario.

## Phone setup (MMM-OpenSky-Setup)
The node helper runs a plain `http` server on 0.0.0.0:`setup.port` (8090) **only while the pairing card is open**
(stops after 30 quiet minutes or Finish). Pairing: 6-digit code (crypto.randomInt, 10 min, timing-safe compare,
5 wrong → 60 s pause, 15 → new code + pause; checked once the code has arrived; only a paired phone keeps setup open) → random 256-bit session cookie (HttpOnly, SameSite=Strict, in memory only).
Guards: Host header must name this Pi (DNS rebinding), POSTs need `X-OpenSky: 1` (CSRF), strict CSP (no inline
script/style — the page sets styles through the DOM), no-store. `/api/state` returns opensky.json + the *paths* of
set secrets; `/api/save` writes opensky.json (keeps `.bak`) and merges secrets under allowed roots (chmod 600).
Phone page: `modules/MMM-OpenSky-Setup/phone/` (no libraries). QR: `lib/client/vendor/qrcode.js` (MIT).

## Services
- **Screen service** (from the reference build's `monitor_control.py`): on/off/status HTTP API, wake-on-touch,
  night re-sleep, idle time. Back-ends: DPMS/wlr-randr (default), DDC/CI, soft sleep, HDMI-CEC, Pi display backlight.
- **Calendar service** (`services/calendar-service`, Python/Flask, 127.0.0.1 only, port `calendar.service.port`, default 5747):
  CalDAV read/write. Accounts in `secrets.json` → `calendar.caldav.<name>`. `config.js` points `type: "caldav"` sources at
  `http://127.0.0.1:<port>/<name>/calendar.ics`; the event editor POSTs `<name>/create|update|delete-event`. Keeps the last
  good feed in `config/calendar-cache/`. Repeating events are read-only (409).

- **Music add-on speakers** (`tools/addons/music.sh`, `opensky addon music`): user services `opensky-airplay`
  (shairport-sync from apt, AirPlay 1, port 5100, PulseAudio output, D-Bus/MPRIS on the session bus; the package's
  system service is disabled) and `opensky-spotify` (go-librespot, pinned release + sha256, zeroconf via avahi, API on
  localhost:3678). Each writes its config from opensky.json first (`services/music/render.js`: speaker name rule shared
  with config.js). `install.sh` rewrites the units on updates; `opensky restart` and phone setup's Finish restart them.

## MagicMirror 2.38 notes
- Electron's language (date/time boxes) comes from the `LANGUAGE` environment variable on Linux, not from
  `--lang` or the page: `tools/opensky-start` sets it from `locale.locale` (the harness does the same).
- A module's own fields and methods must not reuse MagicMirror's `Module` names: `this.data` (holds `classes`;
  overwriting it breaks MMM-pages), `show()`, `hide()`, `config`, `name`, `identifier`, `file()`… Pick specific names.
- `config.js` is read as text and evaluated (`requireFromString`), so `__dirname` inside it is not the config
  folder — locate files with `global.root_path`. Node helpers should also require OpenSky's shared library via
  `path.join(global.root_path, "modules", "opensky-lib", …)` (module folders may be links in development).
- MagicMirror 2.38 has its own secret mechanism: `config/config.env` with `SECRET_*` variables used as
  `${SECRET_X}` in config.js; the copy served to screens shows `**SECRET_X**`. OpenSky's `secrets.json` (read only by
  node helpers) is compatible with it and also covers things that aren't module config (service passwords, PINs).
- Custom CSS is expected in `config/` (2.38 warns about `css/custom.css`); OpenSky sets `customCss` explicitly.

- Events broadcast as `CALENDAR_EVENTS` must look like MagicMirror's calendar output — including `symbol` (an array):
  MMM-CalendarExt3 calls `event.symbol.join()` and stops drawing the month without it.

## Lessons from the reference build (keep these true)
- MagicMirror serves `config.js` to the network → secrets live in `secrets.json`, read server-side.
- Never name a module property `this.data` (MagicMirror uses `module.data`).
- MagicMirror's window has Node integration: browser scripts must attach to `window` even when `module` exists.
- Popups/overlays are appended to `<body>` (a region's CSS filter traps z-index).
- Test off-screen (headless labwc + Playwright); Playwright's page screenshot mis-renders `<webview>` content —
  use `grim` on the headless output to see true framing.

## Lessons from real hardware (2026-10-16, Elo ET2494L touch monitor)
- DDC/CI "power off" (VCP D6=04) powered the monitor fully down, touch controller included; nothing from the Pi (DDC,
  forcing the HDMI connector on, CEC) woke it — only its power button. So OpenSky never sends it.
- Black screen + brightness 0 over DDC/CI works and comes back reliably.
- On Raspberry Pi OS a user service's log is in the system journal (`journalctl _SYSTEMD_USER_UNIT=…`, readable by the
  default user via the adm group); `journalctl --user` finds nothing.
- Port 5050 (first choice for the calendar helper) clashed with another program on a real Pi → 5747, and the service
  now says plainly when its port is taken.

