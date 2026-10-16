#!/bin/bash
# Test for `opensky update` / `opensky rollback` against a throwaway git "GitHub" (a local bare repo).
# The install + restart and the health check are stand-ins (OPENSKY_UPDATE_INSTALL / OPENSKY_HEALTH_CMD).
REPO="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; fi; }
g() { git -c user.name=t -c user.email=t@t -c init.defaultBranch=main "$@"; }

mkdir -p "$T/src/tools" "$T/src/config" && cp "$REPO/tools/opensky" "$T/src/tools/" && echo 1 > "$T/src/VERSION"
printf 'config/*\n!config/.keep\n' > "$T/src/.gitignore"; touch "$T/src/config/.keep"
(cd "$T/src" && g init -q && g add -A && g commit -qm v1 && g tag v1)
g clone -q --bare "$T/src" "$T/origin.git"
g clone -q "$T/origin.git" "$T/work"
newversion() { (cd "$T/src" && echo "$1" > VERSION && g commit -qam "v$1" && g push -q "$T/origin.git" HEAD:main); }
OS="$T/work/tools/opensky"
export OPENSKY_UPDATE_INSTALL="true" OPENSKY_HEALTH_WAIT=1

out=$(OPENSKY_HEALTH_CMD=true "$OS" update 2>&1)
ok "1 nothing new → 'up to date'" '[[ "$out" == *"up to date"* ]]'
newversion 2
out=$(OPENSKY_HEALTH_CMD=true "$OS" update 2>&1); st=$?
ok "2 a good update: newest version, previous one remembered" '[ $st = 0 ] && [ "$(cat $T/work/VERSION)" = 2 ] && [ -f $T/work/config/.previous-version ]'
newversion 3
out=$(OPENSKY_HEALTH_CMD=false "$OS" update 2>&1); st=$?
ok "3 an update that doesn't start → back on the previous version by itself" '[ $st = 1 ] && [ "$(cat $T/work/VERSION)" = 2 ] && [[ "$out" == *"going back"* ]]'
(cd "$T/work" && g reset -q --hard origin/main)   # pretend v3 got installed
echo "$(cd "$T/src" && git rev-parse HEAD~1)" > "$T/work/config/.previous-version"
out=$("$OS" rollback 2>&1); st=$?
ok "4 opensky rollback → the version before" '[ $st = 0 ] && [ "$(cat $T/work/VERSION)" = 2 ]'
echo hand-edit >> "$T/work/VERSION"
out=$(OPENSKY_HEALTH_CMD=true "$OS" update 2>&1); st=$?
ok "5 files changed by hand → no update over them" '[ $st = 1 ] && [[ "$out" == *"changed by hand"* ]] && grep -q hand-edit "$T/work/VERSION"'
echo "SUMMARY pass=$pass fail=$fail"
