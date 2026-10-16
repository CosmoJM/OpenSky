// Unit test for lib/lists.js: the on-device provider, and the Todoist provider against a fake Todoist API (no account needed).
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opensky-lists-"));
const SECRETS = path.join(tmp, "secrets.json");
process.env.OPENSKY_LOCAL_LISTS = path.join(tmp, "lists.json");
process.env.OPENSKY_SECRETS = SECRETS;

let passed = 0, failed = 0;
const ok = (name, cond, info) => { cond ? passed++ : failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  — " + JSON.stringify(info) : ""}`); };
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// fake Todoist API v1: two pages of projects, tasks with paging, close/update/delete, Bearer check
const tasks = [
  { id: "t1", content: "Milk", project_id: "p2", child_order: 2 },
  { id: "t2", content: "Eggs", project_id: "p2", child_order: 1 },
  { id: "t3", content: "Mow the lawn", project_id: "p1", child_order: 1 }
];
let nextId = 10; const calls = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    calls.push(`${req.method} ${url.pathname}`);
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
    if (req.headers.authorization !== "Bearer good-token") return send(401, { error: "unauthorized" });
    if (req.method === "GET" && url.pathname === "/api/v1/projects") {
      return url.searchParams.get("cursor") ? send(200, { results: [{ id: "p2", name: "Groceries" }], next_cursor: null })
        : send(200, { results: [{ id: "p1", name: "Chores" }], next_cursor: "page2" });
    }
    if (req.method === "GET" && url.pathname === "/api/v1/tasks") {
      const mine = tasks.filter((t) => t.project_id === url.searchParams.get("project_id"));
      return url.searchParams.get("cursor") ? send(200, { results: mine.slice(1), next_cursor: null }) : send(200, { results: mine.slice(0, 1), next_cursor: mine.length > 1 ? "more" : null });
    }
    if (req.method === "POST" && url.pathname === "/api/v1/tasks") {
      const b = JSON.parse(body); tasks.push({ id: `t${nextId++}`, content: b.content, project_id: b.project_id, child_order: 9 }); return send(200, tasks[tasks.length - 1]);
    }
    let m = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)(\/close)?$/);
    const i = m ? tasks.findIndex((t) => t.id === m[1]) : -1;
    if (m && i < 0) return send(404, { error: "not found" });
    if (m && req.method === "POST" && m[2]) { tasks.splice(i, 1); return send(204); }
    if (m && req.method === "POST") { tasks[i].content = JSON.parse(body).content; return send(200, tasks[i]); }
    if (m && req.method === "DELETE") { tasks.splice(i, 1); return send(204); }
    send(404, {});
  });
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENSKY_TODOIST_API = `http://127.0.0.1:${server.address().port}/api/v1`;
  const lists = require(path.join(__dirname, "..", "lib", "lists.js"));

  // ---- on-device ----
  const g = { name: "Groceries" }, local = lists.provider(g);
  ok("1 default provider is on-device; an unknown one is refused", lists.provider({ name: "x", provider: "local" }) === local && /Unknown/.test(await fails(() => lists.provider({ name: "x", provider: "nope" }))));
  ok("2 a new list starts empty (no file yet)", (await local.items(g)).length === 0);
  await local.add(g, "  Milk  "); await local.add(g, "Bread");
  let items = await local.items(g);
  ok("3 add keeps order and tidies spaces", items.map((x) => x.text).join() === "Milk,Bread", items);
  ok("4 empty text is refused kindly", /type something/i.test(await fails(() => local.add(g, "   "))));
  await local.edit(g, items[1], "Rye bread");
  await local.check(g, items[0]);
  items = await local.items(g);
  ok("5 edit + check off", items.map((x) => x.text).join() === "Rye bread", items);
  ok("6 an item that's gone → clear message", /gone/.test(await fails(() => local.check(g, { id: "nope" }))));
  await local.remove(g, items[0]);
  ok("7 delete; other lists untouched", (await local.items(g)).length === 0 && (await local.items({ name: "Other" })).length === 0);
  fs.writeFileSync(process.env.OPENSKY_LOCAL_LISTS, "{ broken");
  items = await local.items(g);
  ok("8 damaged file → empty lists + a copy kept (no crash)", items.length === 0 && fs.readdirSync(tmp).some((f) => f.includes(".damaged-")));

  // ---- Todoist ----
  const shop = { name: "Shopping", provider: "todoist", project: "groceries" }, todo = lists.provider(shop);
  ok("9 no token → says where to put it", /secrets\.json/.test(await fails(() => todo.items(shop))));
  fs.writeFileSync(SECRETS, JSON.stringify({ lists: { todoist: { token: "bad-token" } } }));
  ok("10 refused token → says what to check", /refused the API token/.test(await fails(() => todo.items(shop))));
  fs.writeFileSync(SECRETS, JSON.stringify({ lists: { todoist: { token: "good-token" } } }));
  fs.utimesSync(SECRETS, new Date(), new Date(Date.now() + 5000));   // make sure the change is seen
  items = await todo.items(shop);
  ok("11 project by name (any case, across pages) + all task pages, in Todoist's order", items.map((x) => x.text).join() === "Eggs,Milk", items);
  ok("12 an unknown project → names it", /No Todoist project called "Pets"/.test(await fails(() => todo.items({ name: "Pets", provider: "todoist" }))));
  await todo.add(shop, "Butter");
  await todo.edit(shop, items[0], "Brown eggs");
  await todo.check(shop, items[1]);
  items = await todo.items(shop);
  ok("13 add / edit / check off reach Todoist", items.map((x) => x.text).join() === "Brown eggs,Butter", items);
  await todo.remove(shop, items[1]);
  ok("14 delete; projectId works without a lookup", (await todo.items({ name: "x", provider: "todoist", projectId: "p2" })).map((x) => x.text).join() === "Brown eggs");
  ok("15 an item deleted in Todoist → clear message", /Not found in Todoist/.test(await fails(() => todo.check(shop, { id: "gone" }))));
  server.close();
  ok("16 Todoist unreachable → friendly message", /Can't reach Todoist/.test(await fails(() => todo.items(shop))));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`SUMMARY pass=${passed} fail=${failed}`);
})().catch((e) => { console.log(`SUMMARY pass=${passed} fail=${failed + 1} (crashed: ${e.message})`); process.exit(1); });
