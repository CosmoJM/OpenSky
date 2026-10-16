# Contributing to OpenSky

Thanks for helping! OpenSky is a family wall calendar built on [MagicMirror²](https://magicmirror.builders/), and it
aims to be **friendly out of the box**: anything a family needs should work without editing code.

## Reporting a problem
Open an issue with the **Bug report** template. The most useful things to include:
- what you expected and what happened
- your Pi model and screen
- the output of `opensky logs`, with anything private (names, calendar titles, addresses) removed first

## Ideas and new providers
New calendar, list, photo or weather providers are very welcome. The plan and the list of wanted providers are in
[PLAN.md](PLAN.md) (the "options matrix"). Please open an issue first, so we can agree on the settings it needs.

## Making a change
1. Read [AGENTS.md](AGENTS.md): the house rules (secrets, testing, names) are short.
2. Set up the off-screen test environment: [docs/development/testing.md](docs/development/testing.md).
3. Make your change. Then:
   - **Settings, not code:** anything a family would change belongs in `opensky.json` and, if useful, on the phone page and in Settings.
   - **Secrets** (tokens, passwords, private links) only go in `secrets.json`, read by node helpers, and never reach the page or the log.
   - **Docs:** `docs/configure.md` explains every setting, `docs/troubleshooting.md` the errors people will meet.
   - **Tests:** a unit test against a fake server for a new provider, plus an on-screen scenario (`tools/scenarios/`).
4. `tools/test-all.sh` must say **ALL TESTS PASSED**.
5. Open a pull request describing what changes for families.

## Style
- Plain JavaScript (no build step), small focused modules, comments that explain *why*.
- Friendly, plain-English messages that say what to do ("check the app-specific password in secrets.json").
- Touch-sized controls (at least 44 px) and no emoji in the UI (Raspberry Pi OS has no colour-emoji font).

## Licence
OpenSky is MIT licensed. Contributions are accepted under the same licence. Community modules it uses keep their own
licences (see `patches/`, `tools/community-modules.txt`, `lib/client/vendor/`,
`modules/MMM-OpenSky-WordGame/words/SCOWL-COPYRIGHT.txt`).
