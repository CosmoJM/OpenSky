# Music add-on

Turns the screen into a speaker your family can play to from their phones, and adds a **Music** page: the album
cover, the song and artist, a progress bar, previous / play-pause / next, and the volume.

- **AirPlay** — iPhone, iPad and Mac: Apple Music, Podcasts, YouTube, Audible… anything with the AirPlay icon.
- **Spotify Connect** — any phone or computer with Spotify. Spotify only lets Premium accounts play to a speaker.

No accounts or keys to set up: the phone does the playing, the screen is just the speaker. Sound comes out of the
screen's own speakers (most monitors and TVs have them) or whatever the Pi's sound output is set to.

## Install
On the Pi, open **Terminal** and type:
```bash
opensky addon music
```
It asks for your password once (to install AirPlay from Raspberry Pi OS), downloads the Spotify part, starts both
speakers and offers to add the Music page to the sidebar. About a minute.

## Play something
- **iPhone / iPad:** open Control Center (or the song in Apple Music), tap the AirPlay icon, pick your screen.
- **Mac:** the AirPlay icon in the menu bar or in Music.
- **Spotify:** play something, tap the speaker icon at the bottom of the player, pick your screen.

The Music page shows these steps whenever nothing is playing.

## Settings
In phone setup → **Extras → Music** (or `opensky.json`):
```json
"music": { "name": "Kitchen", "airplay": true, "spotify": true }
```
- `name` — what phones show in their speaker list. Default: your family name.
- `airplay` / `spotify` — turn either one off.

The volume on the Music page is the screen's volume (the same as in Settings). Phones also have their own volume.

## Good to know
- It's **AirPlay 1** (the version Raspberry Pi OS ships). iPhones, iPads and Macs play to it like any AirPlay speaker;
  it just can't be grouped with HomePods for multi-room in the Home app.
- One phone at a time per speaker; another phone can take over.
- The buttons on the Music page control the phone that's playing. A few apps ignore remote buttons over AirPlay —
  use the phone then.
- Uses ports 5100 (AirPlay) and 3678 (Spotify's control, this Pi only).

## Remove
```bash
opensky addon music remove
```
Then take the Music page off in Settings → Pages. AirPlay itself stays installed: `sudo apt remove shairport-sync`.

## Trouble
- **The screen isn't in the phone's speaker list:** the phone must be on the same Wi-Fi (not a guest network).
  Check both speakers run: `opensky status`. Their logs: `journalctl --user -u opensky-airplay -u opensky-spotify`.
- **No sound:** check the volume on the Music page and the screen's own volume; in the Pi's desktop, the speaker icon
  at the top right picks the sound output (HDMI or a USB speaker).
