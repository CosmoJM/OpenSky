# OpenSky
<img width="2172" height="724" alt="OpenSky open-window calendar logo" src="https://github.com/user-attachments/assets/02481f6e-e7b1-4418-8ce7-6a9d387bf25a" />

A friendly family wall calendar and home dashboard for a Raspberry Pi touchscreen — the week ahead, shared lists,
timers, photos, weather and smart-home controls on one screen. Built on [MagicMirror²](https://magicmirror.builders/).

> **v1.0** — what's in it: [CHANGELOG.md](CHANGELOG.md). Where it's heading: [PLAN.md](PLAN.md).

**Watch the intro video** (YouTube):

[![OpenSky intro video on YouTube](https://img.youtube.com/vi/qnbN82BGLP4/maxresdefault.jpg)](https://www.youtube.com/watch?v=qnbN82BGLP4)

![The Home page: the week ahead, lists and a photo](docs/assets/screenshots/home.jpg)

<table><tr>
<td><img src="docs/assets/screenshots/calendar.jpg" alt="Calendar page"></td>
<td><img src="docs/assets/screenshots/lists.jpg" alt="Lists page"></td>
</tr><tr>
<td><img src="docs/assets/screenshots/settings.jpg" alt="Settings on the screen"></td>
<td><img src="docs/assets/screenshots/phone-setup-screen.jpg" alt="Set up from your phone: QR code and pairing code"></td>
</tr></table>
<p align="center"><img src="docs/assets/screenshots/phone-setup.jpg" alt="The phone setup page" width="260"></p>

<sub>Screenshots use a made-up family and demo pictures (`node tools/harness.js tools/demo/screenshots.js`).</sub>

## What you get
- **Home:** the week ahead with everyone's events in their colours, weather, trash-day icons, your lists and a photo.
- **Calendar:** month / two-week / week view; tap to see, add, edit or delete events.
- **Lists:** to-dos and groceries — kept on the Pi, or in Todoist. Check off with Undo.
- **Timer**, holiday & birthday countdown, your team's game day, sleep button, photos from a folder, USB stick or Immich.
- Works with Google, Outlook, iCloud, Fastmail, Nextcloud or any calendar link — or no account at all.
- **Add-on — Music:** the screen becomes an AirPlay and Spotify speaker, with a Music page
  ([docs/music.md](docs/music.md)): `opensky addon music`.

## Install
On a Raspberry Pi 4/5 with Raspberry Pi OS (64-bit, desktop) and a touchscreen:
```bash
git clone https://github.com/CosmoJM/OpenSky.git ~/OpenSky && cd ~/OpenSky && ./install.sh
```
Step by step: [docs/install.md](docs/install.md) · settings: [docs/configure.md](docs/configure.md) ·
Google Calendar with editing: [docs/google-calendar.md](docs/google-calendar.md) ·
help: [docs/troubleshooting.md](docs/troubleshooting.md)

## Docs
- **For people:** [`docs/`](docs/README.md).
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md).
- **For AI assistants:** start with [`AGENTS.md`](AGENTS.md).
