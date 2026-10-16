# OpenSky — project plan

OpenSky is a family wall calendar / home dashboard for a touchscreen: the week ahead, lists, a timer, photos,
weather and smart-home controls on one friendly screen. It runs on a Raspberry Pi and is built on
[MagicMirror²](https://magicmirror.builders/) (MIT).

It started as one family's kitchen calendar (the "reference build", 2026) and is being turned into something anyone
can install, configure and extend.

## Guiding principles
1. **Friendly out of the box.** It should look good and do something useful before you've entered a single key.
   Every feature has a no-account default where one exists (Open-Meteo weather, on-device lists, an ICS calendar).
2. **Configure from a phone, not a text editor.** A setup page served by the Pi (a QR code on screen on first boot)
   for everything a normal person needs; hand-editing config is for power users only.
3. **Secrets stay on the Pi's server side.** MagicMirror serves `config.js` to every device on the network
   (`:8081/config`), so OpenSky keeps keys, tokens and PINs in a separate server-only file. (Learned the hard way.)
4. **Everything optional, nothing fragile.** A missing key or an unreachable service shows a friendly message on that
   card, never a broken screen.
5. **Documentation lives in the release.** Human docs in `docs/`, and `AGENTS.md` written for AI coding assistants,
   so anyone can point their agent at the repo and have it fix problems or build their own integration.
6. **Choice where people differ.** Wherever families use different services (calendars, lists, photos, screens…),
   OpenSky offers several providers behind one setting. The matrix below tracks them.

## Scope
- In: Home (week + lists + photos), Calendar (month/week, add/edit), Lists, Timer, Smart Home page, Settings,
  sidebar, header pills (countdown, sports), curbside pickup icons, Wordle-style daily game, sleep/wake.
- Later (add-on): **Food** (restaurants nearby).
- Out: the reference build's finance page. (A generic "PIN-locked embedded page" may come back as an option.)

## Options matrix — the reference build's choice, and what OpenSky should offer
Legend: **default** = what a new install uses; ✅ = in the reference build already; 🔜 = planned; 💭 = idea.

| Area | Reference build | Options to offer | Notes |
|---|---|---|---|
| Install | hand-built Pi | 🔜 one-line installer on Raspberry Pi OS; 💭 ready-made SD-card image | Image = friendliest, more work |
| First-run setup | hand-edited config.js | 🔜 **phone setup page** (QR on screen) **default**; config file for power users | Validates input, explains each field |
| Hardware | Pi 5 + 24" Elo touch | Pi 5 / Pi 4 (Pi 3 = light mode?); any HDMI touchscreen; official Pi touch display | Test matrix needed |
| Screen off/on | soft sleep (black cover + DDC backlight 0) ✅ | 🔜 **DPMS/wlr-randr off** default; DDC/CI backlight; soft sleep (monitors that wake themselves); HDMI-CEC (TVs); Pi display backlight (sysfs) | Auto-detect + "test" button |
| Wake | touch / mouse / keyboard ✅ | + motion sensor (PIR) 💭; + presence (Home Assistant) | |
| Sleep schedule | Settings page + HA automations ✅ | 🔜 **built-in schedule** default; Home Assistant optional | Don't require HA |
| Calendar (read) | iCloud via CalDAV backend ✅ | 🔜 **ICS URL** default (Google/Outlook/iCloud "secret address"); iCloud CalDAV; generic CalDAV (Fastmail, Nextcloud…); Google Calendar API; Microsoft 365 / Outlook (Graph) | Several calendars, colour per person |
| Calendar (add/edit) | iCloud CalDAV ✅ | CalDAV ✅; Google (OAuth) 🔜; Microsoft 365 💭; read-only mode | OAuth = setup friction; guide it |
| Lists | Todoist (2 projects) ✅ | 🔜 **on-device lists** default (no account); Todoist; Home Assistant to-do; Google Tasks; Microsoft To Do; Apple Reminders (CalDAV VTODO); 💭 Grocy, AnyList, Mealie | Any number of lists, user-named |
| Weather (header + day tiles) | OpenWeatherMap (header) + Open-Meteo (7-day) ✅ | 🔜 **Open-Meteo** default (no key); OpenWeatherMap; 💭 NWS, Met.no | °F/°C, location by address search |
| Photos | Immich ✅ | 🔜 **local folder / USB stick** default; Immich; PhotoPrism; Nextcloud/WebDAV; iCloud shared album link; 💭 Google Photos (API is very limited now) | Portrait pairing ✅ |
| Smart Home page | Home Assistant dashboard (webview) ✅ | Home Assistant; **any URL** embed; none | Generic "embedded page" with optional PIN |
| HA integration | screen switch/sensor, presence, sleep helpers ✅ | optional: auto-create HA entities via MQTT discovery or a small HA integration 💭 | Reference build uses REST + templates |
| Header countdown pill | US holidays + birthdays ✅ | 🔜 holidays by **country** (US default); birthdays from a calendar or a list | Themed icons ✅ |
| Sports pill | Patriots (ESPN) ✅ | 🔜 pick any team: NFL/NBA/MLB/NHL/MLS/college (ESPN); off by default | ESPN API is unofficial → can break |
| Curbside pickup icons | New Bedford rules (collection.js) ✅ | 🔜 generic schedule (trash day, recycling weekly/every other week, yard-waste weeks, holiday shift rule); ICS import (many cities / ReCollect publish one); city presets contributed by users | Reference city = example preset |
| Timer chime | USB speaker (PipeWire) ✅ | any audio output; 💭 smart-speaker announcement via HA | |
| Daily word game | NYT daily word ✅ | 🔜 **built-in word list** default; NYT word optional (user opt-in — unofficial feed, ToS grey area) | Rename (not "Wordle", a NYT trademark) |
| On-screen keyboard | iPad-style US ✅ | 🔜 layouts (US, UK, intl.); 💭 languages | |
| Brightness / volume (Settings) | ddcutil + wpctl ✅ | DDC/CI; Pi display backlight; none (hide slider) | Auto-detect |
| Look & feel | family name in the header, pastel theme ✅ | 🔜 family name, accent colour, light/dark, 12/24 h, units, first day of week, date format; 💭 languages (i18n) | |
| Updates | manual | 🔜 "Update" button in Settings (git pull + migrations, rollback) | Big for friendliness |
| Backups | nightly git + NAS (reference build) | 🔜 export/import settings file from the setup page | |
| Food (add-on) | Google Places + Routes ✅ | Google (own key); 💭 OpenStreetMap/Overpass (free, no key) | Later |

## Roadmap (milestones)
1. **Skeleton** — repo, plan, docs layout, AGENTS.md, licence, separate backups. ✅
2. **Port the reference build, scrubbed** — modules copied in, every secret/personal value moved to settings with
   safe defaults; community-module changes as forks/patches with their licences kept.
   Progress: ✅ settings → config builder, base theme, shared lib (weather, secrets), off-screen harness;
   ✅ Timer, ✅ Sidebar (soft sleep on any screen), ✅ Header (Open-Meteo default, custom dates, any-team sports pill),
   ✅ Home (events from any calendar source, named colour palette + rules, shared weather, provider-neutral lists
   card, photos from a folder/USB stick or Immich, generic pickup schedule + New Bedford preset).
   ✅ Calendar sources (public links in settings, private links in secrets.json, MagicMirror's own fetcher),
   ✅ Calendar page (MMM-CalendarExt3 pinned + patch, toolbar, taps, two-line fitting, palette colours).
   ✅ On-device calendar (default, no account) + event editor (day list, view, add, edit, delete; linked calendars
   read-only; changes go through the node helper).
   Next: CalDAV calendar service (from the reference build's caldav-backend), Lists (on-device + Todoist),
   docs + installer, Settings, keyboard, word game, embed page.
3. **First public milestone:** Home + Calendar (ICS + CalDAV) + Lists (on-device + Todoist) + Timer + Settings,
   Open-Meteo weather, local photos — installable from scratch with the installer and a config file.
4. **Phone setup page** (first-run wizard + settings), secrets file, friendly error cards.
5. Providers from the matrix, one at a time (Google Calendar, HA lists, Immich, sports team picker, pickup presets…).
6. **Clean-install test** on a separate SD card in the same Pi (swap cards; the family calendar stays on its card).
7. Public release (v1.0): docs, screenshots with demo data, issue templates, contribution guide.
8. Add-ons: Food.

## Development setup (this Pi)
- The family calendar (`~/MagicMirror`) is **never touched** by OpenSky work. OpenSky lives in `~/opensky` with its own
  MagicMirror checkout, runs only on the off-screen test display (port 8083), and has its own backups
  (`~/opensky-backup/`, NAS folder `opensky/`).
- Final testing: a second SD card in this Pi (swap the cards), so the family calendar's card is never modified.
