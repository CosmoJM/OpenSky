# Changelog

## 1.0.1 — 2026-10-24
- **Touchscreens: a popup's Add / Save button works when tapped.** On touchscreens that act like a mouse, pressing it
  took the focus off the text box, so the on-screen keyboard closed and the popup slid down under the finger before it
  was lifted — the tap was lost and the popup closed (Return worked). Reported by a user.
- A popup only closes on a tap outside it when the press also started outside it.

## 1.0.0 — 2026-10-23
The first public version: a friendly family wall calendar for a Raspberry Pi touchscreen, built on MagicMirror².

**On the screen**
- **Home**: the week ahead with everyone's events in their colours, daily weather, trash/recycling/yard-waste icons,
  your lists (check off with Undo) and a photo slideshow.
- **Calendar**: month view; tap a day or event to see, add, edit or delete events.
- **Lists**: every list side by side. **Timer**: kitchen timers with a chime. **Word game**: a daily family puzzle
  (the New York Times' daily word by default, OpenSky's own words as backup or by choice).
- **Your own web pages as pages** (Home Assistant dashboards, cameras, school portals…): add them from Settings or
  the phone with a name, an address and an icon; optionally locked with a PIN.
- **Add-on — Music** (`opensky addon music`): the screen becomes an AirPlay and a Spotify Connect speaker, and a Music
  page shows what's playing (cover, song, progress) with previous / play-pause / next and the volume. The same page is
  a **remote for your other speakers** (Sonos, HomePod, Echo, Google…) through Home Assistant. See docs/music.md.
- Header: family name, clock, weather, countdown to the next holiday or birthday, your team's game day.
- **Settings on the screen**: brightness (backlight, monitor over HDMI or picture dimming), evening dim, sleep at
  night, how Sleep turns your screen off (with a Test button and wake on touch), volume, pages, accent colour,
  backups, update / restart / shut down.
- On-screen keyboard; returns to Home after a few quiet minutes (touches inside web pages count, too).
- Fits any screen: the layout scales to 720p, 768p, 1080p or 4K screens (`look.scale` to adjust).
- A small notice on Home when a calendar keeps failing (wrong link, expired password), with where to fix it.

**Connects to**
- Calendars: on the screen (no account), any calendar link (Google, Outlook, iCloud, school…), iCloud / Fastmail /
  Nextcloud with editing (CalDAV), Google Calendar with editing, public holidays for about 200 countries.
- Lists: on the screen (no account), Todoist, Home Assistant to-do lists.
- Photos: a folder, a USB stick, or Immich. Weather: Open-Meteo (no key) or OpenWeatherMap.
- Trash days: your pickup day, city presets, or your city's pickup calendar link.

**Setting up and keeping it running**
- One-command installer for Raspberry Pi OS; starts by itself at power-on.
- **Set up from your phone**: scan a QR code, type the code from the screen, add calendars, lists and photos. The
  installer keeps the Pi's Wi-Fi awake so your phone can always reach it.
- Backups: download / restore from the phone, and automatic nightly backups to a USB stick or network folder.
- Updates install the newest **release** (testers can follow `main`); a version that doesn't start is rolled back by
  itself; `opensky rollback`, `opensky backup`.
- Passwords and keys stay in one private file on the Pi; they never reach the screen, the network or the logs.
