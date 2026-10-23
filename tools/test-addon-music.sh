#!/bin/bash
# Test for tools/addons/music.sh (the Music add-on installer), run end to end in a throwaway home folder with
# stand-ins for sudo, apt-get, systemctl, curl, sha256sum and shairport-sync — nothing is installed for real.
# Also: no shell function in OpenSky's scripts may be named like a real command (a function called "install"
# once ran itself instead of /usr/bin/install, downloading over and over until /tmp was full).
REPO="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1${3:+  — $3}"; fi; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name" 0; else ok "$name" 1; fi; }

# ---- stand-ins ----
mkdir -p "$T/bin" "$T/home" "$T/config"
LOG="$T/calls.log"; : > "$LOG"
cat > "$T/bin/sudo" <<EOF
#!/bin/bash
echo "sudo \$*" >> "$LOG"; "\$@"
EOF
cat > "$T/bin/apt-get" <<EOF
#!/bin/bash
echo "apt-get \$*" >> "$LOG"; printf '#!/bin/bash\necho 4.3.7-test\n' > "$T/bin/shairport-sync"; chmod +x "$T/bin/shairport-sync"
EOF
cat > "$T/bin/systemctl" <<EOF
#!/bin/bash
echo "systemctl \$*" >> "$LOG"
case "\$*" in
  *"is-enabled -q shairport-sync.service"*) exit 0 ;;                    # the package's own speaker is on
  *"is-active -q opensky.service"*) exit 1 ;;                             # OpenSky isn't running (no restart)
  *"is-active -q"*) exit 0 ;;
esac
exit 0
EOF
cat > "$T/bin/curl" <<EOF
#!/bin/bash
echo "curl \$*" >> "$LOG"
out=""; while [ \$# -gt 0 ]; do [ "\$1" = "-o" ] && { out="\$2"; shift; }; shift; done
d="\$(mktemp -d)"; printf '#!/bin/sh\necho fake go-librespot\n' > "\$d/go-librespot"; chmod +x "\$d/go-librespot"
tar -czf "\$out" -C "\$d" go-librespot; rm -rf "\$d"
EOF
cat > "$T/bin/sha256sum" <<EOF
#!/bin/bash
echo "sha256sum \$*" >> "$LOG"; cat > /dev/null; exit 0
EOF
chmod +x "$T/bin/"*
echo '{ "family": { "name": "The Testers" }, "pages": ["home", "calendar", "timer"] }' > "$T/config/opensky.json"

run() { HOME="$T/home" OPENSKY_HOME="$T/runtime" OPENSKY_CONFIG_DIR="$T/config" PATH="$T/bin:$PATH" timeout 60 bash "$REPO/tools/addons/music.sh" "$@" < /dev/null 2>&1; }
apt_expected=1; type -P shairport-sync >/dev/null && apt_expected=0   # (already on this computer: no apt install)
tmp_before=$(find /tmp -maxdepth 1 -name 'tmp.*' -user "$(id -u)" 2>/dev/null | wc -l)

# ---- install ----
out="$(run install)"; code=$?
ok "1 install finishes ('All set!') with the speaker name" "$([ $code = 0 ] && grep -q 'All set' <<<"$out" && grep -q '"The Testers"' <<<"$out"; echo $?)" "exit $code: $(tail -3 <<<"$out" | tr '\n' ' ')"
ok "2 one download, checksum checked, shairport-sync installed with apt (lists refreshed first) unless it already is" "$([ "$(grep -c '^curl ' "$LOG")" = 1 ] && grep -q '^sha256sum' "$LOG" && [ "$(grep -c '^apt-get install -y -q shairport-sync' "$LOG")" = "$apt_expected" ] && { [ "$apt_expected" = 0 ] || [ "$(grep '^apt-get' "$LOG" | head -1 | cut -d' ' -f2)" = update ]; }; echo $?)" "$(grep -c '^curl ' "$LOG") downloads, $(grep -c '^apt-get' "$LOG") apt (expected $apt_expected)"
check "3 go-librespot installed (runs) with its version noted" bash -c "[ \"\$('$T/runtime/music/go-librespot')\" = 'fake go-librespot' ] && grep -q '^v' '$T/runtime/music/.go-librespot-version'"
U="$T/home/.config/systemd/user"
check "4 AirPlay service: settings, config written first, shairport-sync with it" bash -c "grep -q 'Environment=OPENSKY_SETTINGS=$T/config/opensky.json' '$U/opensky-airplay.service' && grep -q 'render.js airplay $T/runtime/music' '$U/opensky-airplay.service' && grep -q 'ExecStart=/usr/bin/shairport-sync -c $T/runtime/music/shairport-sync.conf' '$U/opensky-airplay.service'"
check "5 Spotify service: config written first, go-librespot with it" bash -c "grep -q 'render.js spotify $T/runtime/music' '$U/opensky-spotify.service' && grep -q 'ExecStart=$T/runtime/music/go-librespot --config_dir $T/runtime/music/spotify' '$U/opensky-spotify.service'"
check "6 the package's own AirPlay speaker is switched off; ours are enabled" bash -c "grep -q 'disable --now shairport-sync.service' '$LOG' && grep -q 'enable -q --now opensky-airplay.service opensky-spotify.service' '$LOG'"
check "7 the Music page added before the Timer (old settings kept as .bak)" bash -c "node -e 'const s=require(\"$T/config/opensky.json\"); process.exit(JSON.stringify(s.pages)===JSON.stringify([\"home\",\"calendar\",\"music\",\"timer\"])?0:1)' && [ -f '$T/config/opensky.json.bak' ]"
tmp_after=$(find /tmp -maxdepth 1 -name 'tmp.*' -user "$(id -u)" 2>/dev/null | wc -l)
ok "8 no download folders left behind in /tmp" "$([ "$tmp_after" -le "$tmp_before" ]; echo $?)" "$tmp_before → $tmp_after"

# ---- again: nothing downloaded twice, the page not added twice ----
: > "$LOG"; out="$(run install)"
ok "9 running it again: no new download, no second Music page" "$([ "$(grep -c '^curl ' "$LOG")" = 0 ] && [ "$(grep -o '"music"' "$T/config/opensky.json" | wc -l)" = 1 ]; echo $?)"

# ---- units only (what install.sh does on updates) ----
rm -f "$U/opensky-airplay.service"; run units >/dev/null
check "10 'units' rewrites the services" test -f "$U/opensky-airplay.service"

check "10b services skip starting when switched off (ExecCondition)" bash -c "grep -q 'ExecCondition=.*render.js enabled airplay' '$U/opensky-airplay.service' && grep -q 'ExecCondition=.*render.js enabled spotify' '$U/opensky-spotify.service'"

# ---- apply (opensky restart, phone setup's Finish): only what changed ----
render() { OPENSKY_SETTINGS="$T/config/opensky.json" node "$REPO/services/music/render.js" "$@"; }
render airplay "$T/runtime/music" >/dev/null; render spotify "$T/runtime/music" >/dev/null   # (what the running speakers use)
: > "$LOG"; run apply >/dev/null
ok "13 apply with nothing changed: no restart, so music keeps playing" "$(grep -qE 'restart|stop' "$LOG"; [ $? = 1 ]; echo $?)" "$(tr '\n' ';' < "$LOG")"
node -e 'const fs=require("fs"),f=process.argv[1],s=JSON.parse(fs.readFileSync(f,"utf8")); s.music={airplay:false,name:"Kitchen"}; fs.writeFileSync(f,JSON.stringify(s))' "$T/config/opensky.json"
: > "$LOG"; run apply >/dev/null
ok "14 apply after AirPlay off + a new name: AirPlay stopped, Spotify restarted (new name), nothing else" "$(grep -q 'stop opensky-airplay.service' "$LOG" && grep -q 'restart opensky-spotify.service' "$LOG" && ! grep -q 'restart opensky-airplay' "$LOG"; echo $?)" "$(tr '\n' ';' < "$LOG")"

# ---- remove ----
run remove > "$T/remove.out"
check "11 remove: services and go-librespot gone, says how to remove shairport-sync" bash -c "[ ! -e '$U/opensky-airplay.service' ] && [ ! -e '$U/opensky-spotify.service' ] && [ ! -e '$T/runtime/music' ] && grep -q 'apt remove shairport-sync' '$T/remove.out'"

# ---- guard: function names that are real commands ----
bad=""
for f in "$REPO/install.sh" "$REPO/tools/opensky" "$REPO/tools/addons/"*.sh "$REPO/tools/opensky-start"; do
  for fn in $(grep -oE '^[A-Za-z_][A-Za-z0-9_]*\(\)' "$f" | tr -d '()'); do
    # a program file of that name (type -P: files only, not this test's own functions), or a shell builtin
    if PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin type -P "$fn" >/dev/null 2>&1 || [ "$(bash -c "type -t $fn" 2>/dev/null)" = builtin ]; then bad="$bad $(basename "$f"):$fn"; fi
  done
done
ok "12 no shell function in OpenSky's scripts is named like a command on the system" "$([ -z "$bad" ]; echo $?)" "$bad"

echo "SUMMARY pass=$pass fail=$fail"
