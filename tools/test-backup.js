// Unit test for lib/backup.js: backup contents, restore, the places list (USB / network / home), nightly schedule,
// keeping the newest N, and friendly errors.
const fs = require("fs"), os = require("os"), path = require("path");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-bk-"));
const P = (...a) => path.join(T, ...a);
fs.mkdirSync(P("cfg")); fs.mkdirSync(P("home")); fs.mkdirSync(P("nas")); fs.mkdirSync(P("gvfs", "smb-share:server=nas.local,share=family"), { recursive: true });
Object.assign(process.env, { OPENSKY_SETTINGS: P("cfg", "opensky.json"), OPENSKY_SECRETS: P("cfg", "secrets.json"), OPENSKY_LOCAL_LISTS: P("cfg", "lists.json"),
  OPENSKY_LOCAL_CALENDAR: P("cfg", "local-calendar.json"), OPENSKY_WORDGAME: P("cfg", "wordgame.json"), OPENSKY_DEVICE_SETTINGS: P("cfg", "device.json"),
  OPENSKY_BACKUP_STATUS: P("cfg", "backup-status.json"), OPENSKY_BACKUP_HOME: P("home"), OPENSKY_GVFS: P("gvfs"), OPENSKY_MOUNTS: P("mounts") });
fs.writeFileSync(P("mounts"), [`//nas/family ${P("nas").replace(/ /g, "\\040")} cifs rw 0 0`, "/dev/mmcblk0p2 / ext4 rw 0 0", "/dev/sda1 /media/pi/GONE vfat rw 0 0"].join("\n"));
fs.writeFileSync(P("cfg", "opensky.json"), JSON.stringify({ family: { name: "The Testers" }, backup: { destination: P("nas"), keep: 2 } }));
fs.writeFileSync(P("cfg", "secrets.json"), JSON.stringify({ lists: { todoist: { token: "secret-token" } } }));
fs.writeFileSync(P("cfg", "lists.json"), JSON.stringify({ version: 1, lists: { Groceries: [{ id: "1", text: "Milk" }] } }));
let passed = 0, failed = 0;
const ok = (n, c, i) => { c ? passed++ : failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i !== undefined ? "  — " + JSON.stringify(i) : ""}`); };
const b = require(path.join(__dirname, "..", "lib", "backup.js"));

const plain = b.make(false), full = b.make(true);
ok("1 a backup: settings + on-device data; passwords only when asked", plain.settings.family.name === "The Testers" && plain.data.lists && !plain.secrets && full.secrets.lists.todoist.token === "secret-token");
const places = b.destinations();
ok("2 places: the network folder, a network place from the file manager, and the home folder (missing USB left out)",
  places.some((p) => p.kind === "network" && p.path === P("nas")) && places.some((p) => /family on nas\.local/.test(p.label)) && places.some((p) => p.kind === "folder") && !places.some((p) => /GONE/.test(p.path)), places.map((p) => p.label));
const st = b.run();
const files = () => fs.readdirSync(P("nas", "OpenSky-backups"));
ok("3 back up now → OpenSky-backups/opensky-backup-<date>.json, status saved", st.ok && files().length === 1 && b.status().ok, st);
ok("4 not due again today; due when the time has passed and the last one is older", !b.due() && b.due(new Date(Date.now() + 26 * 3600e3)));
["2026-01-01", "2026-01-02", "2026-01-03"].forEach((d) => fs.writeFileSync(P("nas", "OpenSky-backups", `opensky-backup-${d}.json`), "{}"));
b.run();
ok("5 keeps only the newest N (2)", files().length === 2 && !files().includes("opensky-backup-2026-01-01.json"), files());
fs.writeFileSync(P("cfg", "opensky.json"), JSON.stringify({ backup: { destination: "/media/pi/GONE" } }));
const bad = b.run();
ok("6 USB stick unplugged → a clear message, and retried within the hour", !bad.ok && /isn't plugged in/.test(bad.error) && !b.due() && b.due(new Date(Date.now() + 61 * 60e3)), bad.error);
fs.writeFileSync(P("cfg", "opensky.json"), JSON.stringify({}));
ok("7 no place chosen → nothing scheduled", !b.due() && /No backup place/.test(b.run().error));
const restored = b.restore({ ...full, settings: { family: { name: "Restored" } } });
ok("8 restore: settings, data and passwords back (old copies kept)", JSON.parse(fs.readFileSync(P("cfg", "opensky.json"))).family.name === "Restored" && restored.includes("secrets") && fs.existsSync(P("cfg", "secrets.json.bak")) && (fs.statSync(P("cfg", "secrets.json")).mode & 0o777) === 0o600);
let err = null; try { b.restore({ hello: 1 }); } catch (e) { err = e; }
ok("9 a file that isn't a backup is refused", err && err.status === 400);
fs.rmSync(T, { recursive: true, force: true });
console.log(`SUMMARY pass=${passed} fail=${failed}`);
