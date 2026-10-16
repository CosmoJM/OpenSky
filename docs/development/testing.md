# Testing OpenSky without a screen

OpenSky is tested by launching the **real** MagicMirror/Electron app on an off-screen (headless) Wayland
compositor and driving it with Playwright. Nothing appears on a physical display, so you can test on the same Pi
that runs a family's screen.

## One-time setup (development machine = a Raspberry Pi with Raspberry Pi OS)
1. Node.js 24 (MagicMirror 2.38 needs ≥ 22.22.2): `nvm install 24` (keep your existing default if another
   MagicMirror depends on it: `nvm alias default <old version>`).
2. MagicMirror for development, separate from any real install:
   `git clone --depth 1 --branch v2.38.0 https://github.com/MagicMirrorOrg/MagicMirror.git ~/opensky-dev/MagicMirror`
   then `cd ~/opensky-dev/MagicMirror && npm run install-mm` and, if `node_modules/electron/dist` is missing,
   `node node_modules/electron/install.js`.
3. Link this repo into it: `tools/dev-setup.sh` (re-run after adding a module).
4. Test tools: `cd tools && npm install` (Playwright core only — no browsers are downloaded).

## Running tests
```
tools/headless.sh start                       # off-screen compositor (WAYLAND_DISPLAY=wayland-1)
node tools/harness.js tools/scenarios/smoke-timer.js
tools/headless.sh stop
```
- The app runs on port **8083** (`OPENSKY_PORT`) so it never clashes with a MagicMirror on 8080/8081.
- Screenshots land in `tools/out/` (not committed).
- Scenarios export `async (page, h, app) => {}`; helpers: `h.tap(selector)`, `h.box`, `h.shot(name)`, `h.sleep`, `h.log`.

## Gotchas learned on the reference build
- Check what is really visible (computed style + `getBoundingClientRect` + `elementFromPoint`), not just classes or
  attributes. MMM-pages hides a page by fading its modules to opacity 0, not with `display: none`.
- Playwright's page screenshot renders `<webview>` content wrongly; for embedded pages use
  `grim -o HEADLESS-1 file.png` (with `WAYLAND_DISPLAY=wayland-1`) to see the true picture.
- Use `page.mouse.click` (or `h.tap`) for taps; Playwright's `page.click` actionability checks can time out on
  MagicMirror's layered regions.
