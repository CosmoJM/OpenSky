#!/bin/bash
# OpenSky development setup: wire this repo into a MagicMirror checkout (default ~/opensky-dev/MagicMirror).
# - links OpenSky's modules, base theme and config builder into MagicMirror (edits in the repo apply immediately)
# - installs the pinned community modules OpenSky needs
# Safe to run again. Never point it at a MagicMirror you use for real.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MM="${1:-$HOME/opensky-dev/MagicMirror}"
[ -f "$MM/js/electron.js" ] || { echo "No MagicMirror at $MM"; exit 1; }

# OpenSky modules
for m in "$REPO"/modules/MMM-OpenSky-*; do ln -sfn "$m" "$MM/modules/$(basename "$m")"; done
# shared server-side library (weather, secrets…) → <MagicMirror>/modules/opensky-lib (not a module, just required)
ln -sfn "$REPO/lib" "$MM/modules/opensky-lib"
# test fixtures (calendars etc.), served by the dev MagicMirror at /modules/opensky-fixtures/ — development only
ln -sfn "$REPO/tools/fixtures" "$MM/modules/opensky-fixtures"
# base theme + config builder (settings files stay in the repo's config/ folder, read via the link)
ln -sfn "$REPO/css/opensky.css" "$MM/css/opensky.css"
ln -sfn "$REPO/config/config.js" "$MM/config/config.js"
for f in opensky.json opensky.example.json secrets.json; do [ -e "$REPO/config/$f" ] && ln -sfn "$REPO/config/$f" "$MM/config/$f"; done

# pinned community modules (name url commit)
while read -r name url commit; do
  [ -z "$name" ] && continue
  if [ ! -d "$MM/modules/$name/.git" ]; then git clone -q "$url" "$MM/modules/$name"; fi
  git -C "$MM/modules/$name" fetch -q --depth 1 origin "$commit" 2>/dev/null || true
  # (a clean checkout first, so the OpenSky patch below is applied exactly once)
  git -C "$MM/modules/$name" checkout -q -f "$commit"
  git -C "$MM/modules/$name" submodule update -q --init --recursive 2>/dev/null || true
  if [ -f "$REPO/patches/$name.patch" ]; then
    git -C "$MM/modules/$name" apply --whitespace=nowarn "$REPO/patches/$name.patch" && echo "  + patches/$name.patch"
  fi
  echo "community module $name @ ${commit:0:8}"
done < "$REPO/tools/community-modules.txt"
echo "OpenSky linked into $MM"
