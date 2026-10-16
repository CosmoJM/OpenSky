// Unit test for lib/google-calendar.js against a fake Google (OAuth token endpoint + Calendar API v3).
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), crypto = require("crypto");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-google-"));
const SECRETS = path.join(tmp, "secrets.json");
process.env.OPENSKY_SECRETS = SECRETS;
let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const CLIENT = "123-abc.apps.googleusercontent.com";

// ---- fake Google ----
const day = (dd, h, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + dd, h, m); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const store = { primary: [
  { id: "e1", summary: "Dentist", start: { dateTime: day(1, 15).toISOString() }, end: { dateTime: day(1, 16).toISOString() } },
  { id: "e2", summary: "Camping", start: { date: ymd(day(3, 0)) }, end: { date: ymd(day(5, 0)) } },
  { id: "e3_1", summary: "Piano", recurringEventId: "e3", start: { dateTime: day(2, 17).toISOString() }, end: { dateTime: day(2, 18).toISOString() } },
  { id: "e4", summary: "Gone", status: "cancelled", start: { dateTime: day(1, 9).toISOString() } }
] };
let lastChallenge = null, tokenCalls = 0, expireNext = false, nextId = 10;
const server = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const u = new URL(req.url, "http://x"), send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
    if (u.pathname === "/token") {
      tokenCalls++;
      const f = new URLSearchParams(raw);
      if (f.get("client_id") !== CLIENT || f.get("client_secret") !== "s3cret") return send(401, { error: "invalid_client" });
      if (f.get("grant_type") === "authorization_code") {
        const challenge = crypto.createHash("sha256").update(f.get("code_verifier") || "").digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (f.get("code") !== "good-code" || challenge !== lastChallenge || f.get("redirect_uri") !== "http://127.0.0.1:53682/") return send(400, { error: "invalid_grant" });
        return send(200, { access_token: "at-1", expires_in: 3600, refresh_token: "rt-1" });
      }
      if (f.get("refresh_token") !== "rt-1") return send(400, { error: "invalid_grant" });
      return send(200, { access_token: expireNext ? "stale" : "at-2", expires_in: 3600 });
    }
    if (!/^Bearer at-[12]$/.test(req.headers.authorization || "")) return send(401, { error: { message: "bad token" } });
    if (u.pathname === "/cal/users/me/calendarList") return send(200, { items: [{ id: "primary-id", summary: "me@example.com", primary: true, accessRole: "owner" }, { id: "school@group.calendar.google.com", summary: "School", summaryOverride: "Kids' school", accessRole: "reader" }] });
    const m = u.pathname.match(/^\/cal\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!m) return send(404, {});
    const list = store[decodeURIComponent(m[1])];
    if (!list) return send(404, { error: { message: "not found" } });
    if (req.method === "GET") {
      const from = Date.parse(u.searchParams.get("timeMin")), to = Date.parse(u.searchParams.get("timeMax"));
      const at = (e) => Date.parse(e.start.dateTime || `${e.start.date}T00:00:00`);
      return send(200, { items: list.filter((e) => at(e) >= from && at(e) < to) });
    }
    if (req.method === "POST") { const b = JSON.parse(raw); list.push({ id: `e${nextId++}`, ...b }); return send(200, list[list.length - 1]); }
    const i = list.findIndex((e) => e.id === decodeURIComponent(m[2] || ""));
    if (i < 0) return send(404, { error: { message: "gone" } });
    if (req.method === "PATCH") { Object.assign(list[i], JSON.parse(raw)); return send(200, list[i]); }
    if (req.method === "DELETE") { list.splice(i, 1); return send(204); }
    send(405, {});
  });
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.OPENSKY_GOOGLE_AUTH_URL = `${base}/auth`; process.env.OPENSKY_GOOGLE_TOKEN_URL = `${base}/token`; process.env.OPENSKY_GOOGLE_API_URL = `${base}/cal`;
  const g = require(path.join(__dirname, "..", "lib", "google-calendar.js"));

  // sign-in
  ok("1 a wrong Client ID is spotted before going to Google", /apps\.googleusercontent\.com/.test(await fails(() => g.authUrl("abc"))));
  const pending = g.authUrl(CLIENT);
  const q = new URL(pending.url).searchParams;
  lastChallenge = q.get("code_challenge");
  ok("2 sign-in address: offline access, PKCE, only the two calendar scopes, loopback redirect",
    q.get("access_type") === "offline" && q.get("code_challenge_method") === "S256" && q.get("redirect_uri") === "http://127.0.0.1:53682/" &&
    q.get("scope") === "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events", q.get("scope"));
  ok("3 the pasted address of a cancelled sign-in is explained", /cancelled/.test(await fails(() => g.finishSignIn("http://127.0.0.1:53682/?error=access_denied", pending, CLIENT, "s3cret"))));
  ok("4 an address from an older sign-in is refused", /older sign-in/.test(await fails(() => g.finishSignIn(`http://127.0.0.1:53682/?code=good-code&state=other`, pending, CLIENT, "s3cret"))));
  ok("5 a wrong secret is explained", /Client ID \/ secret/.test(await fails(() => g.finishSignIn(`http://127.0.0.1:53682/?code=good-code&state=${pending.state}`, pending, CLIENT, "nope"))));
  const done = await g.finishSignIn(`http://127.0.0.1:53682/?code=good-code&scope=x&state=${pending.state}`, pending, CLIENT, "s3cret");
  ok("6 the pasted address → a lasting sign-in (refresh token)", done.refreshToken === "rt-1");

  // using it
  ok("7 not signed in → says where to do it", /phone setup/.test(await fails(() => g.listCalendars())));
  fs.writeFileSync(SECRETS, JSON.stringify({ google: { clientId: CLIENT, clientSecret: "s3cret", refreshToken: "rt-1" } }));
  const cals = await g.listCalendars();
  ok("8 calendar list: names (own names first), which can be edited", cals.length === 2 && cals[0].primary && cals[0].canEdit && cals[1].name === "Kids' school" && !cals[1].canEdit, cals);
  let ev = await g.mmEvents("primary", Date.now() - 86400e3, Date.now() + 30 * 86400e3);
  const camp = ev.find((e) => e.title === "Camping");
  ok("9 events: timed + all-day (local midnights), repeating marked, cancelled left out",
    ev.length === 3 && camp && camp.fullDayEvent && new Date(Number(camp.startDate)).getHours() === 0 && (Number(camp.endDate) - Number(camp.startDate)) / 86400e3 > 1.9 && ev.find((e) => e.title === "Piano").recurringEvent, ev.map((e) => e.title));

  await g.create("primary", { title: "Swim", startDate: day(4, 10).toISOString(), endDate: day(4, 11).toISOString() });
  await g.create("primary", { title: "Trip", allDay: true, startDate: ymd(day(6, 0)), endDate: ymd(day(7, 0)) });
  const trip = store.primary.find((e) => e.summary === "Trip");
  ok("10 add timed + all-day (Google's exclusive end date)", store.primary.some((e) => e.summary === "Swim" && e.start.dateTime) && trip.start.date === ymd(day(6, 0)) && trip.end.date === ymd(day(8, 0)), trip);
  await g.update("primary", { originalTitle: "Dentist", originalStart: day(1, 15).toISOString() }, { title: "Dentist (moved)", startDate: day(2, 9).toISOString(), endDate: day(2, 10).toISOString() });
  ok("11 edit by title + start (what the screen knows)", store.primary.some((e) => e.id === "e1" && e.summary === "Dentist (moved)"));
  ok("12 repeating events are left to Google Calendar", /only be changed in Google Calendar/.test(await fails(() => g.update("primary", { originalTitle: "Piano", originalStart: day(2, 17).toISOString() }, { title: "x", startDate: day(2, 17).toISOString(), endDate: day(2, 18).toISOString() }))));
  await g.remove("primary", { originalTitle: "Camping", originalStart: String(day(3, 0).getTime()) });
  ok("13 delete an all-day event", !store.primary.some((e) => e.summary === "Camping"));
  ok("14 validation + a missing event", /title/.test(await fails(() => g.create("primary", { title: " ", startDate: day(1, 1).toISOString(), endDate: day(1, 2).toISOString() }))) &&
    /not found/.test(await fails(() => g.remove("primary", { originalTitle: "Nope", originalStart: day(1, 1).toISOString() }))));
  const before = tokenCalls;
  await g.listCalendars(); await g.listCalendars();
  ok("15 the access token is reused (no new sign-in per request)", tokenCalls === before);
  fs.writeFileSync(SECRETS, JSON.stringify({ google: { clientId: CLIENT, clientSecret: "s3cret", refreshToken: "expired" } }));
  fs.utimesSync(SECRETS, new Date(), new Date(Date.now() + 10000));
  ok("16 an expired sign-in says to sign in again (and how to make it last)", /expired.*In production/.test(await fails(() => g.listCalendars())));

  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
})().catch((e) => { console.log(`SUMMARY pass=${passed} fail=${failed + 1} (crashed: ${e.stack})`); process.exit(1); });
