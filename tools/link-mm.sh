#!/bin/bash
# Wire this OpenSky folder into a MagicMirror folder (used by install.sh and tools/dev-setup.sh):
# - links OpenSky's modules, shared library, base theme and config builder (edits here apply after a restart)
# - installs the pinned community modules OpenSky needs (+ OpenSky's patches)
# Safe to run again.  Usage: tools/link-mm.sh <MagicMirror folder>
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MM="${1:?usage: tools/link-mm.sh <MagicMirror folder>}"
[ -f "$MM/js/electron.js" ] || { echo "No MagicMirror at $MM"; exit 1; }

# OpenSky modules
for m in "$REPO"/modules/MMM-OpenSky-*; do ln -sfn "$m" "$MM/modules/$(basename "$m")"; done
# shared server-side library (weather, secrets…) → <MagicMirror>/modules/opensky-lib (not a module, just required)
ln -sfn "$REPO/lib" "$MM/modules/opensky-lib"
# base theme + config builder (settings stay in OpenSky's config/ folder; the start-up sets OPENSKY_SETTINGS etc.)
ln -sfn "$REPO/css/opensky.css" "$MM/css/opensky.css"
ln -sfn "$REPO/config/config.js" "$MM/config/config.js"

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
