# OpenSky in Docker

Run OpenSky as a container on any computer, and open it in the browser of a tablet, phone or PC. There is no screen
in the container: MagicMirror runs as a web server and each device shows the page. (On a Raspberry Pi with a
touchscreen, use [install.md](install.md) instead.)

```bash
git clone https://github.com/CosmoJM/OpenSky.git && cd OpenSky
docker compose up -d --build
```
Then open **`http://<this computer>:8080`** on each tablet. Your settings and data are in `./docker-config/`
(`opensky.json`, `secrets.json`, lists, on-device calendar): back that folder up.

## Settings
Environment variables in `docker-compose.yml` (or a `.env` file next to it):

| Variable | Default | What it does |
|---|---|---|
| `TZ` | `UTC` | The time zone, e.g. `America/Chicago`. |
| `PUID` / `PGID` | `1000` / `1000` | The user and group the container runs as, so the files in `docker-config/` are yours. `id` shows yours. |
| `OPENSKY_SETUP_URL` | | How phones reach the [phone setup](configure.md#phone-setup) page, e.g. `http://nas.local:8090`. See below. |
| `OPENSKY_IP_WHITELIST` | `all` | Who may open the screen: `all`, or addresses separated by commas. |

Edit `docker-config/opensky.json` and `secrets.json` the same way as on a Pi ([configure.md](configure.md)), then
`docker restart opensky`.

## Phone setup
**Settings → Set up from your phone** works in the browser too. The page is a separate small server on port 8090
that only runs while the pairing card is open, and it only answers to its own address. In a container its own address
is an internal one that phones can't reach, so tell it the address phones use:
```
OPENSKY_SETUP_URL=http://nas.local:8090
```
Publish port 8090 (the compose file does), or route that address to it from your reverse proxy. To use other ports on the computer, change the left side of the mapping (`"9000:8080"`, `"9090:8090"`); the ports inside the container stay 8080 and 8090. Put the port phones type in `OPENSKY_SETUP_URL` (here `http://nas.local:9090`). The QR code then shows
this address, and requests for any other name are still refused. Saving in setup doesn't restart the container: run
`docker restart opensky` when you finish.

## Good to know
- **Anyone who can reach port 8080 can use the screen** (there is no login), so keep it on your home network or behind
  your reverse proxy's login. Secrets stay in `secrets.json` and never reach the page.
- Things that belong to a Pi (screen brightness, sleep, Restart Pi, Update, the Music add-on) don't do anything here.
  Update with `git pull && docker compose up -d --build`.
- Behind a reverse proxy such as Traefik, point it at port 8080 and leave the published ports out.
