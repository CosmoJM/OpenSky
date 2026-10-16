# Setting up OpenSky

OpenSky reads two files in `~/OpenSky/config/`:

| File | What's in it | Open it with |
|---|---|---|
| `opensky.json` | your **settings**: family name, town, calendars, lists, photos, pages… | `opensky edit` |
| `secrets.json` | **passwords and keys**: private calendar links, iCloud password, Todoist token, Immich key | `opensky secrets` |

`secrets.json` is read only by the Pi itself. It is never sent to the screen or to other devices on your network, so private things belong there and nowhere else.

After changing either file, run **`opensky restart`**. If the screen doesn't come back, run **`opensky check`**. It tells you about a missing comma or quote.

> **The file format (JSON), in 20 seconds:**
> - Text goes in "double quotes".
> - Items in a list are separated by commas, with **no comma after the last one**.
> - `{ }` holds named settings; `[ ]` holds a list.
> - Keys starting with `_` are notes and are ignored.

---

## Family and place
```json
"family":   { "name": "The Smiths" },
"location": { "name": "Boston, MA", "latitude": 42.3601, "longitude": -71.0589 },
"locale":   { "language": "en", "locale": "en-US", "timeFormat": 12, "units": "imperial", "firstDayOfWeek": 0 }
```
- `family.name`: shown at the top left. Its first letter (ignoring "The") is the Home button's badge.
- `location`: used for the weather. The installer fills it in. To find the numbers yourself, search for your town on
  <https://open-meteo.com/en/docs> and copy the latitude and longitude.
- `locale.timeFormat`: `12` (3:00 PM) or `24` (15:00).
- `locale.units`: `"imperial"` (°F) or `"metric"` (°C).
- `locale.firstDayOfWeek`: `0` = Sunday, `1` = Monday (month view).
- `locale.locale`: how dates are written (`"en-US"`, `"en-GB"`…).
- The **time zone** comes from the Pi itself. To change it: `sudo raspi-config nonint do_change_timezone America/Chicago` (use your zone).

## Pages
```json
"pages": ["home", "calendar", "lists", "timer"]
```
These are the buttons on the left, in this order. The first one is where the screen returns after a few idle minutes.

| Page | What it is |
|---|---|
| `home` | the week ahead, your lists and a photo |
| `calendar` | month view (two weeks / one week from its toolbar), tap a day or event to see or edit it |
| `lists` | every list side by side, each one scrolls (Home shows the first three) |
| `timer` | kitchen timers with a chime |

More pages are coming: Smart Home, a word game and Settings.

## Weather
```json
"weather": { "provider": "open-meteo" }
```
- `"open-meteo"` (default) is free and needs no account or key.
- `"openweathermap"` needs a free API key from <https://openweathermap.org/>, put in `secrets.json → weather.openweathermap.apiKey`.

## Header (top bar)
```json
"header": {
  "holidays": "US",
  "occasions": [ { "name": "Anniversary", "month": 6, "day": 14 } ],
  "birthdaysFromCalendar": true,
  "sports": { "league": "nfl", "team": "NE" }
}
```
- The top-right pill counts down to the next holiday, occasion or birthday.
  - `holidays`: `"US"` for the main US holidays, or `"none"`.
  - `occasions`: your own yearly dates. `month` runs 1–12.
  - `birthdaysFromCalendar`: calendar events with "Birthday" or "Bday" in the title count as birthdays.
- `sports`: on game day, a pill shows your team's game, time and channel, then the live score.
  - Leagues: `nfl`, `college-football`, `nba`, `wnba`, `mens-college-basketball`, `mlb`, `nhl`, `mls`, `nwsl`, `epl`.
  - `team` is the short code shown on scoreboards (`NE`, `BOS`, `LAL`…). Leave it `""` for no sports pill.

## Calendars
OpenSky can show any number of calendars, each with its own colour. Some can also be **added to and edited from the screen**.

```json
"calendar": {
  "sources": [
    { "name": "Family", "type": "local", "color": "blue" },
    { "name": "School", "url": "https://example.org/school-events.ics", "color": "teal" },
    { "name": "Mom", "color": "pink" },
    { "name": "Shared", "type": "caldav", "color": "green" }
  ],
  "holidays": "US",
  "colors": {
    "calendars": {},
    "rules": [ { "match": "dentist", "color": "indigo" }, { "match": "soccer", "color": "green" } ]
  }
}
```

| Kind | How | Edit from the screen? |
|---|---|---|
| **On the Pi** | `"type": "local"`. Nothing to set up; events are kept on the Pi. | ✅ |
| **A calendar link** (Google, Outlook, iCloud, school or team calendars…) | `"url": "…"` in opensky.json if it's public, or no url and the link in `secrets.json → calendar.sources.<name>` if it's private | read-only |
| **iCloud, Fastmail, Nextcloud (CalDAV)** | `"type": "caldav"` and the account in `secrets.json` (below) | ✅ |

- `holidays`: `"US"` adds a US holidays calendar; `"none"` turns it off.
- **Colours:** `pink`, `green`, `blue`, `orange`, `yellow`, `emerald`, `purple`, `red`, `teal`, `indigo`, `tan`, `gray`.
  Each event's colour is picked in this order:
  1. a matching `rules` keyword in the title
  2. `colors.calendars` (`{ "Mom": "pink" }`)
  3. the calendar's own `color` in `sources`
  4. otherwise a steady automatic colour

### Finding a calendar's link
- **Google Calendar** (on a computer): ⚙ Settings → pick the calendar on the left → *Integrate calendar* → copy **Secret address in iCal format**. It's private, so put it in `secrets.json`.
- **Outlook / Microsoft 365**: Settings → Calendar → *Shared calendars* → *Publish a calendar* → choose "Can view all details" → copy the **ICS** link.
- **iCloud** (read-only link): Calendar app → the calendar's ⓘ → **Public Calendar** → copy the link (`webcal://…` works).
- School, team and sports calendars usually offer an "iCal / ICS / Subscribe" link.

A private link goes in `secrets.json` like this. The name must match opensky.json:
```json
"calendar": { "sources": { "Mom": "https://calendar.google.com/calendar/ical/…/private-…/basic.ics" } }
```

### iCloud / Fastmail / Nextcloud with editing (CalDAV)
In `opensky.json`: `{ "name": "Shared", "type": "caldav", "color": "green" }`. Then in `secrets.json`:
```json
"calendar": { "caldav": {
  "Shared": { "url": "https://caldav.icloud.com/", "username": "you@icloud.com", "password": "abcd-efgh-ijkl-mnop", "calendar": "Family" }
} }
```
- **iCloud needs an app-specific password**, not your Apple ID password. Create one at <https://appleid.apple.com> → *Sign-In and Security* → *App-Specific Passwords*.
- `calendar` is the calendar's name as it appears in the Calendar app.
- **Fastmail**: `"url": "https://caldav.fastmail.com/"` with an app password.
- **Nextcloud**: `"url": "https://your-server/remote.php/dav/"`.
- Repeating events are shown, but are changed in your calendar app rather than on the screen.
- The last copy of each calendar is kept on the Pi, so events still show if the internet is down.

## Lists
```json
"lists": {
  "lists": [
    { "name": "To-Dos", "color": "blue" },
    { "name": "Groceries", "color": "orange" },
    { "name": "Shopping", "provider": "todoist", "project": "Shopping", "color": "green" }
  ],
  "refreshMinutes": 2,
  "columns": 4
}
```
- **On the Pi** (default, no `provider`): items are kept on the Pi.
- **Todoist** (`"provider": "todoist"`): shows a Todoist project, by default the one with the same name as the list. Use `"project": "…"` for a different name, or `"projectId": "…"`.
  - Add your token to `secrets.json → lists.todoist.token`. Find it in Todoist → Settings → *Integrations* → *Developer* → **API token**.
  - Changes on the screen show in the Todoist app, and the other way round. The screen checks every `refreshMinutes`.
- Home shows the first three lists; the **Lists** page shows them all (`columns` fit across, more scroll sideways). Tap **Add item** to add, tap the circle to check off (with Undo), or tap an item to edit or delete it.

## Photos
```json
"photos": { "enabled": true, "provider": "folder", "folder": "~/Pictures", "usb": true, "intervalSeconds": 30 }
```
- `folder`: pictures in this folder and its sub-folders, shuffled. Copy them over the network, or with a USB stick and the file manager.
- `usb`: also show photos from a plugged-in USB stick. Put them in a folder named **`OpenSky`** on the stick; the rest of the stick is ignored.
- Two portrait photos are shown side by side. The date a photo was taken is shown when the photo has it.
- **Immich** (your own photo server): `"provider": "immich", "url": "http://192.168.1.20:2283"`. Put an API key in
  `secrets.json → photos.immich.apiKey`; create it in Immich under Account Settings → *API Keys*.
- `"enabled": false`: no photo card.

## Trash and recycling day
```json
"pickup": { "trashDay": "monday", "preset": "" }
```
A small trash-can icon appears on pickup days in the week view. It moves a day later after a holiday.
- `trashDay`: `"monday"` … `"friday"`. Leave it `""` for no icons.
- `preset`: a city's full schedule, including yard waste and holidays. Current presets: `"new-bedford-ma"`. Want your city added? Open an issue on GitHub with a link to its schedule, or ask an AI assistant to make one with `lib/pickup-presets/new-bedford-ma.json` as the example.
- Your own rules (every-other-week recycling, yard-waste weeks…) can go here too; see the notes at the top of `lib/client/pickup.js`.

## Screen and timers
```json
"sidebar": { "idleReturnMinutes": 5 },
"timer":   { "quickAddMinutes": [5, 10, 15, 30, 45, 60], "chimeVolume": 0.6 }
```
- `idleReturnMinutes`: after this many minutes without a touch, open pop-ups close and the screen returns to the first page. A running timer stays put. `0` turns this off.
- **Sleep** (bottom left) blacks out the screen until the next touch.
- `quickAddMinutes`: the timer's quick buttons. `chimeVolume` runs from 0 to 1.
