#!/bin/bash
# OpenSky installer — run it from the OpenSky folder:   ./install.sh
# Safe to run again (that's also how you update: git pull && ./install.sh).
#
#   ./install.sh                 install / update, ask a few questions, start OpenSky
#   ./install.sh --yes           no questions (defaults; edit config/opensky.json later)
#   ./install.sh --no-services   install only: don't add the start-at-login services or touch screen blanking
#   ./install.sh --home DIR      where the runtime goes (default ~/.local/share/opensky)
#   ./install.sh --uninstall     stop OpenSky and remove the services (your config/ folder is kept)
#
# What it puts where:
#   <this folder>/config/        YOUR settings and data: opensky.json, secrets.json, on-device calendar + lists
#   ~/.local/share/opensky/      the runtime: Node.js (only if the system's is too old), MagicMirror, Python venv
#   ~/.config/systemd/user/      opensky.service (the screen) + opensky-calendar.service (CalDAV helper)
#   ~/.config/autostart/         opensky.desktop — starts the screen when the desktop starts
#   ~/.local/bin/opensky         the `opensky` command (start / stop / restart / status / logs / update)
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="$HOME/.local/share/opensky"
YES=0; SERVICES=1; UNINSTALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) YES=1 ;;
    --no-services) SERVICES=0 ;;
    --home) RUNTIME="$2"; shift ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n 2,17p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
  shift
done
[ -t 0 ] || YES=1

MM_VERSION="v2.38.0"
NODE_VERSION="24.22.0"                       # used only when the system's Node is missing or too old
MM="$RUNTIME/MagicMirror"
VENV="$RUNTIME/venv"
UNITS="$HOME/.config/systemd/user"
AUTOSTART="$HOME/.config/autostart/opensky.desktop"
CONFIG="$REPO/config"

say()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
ask()  { # ask "Question?" default(y/n) → 0 for yes
  [ $YES = 1 ] && { [ "$2" = y ]; return; }
  local a; read -r -p "  $1 [$( [ "$2" = y ] && echo Y/n || echo y/N )] " a; a="${a:-$2}"; [[ "$a" =~ ^[Yy] ]]
}

# ---------------------------------------------------------------- uninstall
if [ $UNINSTALL = 1 ]; then
  say "Removing OpenSky's services"
  systemctl --user disable --now opensky.service opensky-calendar.service 2>/dev/null || true
  rm -f "$UNITS/opensky.service" "$UNITS/opensky-calendar.service" "$AUTOSTART" "$HOME/.local/bin/opensky"
  systemctl --user daemon-reload 2>/dev/null || true
  ok "Stopped and removed. Your settings and data are still in $CONFIG"
  if ask "Also delete the runtime in $RUNTIME (MagicMirror, Node.js, Python)?" n; then rm -rf "$RUNTIME"; ok "Deleted $RUNTIME"; fi
  exit 0
fi

# ---------------------------------------------------------------- checks
say "Checking this computer"
[ "$(id -u)" != 0 ] || die "Please run this as your normal user (not with sudo) — it asks for sudo itself when needed."
[ "$(uname -s)" = Linux ] || die "OpenSky runs on Linux (Raspberry Pi OS)."
case "$(uname -m)" in
  aarch64|arm64) NODE_ARCH=arm64 ;;
  armv7l) NODE_ARCH=armv7l ;;
  x86_64) NODE_ARCH=x64 ;;
  *) die "Unsupported processor: $(uname -m) (a Raspberry Pi 4 or 5 with 64-bit Raspberry Pi OS is recommended)" ;;
esac
ok "$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-Linux}"), $(uname -m)"
mkdir -p "$RUNTIME"
free_mb=$(df -Pm "$RUNTIME" | awk 'NR==2 {print $4}')
[ "${free_mb:-0}" -ge 1500 ] || die "Not enough free space: about 1.5 GB is needed in $RUNTIME (${free_mb} MB free)."

need=()
for c in git curl xz python3; do command -v "$c" >/dev/null || need+=("$c"); done
python3 -c 'import venv, ensurepip' 2>/dev/null || need+=(python3-venv)
if [ ${#need[@]} -gt 0 ]; then
  pkgs=$(printf '%s\n' "${need[@]}" | sed 's/^xz$/xz-utils/' | tr '\n' ' ')
  say "Installing system packages: $pkgs(needs sudo)"
  sudo apt-get update -q && sudo apt-get install -y -q $pkgs
fi
ok "git, curl, Python ready"

# ---------------------------------------------------------------- Node.js
say "Node.js"
node_ok() { # MagicMirror 2.38 needs Node 22.22.2+ (22.x) or 24+
  "$1" -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a>=24||(a===22&&(b>22||(b===22&&c>=2)))?0:1)' 2>/dev/null
}
NODE_BIN=""
if command -v node >/dev/null && node_ok "$(command -v node)"; then
  NODE_BIN="$(dirname "$(command -v node)")"; ok "Using the system's Node.js $(node -v)"
elif [ -x "$RUNTIME/node/bin/node" ] && node_ok "$RUNTIME/node/bin/node"; then
  NODE_BIN="$RUNTIME/node/bin"; ok "Using OpenSky's Node.js $("$NODE_BIN/node" -v)"
else
  name="node-v$NODE_VERSION-linux-$NODE_ARCH"
  echo "  Downloading Node.js $NODE_VERSION (just for OpenSky; the system's Node.js is left alone)…"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 -o "$tmp/$name.tar.xz" "https://nodejs.org/dist/v$NODE_VERSION/$name.tar.xz"
  curl -fsSL --retry 3 -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  (cd "$tmp" && grep " $name.tar.xz\$" SHASUMS256.txt | sha256sum -c --quiet -) || die "The Node.js download didn't verify — please try again."
  rm -rf "$RUNTIME/node"; mkdir -p "$RUNTIME/node"
  tar -xJf "$tmp/$name.tar.xz" -C "$RUNTIME/node" --strip-components 1
  NODE_BIN="$RUNTIME/node/bin"; ok "Node.js $("$NODE_BIN/node" -v) in $RUNTIME/node"
fi
export PATH="$NODE_BIN:$PATH"

# ---------------------------------------------------------------- MagicMirror
say "MagicMirror $MM_VERSION"
if [ ! -d "$MM/.git" ]; then
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$MM_VERSION" https://github.com/MagicMirrorOrg/MagicMirror "$MM"
elif [ "$(git -C "$MM" describe --tags 2>/dev/null)" != "$MM_VERSION" ]; then
  git -C "$MM" fetch -q --depth 1 origin tag "$MM_VERSION" && git -C "$MM" checkout -q -f "$MM_VERSION"
fi
stamp="$MM/node_modules/.opensky-$MM_VERSION-node-$(node -v)"
if [ ! -f "$stamp" ]; then
  echo "  Installing MagicMirror's parts (a few minutes on a Pi)…"
  (cd "$MM" && npm run -s install-mm >"$RUNTIME/install-mm.log" 2>&1) || die "MagicMirror's install failed — see $RUNTIME/install-mm.log"
  touch "$stamp"
fi
ok "MagicMirror ready in $MM"

say "Connecting OpenSky to MagicMirror"
"$REPO/tools/link-mm.sh" "$MM" | sed 's/^/  /'

# ---------------------------------------------------------------- calendar service (CalDAV: iCloud, Fastmail…)
say "Calendar helper (for iCloud / Fastmail / Nextcloud calendars)"
CAL_OK=1
{ [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"; } &&
  "$VENV/bin/pip" install -q --disable-pip-version-check -r "$REPO/services/calendar-service/requirements.txt" >"$RUNTIME/pip.log" 2>&1 \
  && ok "Ready" || { CAL_OK=0; warn "Couldn't set it up (see $RUNTIME/pip.log). Everything else works; re-run ./install.sh to try again."; }

# ---------------------------------------------------------------- your settings
say "Your settings ($CONFIG)"
"$NODE_BIN/node" "$REPO/tools/first-run.js" $( [ $YES = 1 ] && echo --yes ) | sed 's/^/  /'
if [ ! -f "$CONFIG/secrets.json" ]; then
  cp "$CONFIG/secrets.example.json" "$CONFIG/secrets.json"; ok "Created secrets.json (for passwords and keys — only this Pi reads it)"
fi
chmod 600 "$CONFIG/secrets.json"
mkdir -p "$HOME/Pictures"

# ---------------------------------------------------------------- the `opensky` command
mkdir -p "$HOME/.local/bin"
ln -sfn "$REPO/tools/opensky" "$HOME/.local/bin/opensky"
ok "The 'opensky' command is ready (opensky help)"

if [ $SERVICES = 0 ]; then
  say "Done (no services added — --no-services)"
  echo "  Start it by hand:  OPENSKY_HOME=$RUNTIME $REPO/tools/opensky run"
  exit 0
fi

# ---------------------------------------------------------------- start at login
say "Starting OpenSky with the desktop"
mkdir -p "$UNITS" "$(dirname "$AUTOSTART")"
ENVS="Environment=OPENSKY_SETTINGS=$CONFIG/opensky.json
Environment=OPENSKY_SECRETS=$CONFIG/secrets.json
Environment=OPENSKY_LOCAL_CALENDAR=$CONFIG/local-calendar.json
Environment=OPENSKY_LOCAL_LISTS=$CONFIG/lists.json
Environment=OPENSKY_CALENDAR_CACHE=$CONFIG/calendar-cache"
cat > "$UNITS/opensky-calendar.service" <<EOF
[Unit]
Description=OpenSky calendar helper (CalDAV; listens on this Pi only)

[Service]
$ENVS
ExecStart=$VENV/bin/python $REPO/services/calendar-service/calendar_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
cat > "$UNITS/opensky.service" <<EOF
[Unit]
Description=OpenSky screen (MagicMirror)
Wants=opensky-calendar.service
After=opensky-calendar.service

[Service]
$ENVS
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
WorkingDirectory=$MM
ExecStart=$MM/node_modules/.bin/electron js/electron.js --ozone-platform=wayland
Restart=on-failure
RestartSec=5
EOF
# The screen needs the desktop's display, so the desktop starts it (systemd keeps it running and restarts it)
cat > "$AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=OpenSky
Comment=Family calendar screen
Exec=sh -c 'systemctl --user import-environment WAYLAND_DISPLAY DISPLAY XDG_RUNTIME_DIR XDG_SESSION_TYPE; systemctl --user restart opensky.service'
X-GNOME-Autostart-enabled=true
EOF
systemctl --user daemon-reload
[ $CAL_OK = 1 ] && systemctl --user enable -q --now opensky-calendar.service && ok "Calendar helper running"
ok "Starts automatically when the desktop starts"

# ---------------------------------------------------------------- screen blanking + auto login (Raspberry Pi OS)
if command -v raspi-config >/dev/null; then
  if [ "$(sudo -n raspi-config nonint get_blanking 2>/dev/null || echo ?)" != 1 ] && ask "Keep the screen from going blank by itself? (OpenSky has its own Sleep button) (needs sudo)" y; then
    sudo raspi-config nonint do_blanking 1 && ok "Screen blanking off (after the next restart)"
  fi
  if [ "$(sudo -n raspi-config nonint get_autologin 2>/dev/null || echo ?)" != 0 ] && ask "Log in automatically at power-on, so OpenSky starts by itself? (needs sudo)" y; then
    sudo raspi-config nonint do_boot_behaviour B4 && ok "Desktop auto-login on"
  fi
fi

if [ -n "${WAYLAND_DISPLAY:-}" ] && ask "Start OpenSky now?" y; then
  systemctl --user import-environment WAYLAND_DISPLAY DISPLAY XDG_RUNTIME_DIR XDG_SESSION_TYPE 2>/dev/null || true
  systemctl --user restart opensky.service && ok "Starting — it appears in a few seconds"
fi

say "All set!"
cat <<EOF
  Settings:  $CONFIG/opensky.json      (docs/configure.md explains every setting)
  Secrets:   $CONFIG/secrets.json      (calendar passwords, Todoist token…)
  Photos:    put pictures in ~/Pictures, or plug in a USB stick with photos
  Commands:  opensky restart · opensky status · opensky logs · opensky update
  Help:      docs/troubleshooting.md
EOF
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "  (Open a new terminal for the 'opensky' command to work.)";; esac
