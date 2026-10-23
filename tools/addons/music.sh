#!/bin/bash
# OpenSky Music add-on — this screen becomes a speaker your family can play to from their phones:
#   AirPlay (iPhone, iPad, Mac: Apple Music, Podcasts, YouTube…) with shairport-sync from Raspberry Pi OS, and
#   Spotify Connect (any phone, Spotify Premium) with go-librespot (a pinned release, its checksum checked).
# The Music page shows what's playing with play / pause / skip and the volume.
#
#   opensky addon music           install (asks for sudo once, for shairport-sync)
#   opensky addon music remove    remove the speakers again (shairport-sync stays installed: sudo apt remove shairport-sync)
#   music.sh units                rewrite the services (install.sh does this on updates when the add-on is installed)
#   music.sh apply                after a settings change: a speaker switched off stops, one switched on starts, and one
#                                 restarts only when its config (its name) changed — playing music isn't cut off otherwise
set -euo pipefail

REPO="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
RUNTIME="${OPENSKY_HOME:-$HOME/.local/share/opensky}"
DIR="$RUNTIME/music"
UNITS="$HOME/.config/systemd/user"
CONFIG="${OPENSKY_CONFIG_DIR:-$REPO/config}"   # (tests: a copy)
GLR_VERSION="v0.10.5"
declare -A GLR_SHA=(   # sha256 of each release file (from the release page)
  [arm64]=35274c1d3576090096d3459ecf76ee9c025258d19dc76f0bf724f95c525467e1
  [armv6_rpi]=a1f36d2de2973742274eb122c730e0082490ac1e297271a48371e29f290c2e5d
  [x86_64]=f08647217d1dced339375680d731bb5fc2410a9d693f2e1235303511c35a051c
)

say()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
ask()  { [ -t 0 ] || { [ "$2" = y ]; return; }; local a; read -r -p "  $1 [$( [ "$2" = y ] && echo Y/n || echo y/N )] " a; a="${a:-$2}"; [[ "$a" =~ ^[Yy] ]]; }
node_bin() { if [ -x "$RUNTIME/node/bin/node" ]; then echo "$RUNTIME/node/bin/node"; else command -v node || die "Node.js not found — run ./install.sh first"; fi; }

addon_units() {
  local node; node="$(node_bin)"
  mkdir -p "$UNITS" "$DIR"
  cat > "$UNITS/opensky-airplay.service" <<EOF
[Unit]
Description=OpenSky Music: AirPlay speaker (shairport-sync)
After=pipewire-pulse.service

[Service]
Environment=OPENSKY_SETTINGS=$CONFIG/opensky.json
ExecCondition=$node $REPO/services/music/render.js enabled airplay
ExecStartPre=$node $REPO/services/music/render.js airplay $DIR
ExecStart=/usr/bin/shairport-sync -c $DIR/shairport-sync.conf
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF
  cat > "$UNITS/opensky-spotify.service" <<EOF
[Unit]
Description=OpenSky Music: Spotify Connect speaker (go-librespot)
After=pipewire-pulse.service

[Service]
Environment=OPENSKY_SETTINGS=$CONFIG/opensky.json
ExecCondition=$node $REPO/services/music/render.js enabled spotify
ExecStartPre=$node $REPO/services/music/render.js spotify $DIR
ExecStart=$DIR/go-librespot --config_dir $DIR/spotify
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
}

# the Music page in the sidebar (before the Timer, or last)
add_page() {
  "$(node_bin)" -e '
    const fs = require("fs"), f = process.argv[1], s = JSON.parse(fs.readFileSync(f, "utf8"));
    s.pages = Array.isArray(s.pages) ? s.pages : ["home", "timer"];
    if (!s.pages.includes("music")) { const i = s.pages.indexOf("timer"); s.pages.splice(i >= 0 ? i : s.pages.length, 0, "music"); }
    fs.copyFileSync(f, f + ".bak"); fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");' "$CONFIG/opensky.json"
}

# (functions are named addon_* so they can never shadow a command: a function called "install" once ran itself
# instead of /usr/bin/install, over and over, until /tmp was full)
addon_install() {
  [ "$(id -u)" != 0 ] || die "Please run this as your normal user (not with sudo)."
  [ -f "$CONFIG/opensky.json" ] || die "OpenSky isn't set up here yet — run ./install.sh first."
  case "$(uname -m)" in
    aarch64|arm64) arch=arm64 ;; armv7l|armv6l) arch=armv6_rpi ;; x86_64) arch=x86_64 ;;
    *) die "This computer ($(uname -m)) isn't supported by the Music add-on." ;;
  esac

  say "AirPlay speaker (shairport-sync)"
  if ! command -v shairport-sync >/dev/null; then
    echo "  Installing shairport-sync from Raspberry Pi OS (needs sudo)…"
    mkdir -p "$DIR"
    # fresh package lists first (on a Pi whose lists are weeks old the install can fail); the output only on trouble
    sudo apt-get update -q >"$DIR/apt.log" 2>&1 || true
    sudo apt-get install -y -q shairport-sync >>"$DIR/apt.log" 2>&1 || { tail -15 "$DIR/apt.log"; die "Couldn't install shairport-sync (see above, or $DIR/apt.log)."; }
  fi
  # the package's own system-wide speaker would be a second "AirPlay" with the Pi's name: OpenSky runs its own
  if systemctl is-enabled -q shairport-sync.service 2>/dev/null || systemctl is-active -q shairport-sync.service 2>/dev/null; then
    sudo systemctl disable --now shairport-sync.service >/dev/null 2>&1 || true
  fi
  ok "shairport-sync $(shairport-sync -V 2>/dev/null | cut -d- -f1)"

  say "Spotify Connect speaker (go-librespot $GLR_VERSION)"
  if [ ! -x "$DIR/go-librespot" ] || [ "$(cat "$DIR/.go-librespot-version" 2>/dev/null)" != "$GLR_VERSION" ]; then
    tmp="$(mktemp -d)"; trap 'rm -rf "${tmp:-}"' EXIT
    local file="go-librespot_linux_$arch.tar.gz"
    curl -fsSL --retry 3 -o "$tmp/$file" "https://github.com/devgianlu/go-librespot/releases/download/$GLR_VERSION/$file" || die "Couldn't download go-librespot — check the internet and try again."
    echo "${GLR_SHA[$arch]}  $tmp/$file" | sha256sum -c --quiet - || die "The go-librespot download didn't verify — please try again."
    tar -xzf "$tmp/$file" -C "$tmp" go-librespot
    mkdir -p "$DIR" && install -m 755 "$tmp/go-librespot" "$DIR/go-librespot" && echo "$GLR_VERSION" > "$DIR/.go-librespot-version"
  fi
  ok "go-librespot in $DIR"

  say "Starting the speakers"
  addon_units
  systemctl --user enable -q --now opensky-airplay.service opensky-spotify.service
  sleep 2
  for u in opensky-airplay opensky-spotify; do systemctl --user is-active -q "$u.service" && ok "$u running" || printf '  \033[33m⚠ %s didn'"'"'t start — see: journalctl --user -u %s\033[0m\n' "$u" "$u"; done

  if ! grep -q '"music"' "$CONFIG/opensky.json" && ask "Add the Music page to the screen's sidebar?" y; then add_page && ok "Music page added"; fi
  systemctl --user is-active -q opensky.service && "$REPO/tools/opensky" restart && ok "Screen restarted"

  local name; name="$("$(node_bin)" -e 'console.log(require(process.argv[1]).speakerName(JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"))))' "$REPO/services/music/render.js" "$CONFIG/opensky.json")"
  say "All set!"
  cat <<EOF
  On a phone on the same Wi-Fi, pick "$name" as the speaker:
    iPhone / iPad / Mac: Control Center → AirPlay
    Spotify (Premium):   the speaker icon at the bottom of the player
  The speaker name can be changed in phone setup → Extras → Music.
  Sound comes out of the screen's speakers (or whatever the Pi's sound output is set to).
EOF
}

# after a settings change (opensky restart, phone setup's Finish): only what changed
addon_apply() {
  local node; node="$(node_bin)"
  local w unit conf
  for w in airplay spotify; do
    unit="opensky-$w.service"
    [ -f "$UNITS/$unit" ] || continue
    if ! OPENSKY_SETTINGS="$CONFIG/opensky.json" "$node" "$REPO/services/music/render.js" enabled "$w"; then
      systemctl --user is-active -q "$unit" && systemctl --user stop "$unit" && echo "  $w speaker switched off"
      continue
    fi
    conf="$DIR/shairport-sync.conf"; [ "$w" = spotify ] && conf="$DIR/spotify/config.yml"
    if ! systemctl --user is-active -q "$unit"; then systemctl --user start "$unit" && echo "  $w speaker started"
    elif [ "$(OPENSKY_SETTINGS="$CONFIG/opensky.json" "$node" "$REPO/services/music/render.js" print "$w" "$DIR")" != "$(cat "$conf" 2>/dev/null)" ]; then
      systemctl --user restart "$unit" && echo "  $w speaker restarted (new settings)"
    fi
  done
}

addon_remove() {
  say "Removing the Music add-on's speakers"
  systemctl --user disable --now opensky-airplay.service opensky-spotify.service 2>/dev/null || true
  rm -f "$UNITS/opensky-airplay.service" "$UNITS/opensky-spotify.service"
  rm -rf "$DIR"
  systemctl --user daemon-reload 2>/dev/null || true
  ok "Removed. (The Music page shows how to install it again; take it off in Settings → Pages.)"
  echo "  shairport-sync is still installed: sudo apt remove shairport-sync"
}

case "${1:-install}" in
  install) addon_install ;;
  units)   addon_units ;;
  apply)   addon_apply ;;
  remove)  addon_remove ;;
  *) sed -n 2,10p "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
