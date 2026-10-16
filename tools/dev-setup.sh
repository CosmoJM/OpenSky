#!/bin/bash
# OpenSky development setup: wire this repo into a MagicMirror checkout (default ~/opensky-dev/MagicMirror)
# for the off-screen tests (tools/test-all.sh). Never point it at a MagicMirror you use for real.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MM="${1:-$HOME/opensky-dev/MagicMirror}"
"$REPO/tools/link-mm.sh" "$MM"
# test fixtures (calendars etc.), served by the dev MagicMirror at /modules/opensky-fixtures/ — development only
ln -sfn "$REPO/tools/fixtures" "$MM/modules/opensky-fixtures"
# settings files, for running the dev copy by hand (the tests use OPENSKY_SETTINGS / OPENSKY_SECRETS instead)
for f in opensky.json opensky.example.json secrets.json; do [ -e "$REPO/config/$f" ] && ln -sfn "$REPO/config/$f" "$MM/config/$f"; done
true
