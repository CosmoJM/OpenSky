# AGENTS.md — guide for AI coding assistants working on OpenSky

You are helping someone run, fix or extend **OpenSky**, a family wall calendar / home dashboard built on
MagicMirror². This file is the entry point; read it first, then the docs it points to.

> Status: early development. This file grows with the project — keep it current when you change things.

## Read in this order
1. `PLAN.md` — goals, principles, the options matrix (which providers exist or are planned) and the roadmap.
2. `docs/` — user documentation (install, configure, troubleshoot). *(being written)*
3. `docs/development/architecture.md` — how OpenSky is put together (distribution on upstream MagicMirror²,
   settings vs secrets, module names, services, lessons learned). Testing guide: `docs/development/testing.md`.

## Ground rules for agents
- **Never put secrets in `config.js`.** MagicMirror serves it to the whole network. Keys, tokens and PINs go in the
  server-only secrets file (documented in `docs/`), read by node helpers.
- **Don't break the screen.** Test changes off-screen (headless compositor + Playwright, see
  `docs/development/testing.md`) before restarting the real display.
- **Prefer configuration over code edits** for a user's personal setup; if you add a provider, follow the provider
  pattern so it shows up in settings for everyone.
- **Keep docs in step with code** — a feature isn't done until `docs/` and this file say how to use it.
