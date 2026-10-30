#!/bin/bash
# Container start-up: seed /config on first run, start the CalDAV helper, then MagicMirror (server only).
# Starts as root, then runs everything as PUID:PGID (default 1000:1000) so files in /config belong to you.
set -euo pipefail
PUID="${PUID:-1000}"; PGID="${PGID:-1000}"
export HOME=/tmp

if [ "$(id -u)" = 0 ] && [ "$PUID" != 0 ]; then
  mkdir -p /config
  # MagicMirror writes these two at start-up
  chown "$PUID:$PGID" /config /opt/MagicMirror/config /opt/MagicMirror/js
  # (files already in /config, e.g. from an earlier run as another user)
  find /config -not -user "$PUID" -exec chown "$PUID:$PGID" {} + 2>/dev/null || true
  exec setpriv --reuid "$PUID" --regid "$PGID" --clear-groups "$0" "$@"
fi

mkdir -p /config
[ -f /config/opensky.json ] || cp /opt/opensky/config/opensky.example.json /config/opensky.json
[ -f /config/secrets.json ] || cp /opt/opensky/config/secrets.example.json /config/secrets.json
chmod 600 /config/secrets.json 2>/dev/null || true

/opt/venv/bin/python /opt/opensky/services/calendar-service/calendar_service.py &
CAL=$!
trap 'kill $CAL 2>/dev/null || true' EXIT

cd /opt/MagicMirror
exec node --run server
