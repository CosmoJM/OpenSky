# OpenSky

A friendly family wall calendar and home dashboard for a Raspberry Pi touchscreen — the week ahead, shared lists,
timers, photos, weather and smart-home controls on one screen. Built on [MagicMirror²](https://magicmirror.builders/).

> 🚧 Early development — usable, but expect changes. See [PLAN.md](PLAN.md) for where it's heading.

## What you get
- **Home:** the week ahead with everyone's events in their colours, weather, trash-day icons, your lists and a photo.
- **Calendar:** month / two-week / week view; tap to see, add, edit or delete events.
- **Lists:** to-dos and groceries — kept on the Pi, or in Todoist. Check off with Undo.
- **Timer**, holiday & birthday countdown, your team's game day, sleep button, photos from a folder, USB stick or Immich.
- Works with Google, Outlook, iCloud, Fastmail, Nextcloud or any calendar link — or no account at all.

## Install
On a Raspberry Pi 4/5 with Raspberry Pi OS (64-bit, desktop) and a touchscreen:
```bash
git clone https://github.com/CosmoJM/OpenSky.git ~/OpenSky && cd ~/OpenSky && ./install.sh
```
Step by step: [docs/install.md](docs/install.md) · settings: [docs/configure.md](docs/configure.md) ·
Google Calendar with editing: [docs/google-calendar.md](docs/google-calendar.md) ·
help: [docs/troubleshooting.md](docs/troubleshooting.md)

## Docs
- **For people:** [`docs/`](docs/).
- **For AI assistants:** start with [`AGENTS.md`](AGENTS.md).
