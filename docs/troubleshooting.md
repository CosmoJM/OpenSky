# Troubleshooting

Start with these three commands in Terminal:
```bash
opensky status     # is it running?
opensky check      # are the settings files OK?
opensky logs       # what happened lately (the newest lines are at the bottom)
```

## The screen is black, or OpenSky didn't start
- Touch the screen. You may have pressed **Sleep**.
- Run `opensky start`. If that fails, run `opensky logs` and look near the bottom for the reason.
- **"Unexpected token" or "JSON"** in the logs: a typo in `opensky.json` or `secrets.json`. `opensky check` shows the line.
  Usual causes are a missing comma between items, a comma after the last item, or a missing quote.
- After a power cut it should start by itself. If it doesn't, re-run `./install.sh` and answer **yes** to "Log in automatically".

## The screen goes blank by itself after a few minutes
Raspberry Pi OS blanks the screen when idle. Run `sudo raspi-config nonint do_blanking 1` (or re-run `./install.sh` and answer yes), then restart the Pi.

## No weather
- `location` needs a latitude and longitude. Add them with `opensky edit` (see [configure.md](configure.md#family-and-place)).
- Using `"openweathermap"`? Check the key in `secrets.json`; new keys take up to 2 hours to start working. Or switch back to `"open-meteo"`, which needs no key.
- The weather fills in about a minute after the internet comes back.

## A calendar doesn't show
- `opensky logs` names the calendar and the reason:
  - **"no link for …"**: the calendar has no `url` and no matching name in `secrets.json → calendar.sources`. The names must match exactly, capital letters included.
  - **HTTP 404 / 401**: the link is wrong or was reset. Copy it again from your calendar app.
- **Google**: use the *Secret address in iCal format*, not the "public URL" (which only works for public calendars).
- New events in Google or Outlook can take a while to appear. Those services update their links on their own schedule, sometimes hours.

## iCloud / CalDAV calendar problems
- **"was refused — check the username and (app-specific) password"**: iCloud needs an **app-specific password** (appleid.apple.com → Sign-In and Security). Your normal Apple ID password won't work.
- **"Calendar … not found in that account"**: `calendar` in `secrets.json` must match the name in the Calendar app exactly.
- **"Can't reach the calendar service"**: run `systemctl --user restart opensky-calendar`, then `opensky logs`. If it says the helper isn't installed, re-run `./install.sh`.
- **"Repeating events can only be changed in your calendar app"**: on purpose. Changing one repeat from the screen could damage the whole series.

## Lists
- **Todoist: "refused the API token"**: copy the token again (Todoist → Settings → Integrations → Developer) into `secrets.json → lists.todoist.token`.
- **"No Todoist project called …"**: the list's `project` (or its `name`) must match a Todoist project. Letter case doesn't matter.
- **Todoist changes take a minute or two** to show on the screen (`refreshMinutes`). Changes made on the screen show at once.

## Photos
- Nothing shows: put pictures in `~/Pictures`, or in a folder named `OpenSky` on a USB stick. JPEG, PNG and WebP work, and new photos are found within a few minutes.
- A photo is sideways: OpenSky follows the photo's own rotation setting. Re-save it from a photo app to fix it.
- Immich: check `photos.url` (with `http://` and the port, usually `:2283`) and the API key.

## Touch is off, or the time is wrong
- **Time**: set the time zone with `sudo raspi-config nonint do_change_timezone <Your/Zone>` and restart.
- **Touch lands in the wrong place**: that's the display's setting in Raspberry Pi OS (Screen Configuration → Touchscreen), not OpenSky's.

## Starting over
- Settings only: rename `config/opensky.json` and run `./install.sh`. It asks the setup questions again.
- Everything: `./install.sh --uninstall`, then delete `~/OpenSky` (save your `config/` folder first if you want it).

## Asking for help
Open an issue at <https://github.com/CosmoJM/OpenSky/issues> with:
- what you expected and what happened
- your Pi model
- the output of `opensky logs`

**Remove anything private first.** The logs don't contain your passwords, but calendar names and event titles may show up.

AI assistants helping with OpenSky: start with [AGENTS.md](../AGENTS.md).
