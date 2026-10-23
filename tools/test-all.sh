#!/bin/bash
# Run every OpenSky test: unit tests, then each screen scenario on the off-screen compositor.
# Usage: tools/test-all.sh            (needs the setup in docs/development/testing.md)
cd "$(dirname "$0")/.." || exit 1
fail=0
# a failing unit test also shows which checks failed (indented under it)
report() { local all="$1" out; out=$(tail -1 <<<"$all"); echo "$out"; [[ "$out" == *"fail=0"* ]] || { fail=1; grep -E "^FAIL" <<<"$all" | cut -c1-300 | sed 's/^/    /'; }; }
for t in tools/test-*.js; do printf '%-28s ' "$(basename "$t")"; report "$(node "$t" 2>&1)"; done
for t in tools/test-*.sh; do [ "$(basename "$t")" = test-all.sh ] && continue; printf '%-28s ' "$(basename "$t")"; report "$(timeout 180 bash "$t" 2>&1)"; done
PY="${OPENSKY_PYTHON:-$HOME/opensky-dev/venv/bin/python}"
for t in tools/test-*.py; do
  printf '%-28s ' "$(basename "$t")"
  if [ -x "$PY" ]; then out=$(timeout 180 "$PY" "$t" 2>&1 | tail -1); echo "$out"; [[ "$out" == *"fail=0"* ]] || fail=1
  else echo "skipped (no Python venv — see docs/development/testing.md)"; fi
done
started=0; tools/headless.sh start | grep -q "already" || started=1
for sc in tools/scenarios/*.js; do printf '%-28s ' "$(basename "$sc")"; out=$(timeout 300 node tools/harness.js "$sc" 2>&1 | grep -E "^(SUMMARY|SCENARIO)" | tail -1); echo "${out:-no result}"; [[ "$out" == *"ALL CHECKS PASSED"* ]] || fail=1; done
[ $started = 1 ] && tools/headless.sh stop >/dev/null
[ $fail = 0 ] && echo "ALL TESTS PASSED" || { echo "SOME TESTS FAILED"; exit 1; }
