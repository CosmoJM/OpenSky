# Changelog

## 1.0.0 — unreleased (release candidate)
The first public version: a friendly family wall calendar for a Raspberry Pi touchscreen, built on MagicMirror².

**On the screen**
- **Home**: the week ahead with everyone's events in their colours, daily weather, trash/recycling/yard-waste icons,
  your lists (check off with Undo) and a photo slideshow.
- **Calendar**: month view; tap a day or event to see, add, edit or delete events.
- **Lists**: every list side by side. **Timer**: kitchen timers with a chime. **Word game**: a daily family puzzle
  (the New York Times' daily word by default, OpenSky's own words as backup or by choice).
- **Web pages as pages** (Home Assistant dashboards, cameras…), optionally locked with a PIN.
- Header: family name, clock, weather, countdown to the next holiday or birthday, your team's game day.
- **Settings on the screen**: brightness (backlight, monitor over HDMI or picture dimming), evening dim, sleep at
  night, how Sleep turns your screen off (with a Test button and wake on touch), volume, pages, accent colour,
  backups, update / restart / shut down.
- On-screen keyboard; returns to Home after a few quiet minutes.

**Connects to**
- Calendars: on the screen (no account), any calendar link (Google, Outlook, iCloud, school…), iCloud / Fastmail /
  Nextcloud with editing (CalDAV), Google Calendar with editing, public holidays for about 200 countries.
- Lists: on the screen (no account), Todoist, Home Assistant to-do lists.
- Photos: a folder, a USB stick, or Immich. Weather: Open-Meteo (no key) or OpenWeatherMap.
- Trash days: your pickup day, city presets, or your city's pickup calendar link.

**Setting up and keeping it running**
- One-command installer for Raspberry Pi OS; starts by itself at power-on.
- **Set up from your phone**: scan a QR code, type the code from the screen, add calendars, lists and photos.
- Backups: download / restore from the phone, and automatic nightly backups to a USB stick or network folder.
- `opensky update` goes back to the previous version by itself if a new one doesn't start; `opensky rollback`.
- Passwords and keys stay in one private file on the Pi; they never reach the screen, the network or the logs.
