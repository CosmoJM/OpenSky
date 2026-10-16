#!/bin/bash
# Start/stop an off-screen Wayland compositor (labwc, headless) for tools/harness.js.
# It creates WAYLAND_DISPLAY=wayland-1 at 1920x1080 and never shows anything on a physical screen.
# Stops ONLY the compositor it started (by its saved PID) — never a desktop session's labwc.
set -u
RUN="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
PIDFILE="$RUN/opensky-headless.pid"
case "${1:-}" in
  start)
    if [ -f "$PIDFILE" ] && [ "$(cat /proc/"$(cat "$PIDFILE")"/comm 2>/dev/null)" = labwc ]; then echo "already running (pid $(cat "$PIDFILE"))"; exit 0; fi
    EMPTY=$(mktemp -d)   # empty labwc config: no autostart, no panels
    XDG_RUNTIME_DIR="$RUN" WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_RENDERER=pixman WLR_HEADLESS_OUTPUTS=1 \
      labwc -C "$EMPTY" >/dev/null 2>&1 &
    echo $! > "$PIDFILE"; sleep 3
    XDG_RUNTIME_DIR="$RUN" WAYLAND_DISPLAY=wayland-1 wlr-randr --output HEADLESS-1 --custom-mode 1920x1080 \
      && echo "headless compositor running (pid $(cat "$PIDFILE"), WAYLAND_DISPLAY=wayland-1)";;
  stop)
    P=$(cat "$PIDFILE" 2>/dev/null)
    if [ -n "$P" ] && [ "$(cat /proc/"$P"/comm 2>/dev/null)" = labwc ]; then kill "$P" && echo "stopped (pid $P)"; else echo "not running"; fi
    rm -f "$PIDFILE";;
  *) echo "usage: $0 start|stop"; exit 2;;
esac
