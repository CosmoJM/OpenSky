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
| MMM-OpenSky-Timer | MMM-Timer | |
| MMM-OpenSky-Settings | the reference build's settings module | brightness/volume/schedule backends auto-detected |
| MMM-OpenSky-WordGame | MMM-Wordle | own word list by default; NYT optional |
| MMM-OpenSky-Embed | MMM-EmbedURL + MMM-Finance ideas | Smart Home / any URL, optional PIN |
| (vendor) MMM-Keyboard | heavily modified fork | iPad-style on-screen keyboard |

Community modules used (all MIT): MMM-CalendarExt3 (MMRIZE), MMM-Keyboard (lavolp3), MMM-Todoist (cbrooker),
MMM-pages (edward-shen), MMM-Remote-Control (Jopyth), MMM-HomeAssistant (ambarusa), MMM-EmbedURL (Tom-Hirschberger).

## Services
- **Screen service** (from the reference build's `monitor_control.py`): on/off/status HTTP API, wake-on-touch,
  night re-sleep, idle time. Back-ends: DPMS/wlr-randr (default), DDC/CI, soft sleep, HDMI-CEC, Pi display backlight.
- **Calendar service** (`services/calendar-service`, Python/Flask, 127.0.0.1 only, port `calendar.service.port`, default 5050):
  CalDAV read/write. Accounts in `secrets.json` → `calendar.caldav.<name>`. `config.js` points `type: "caldav"` sources at
  `http://127.0.0.1:<port>/<name>/calendar.ics`; the event editor POSTs `<name>/create|update|delete-event`. Keeps the last
  good feed in `config/calendar-cache/`. Repeating events are read-only (409).

## MagicMirror 2.38 notes
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
