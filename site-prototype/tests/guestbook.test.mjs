import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { handleGuestbook, LIMITS } from "../src/guestbook.js";
import { adminQuery } from "../scripts/guestbook_admin.mjs";
import { NOTIFY_TIMEOUT_MS } from "../src/guestbook_notification.js";

const require = createRequire(realpathSync(fileURLToPath(new URL("../node_modules/wrangler/package.json", import.meta.url))));
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
let mf, db, env;
const base = "https://test.invalid";
const now = Date.parse("2026-10-21T08:00:00.000Z");
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('test')}}", compatibilityDate: "2026-10-21", d1Databases: ["DB"] }));
  db = await mf.getD1Database("DB");
  for (const migration of ["0001_environment_check.sql", "0002_page_requests.sql", "0003_guestbook.sql"]) {
    const sql = (await readFile(new URL("../migrations/" + migration, import.meta.url), "utf8")).replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean);
    for (const statement of sql) await db.prepare(statement).run();
  }
  env = { DB: db, ENABLE_GUESTBOOK: "true", ASSETS: { async fetch(request) {
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("if-none-match"), null);
    return new Response(await readFile(new URL("../public" + new URL(request.url).pathname, import.meta.url), "utf8"));
  } } };
});
after(async () => { if (mf) await mf.dispose(); });
beforeEach(async () => { await db.prepare("DELETE FROM guestbook_posts").run(); await db.prepare("UPDATE guestbook_gate SET next_allowed_at = 0").run(); });
const get = (path = "/guestbook.html", headers) => new Request(base + path, { headers });
async function form() {
  const response = await handleGuestbook(get(), env, now);
  assert.equal(response.status, 200);
  const html = await response.text();
  return { cookie: response.headers.get("set-cookie").split(";")[0], csrf: html.match(/name="csrf" value="([a-f0-9]+)"/)[1], html };
}
function post(session, fields = {}, extraHeaders = {}, body) {
  return new Request(base + "/guestbook.html", { method: "POST", headers: {
    Cookie: session.cookie, Origin: base, "Content-Type": "application/x-www-form-urlencoded", ...extraHeaders,
  }, body: body ?? new URLSearchParams({ name: "", message: "A short note.", csrf: session.csrf, ...fields }).toString() });
}
async function administer(action, id) {
  const q = adminQuery(action, { id });
  return db.prepare(q.sql).bind(...q.params).all();
}
test("actual D1 + HTML: no-JS pending -> approve -> primary read -> delete, anonymous and safe text", async () => {
  const session = await form();
  assert.match(session.html, /No approved messages yet/);
  assert.match(session.html, /method="post"/); assert.doesNotMatch(session.html, /<script|<!--GUESTBOOK_LIST-->/);
  const text = '<script>alert("x")</script>\n{{NAME_LIMIT}} $& **markdown** https://example.com\n\'; DROP TABLE guestbook_posts; --';
  const response = await handleGuestbook(post(session, { message: text }), env, now);
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/guestbook-complete.html");
  const row = await db.prepare("SELECT * FROM guestbook_posts").first();
  assert.equal(row.status, "pending"); assert.equal(row.name, ""); assert.equal(row.message, text);
  assert.deepEqual(Object.keys(row).sort(), ["id", "created_at", "name", "message", "status"].sort());
  assert.doesNotMatch(await (await handleGuestbook(get(), env, now)).text(), /DROP TABLE|alert/);
  assert.equal((await administer("approve", row.id)).results.length, 1);
  assert.equal((await administer("approve", row.id)).results.length, 0);
  const listed = await handleGuestbook(get(undefined, { "If-None-Match": '"old"' }), env, now);
  const html = await listed.text();
  assert.equal(listed.headers.get("cache-control"), "no-store");
  assert.match(html, /Anonymous/); assert.match(html, /UTC/); assert.match(html, /&lt;script&gt;alert/);
  assert.doesNotMatch(html, /<script|<a href="https:\/\/example.com/); assert.match(html, /\*\*markdown\*\*/);
  assert.match(html, /\{\{NAME_LIMIT\}\} \$&amp;/);
  assert.equal((await administer("delete", row.id)).results.length, 1);
  assert.equal((await administer("delete", row.id)).results.length, 0);
  assert.match(await (await handleGuestbook(get(), env, now)).text(), /No approved messages yet/);
});
test("actual D1: bounds, optional name, newlines, unicode, malformed and oversized forms", async () => {
  const session = await form();
  for (const fields of [{ message: " \n\t " }, { name: "a".repeat(81) }, { message: "a".repeat(501) }, { name: "bad\nname" }, { message: "bad\u0000text" }, { message: "bad\u0085text" }, { status: "approved" }]) {
    assert.equal((await handleGuestbook(post(session, fields), env, now)).status, 400);
  }
  for (const body of ["message=%ZZ&csrf=" + session.csrf, "message=%FF&csrf=" + session.csrf, "message=a&message=b&csrf=" + session.csrf]) {
    assert.equal((await handleGuestbook(post(session, {}, {}, body), env, now)).status, 400);
  }
  assert.equal((await handleGuestbook(post(session, {}, {}, "x".repeat(LIMITS.bodyBytes + 1)), env, now)).status, 413);
  assert.equal((await handleGuestbook(post(session, {}, { "Content-Length": "9000" }), env, now)).status, 413);
  assert.equal((await handleGuestbook(post(session, {}, { "Content-Type": "application/json" }), env, now)).status, 415);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM guestbook_posts").first()).n, 0);
  assert.equal((await handleGuestbook(post(session, { name: "N".repeat(80), message: "界".repeat(500) }), env, now)).status, 303);
  assert.equal((await handleGuestbook(post(session, { message: "a\r\nb\rc\td" }), env, now + 15000)).status, 303);
  assert.equal((await db.prepare("SELECT message FROM guestbook_posts ORDER BY created_at DESC LIMIT 1").first()).message, "a\nb\nc\td");
});
test("actual D1: global interval serializes concurrent clients, advances only with committed save", async () => {
  const session = await form();
  const responses = await Promise.all(Array.from({ length: 12 }, () => handleGuestbook(post(session), env, now)));
  assert.equal(responses.filter(r => r.status === 303).length, 1);
  assert.equal(responses.filter(r => r.status === 429).length, 11);
  assert.equal(responses.find(r => r.status === 429).headers.get("retry-after"), "15");
  assert.equal((await handleGuestbook(post(await form()), env, now + 14999)).status, 429);
  assert.equal((await handleGuestbook(post(await form()), env, now + 15000)).status, 303);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM guestbook_posts").first()).n, 2);
});
test("CSRF: missing/tampered cookies and tokens, cross-site, sibling-site and null origins fail; native form client works", async () => {
  const session = await form();
  for (const [fields, headers] of [[{}, { Cookie: "" }], [{ csrf: "wrong" }, {}], [{}, { Origin: "https://evil.invalid" }], [{}, { Origin: "null" }], [{}, { "Sec-Fetch-Site": "cross-site" }], [{}, { "Sec-Fetch-Site": "same-site" }]]) {
    assert.equal((await handleGuestbook(post(session, fields, headers), env, now)).status, 403);
  }
  const native = post(session); native.headers.delete("Origin");
  assert.equal((await handleGuestbook(native, env, now)).status, 303);
});
test("receipt: direct and forged visits are neutral; saved receipt survives GET reload, expires without another POST", async () => {
  const session = await form();
  const direct = await (await handleGuestbook(get("/guestbook-complete.html"), env, now)).text();
  assert.match(direct, /No recent submission confirmed/);
  assert.doesNotMatch(direct, /<h1>Your note has been received\.<\/h1>|<p>Thank you!<\/p>/);
  const saved = await handleGuestbook(post(session), env, now);
  const receiptCookie = saved.headers.get("set-cookie");
  assert.match(receiptCookie, /Secure; HttpOnly; SameSite=Strict; Max-Age=600/);
  for (let i = 0; i < 2; i++) {
    const response = await handleGuestbook(get("/guestbook-complete.html", { Cookie: receiptCookie.split(";")[0] }), env, now);
    const receiptHTML = await response.text();
    for (const copy of ["<h1>Your note has been received.</h1>", "<p>Thank you!</p>", "Your message may be published after review.", "Detailed observation data", "We publish detailed data on requests to this site, including counts by page and the observation period.", "View detailed observation data", "Back to the guestbook"]) {
      assert.ok(receiptHTML.includes(copy), copy);
    }
    assert.doesNotMatch(receiptHTML, /No recent submission confirmed|Saved for review|will be published/);
  }
  assert.equal((await db.prepare("SELECT count(*) AS n FROM guestbook_posts").first()).n, 1);
  assert.match(await (await handleGuestbook(get("/guestbook-complete.html", { Cookie: receiptCookie.split(";")[0] }), env, now + 600001)).text(), /No recent submission confirmed/);
  assert.match(await (await handleGuestbook(get("/guestbook-complete.html", { Cookie: "__Host-hoihoi-receipt=" + crypto.randomUUID() }), env, now)).text(), /No recent submission confirmed/);
});
test("actual D1: save failure rolls back, paused POST does not save, methods and HEAD do not save", async () => {
  const session = await form();
  await db.prepare("CREATE TRIGGER reject_gate BEFORE UPDATE ON guestbook_gate BEGIN SELECT RAISE(ABORT, 'private detail'); END").run();
  const failed = await handleGuestbook(post(session), env, now);
  assert.equal(failed.status, 503); assert.equal(failed.headers.get("location"), null); assert.equal(failed.headers.get("set-cookie"), null);
  assert.doesNotMatch(await failed.text(), /private detail|Your note has been received/);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM guestbook_posts").first()).n, 0);
  await db.prepare("DROP TRIGGER reject_gate").run();
  for (const flag of [undefined, "false", true]) assert.equal((await handleGuestbook(post(session), { ...env, ENABLE_GUESTBOOK: flag }, now)).status, 503);
  for (const method of ["PUT", "DELETE", "OPTIONS"]) assert.equal((await handleGuestbook(new Request(base + "/guestbook.html", { method }), env, now)).status, 405);
  assert.equal((await handleGuestbook(new Request(base + "/guestbook-complete.html", { method: "POST" }), env, now)).status, 405);
  const head = await handleGuestbook(new Request(base + "/guestbook.html", { method: "HEAD" }), env, now);
  assert.equal(await head.text(), ""); assert.equal((await db.prepare("SELECT count(*) AS n FROM guestbook_posts").first()).n, 0);
});
test("actual D1: newest-first cap and pending privacy, parameterized administrator operations", async () => {
  for (let n = 0; n < LIMITS.list + 3; n++) await db.prepare("INSERT INTO guestbook_posts VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), new Date(now + n * 1000).toISOString(), `Name ${n}`, `note-${n}`, "approved").run();
  await db.prepare("INSERT INTO guestbook_posts VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), new Date(now + 999999).toISOString(), "PENDING-NAME", "PENDING-PRIVATE", "pending").run();
  const html = await (await handleGuestbook(get(), env, now)).text();
  assert.equal((html.match(/<li><article>/g) ?? []).length, LIMITS.list);
  assert(html.indexOf("note-52") < html.indexOf("note-51"));
  assert.doesNotMatch(html, /note-0<|PENDING-NAME|PENDING-PRIVATE/);
  const q = adminQuery("pending");
  const rows = await db.prepare(q.sql).bind(...q.params).all();
  assert.equal(rows.results.length, 1); assert.equal(rows.results[0].message, "PENDING-PRIVATE");
  for (const id of ["1 OR 1=1", "'; DELETE FROM guestbook_posts;--", "", undefined]) assert.throws(() => adminQuery("delete", { id }));
  assert.throws(() => adminQuery("pending", { limit: "101" }));
  const absent = await administer("approve", crypto.randomUUID()); assert.equal(absent.results.length, 0);
});
test("actual Worker: Guestbook GET records actual success/error, POST does not enter Phase 2 observation", async () => {
  const session = await form();
  const tasks = [], ctx = { waitUntil(p) { tasks.push(p); } };
  const observedEnv = { ...env, ENABLE_OBSERVATION: "true" };
  assert.equal((await worker.fetch(get(), observedEnv, ctx)).status, 200);
  assert.equal((await worker.fetch(post(session), observedEnv, ctx)).status, 303);
  assert.equal((await worker.fetch(get(), { ...observedEnv, ASSETS: { fetch: () => new Response(null, { status: 500 }) } }, ctx)).status, 503);
  await Promise.all(tasks);
  const rows = (await db.prepare("SELECT status FROM page_requests WHERE page = 'guestbook' ORDER BY id").all()).results;
  assert.deepEqual(rows, [{ status: 200 }, { status: 503 }]);
});

const notificationEnv = () => ({ ...env, GUESTBOOK_NOTIFY_URL: "https://script.google.com/macros/s/test/exec",
  GUESTBOOK_NOTIFY_SECRET: "local-synthetic-secret-".repeat(2), GUESTBOOK_NOTIFY_ENVIRONMENT: "production" });
test("actual Worker/D1: committed values sent once via waitUntil; response and pending privacy precede mail completion", async t => {
  const session = await form(), tasks = [], calls = [];
  const ctx = { waitUntil(p) { tasks.push(p); } };
  let finish;
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const payload = JSON.parse(options.body);
    const row = await db.prepare("SELECT * FROM guestbook_posts WHERE id = ?").bind(payload.id).first();
    assert.equal(row.status, "pending");
    assert.deepEqual({ id: payload.id, created_at: payload.created_at, name: payload.name, message: payload.message },
      { id: row.id, created_at: row.created_at, name: row.name, message: row.message });
    assert.equal(payload.environment, "production");
    calls.push(payload);
    return new Promise(resolve => { finish = () => resolve(Response.json({ ok: true })); });
  });
  const response = await worker.fetch(post(session, { name: "  Saved name  ", message: " Saved\r\nsecond line " }), notificationEnv(), ctx);
  assert.equal(response.status, 303); assert.equal(tasks.length, 1);
  assert.equal(response.headers.get("location"), "/guestbook-complete.html");
  const row = await db.prepare("SELECT * FROM guestbook_posts").first();
  assert.equal(response.headers.get("set-cookie").split(";")[0], "__Host-hoihoi-receipt=" + row.id);
  assert.equal(row.message, "Saved\nsecond line"); assert.equal(row.name, "Saved name");
  assert.doesNotMatch(await (await worker.fetch(get(), notificationEnv(), ctx)).text(), /Saved name|second line/);
  // Wait for the local primary read inside the mocked request, never for email.
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1); finish(); await Promise.all(tasks);
  const receipt = get("/guestbook-complete.html", { Cookie: response.headers.get("set-cookie").split(";")[0] });
  assert.equal((await worker.fetch(receipt, notificationEnv(), ctx)).status, 200);
  await administer("approve", row.id); await administer("delete", row.id);
  assert.equal(calls.length, 1); assert.equal(tasks.length, 1);
});

test("actual Worker/D1: rejected, disabled and rolled-back saves never schedule or send", async t => {
  const session = await form(), tasks = [];
  const ctx = { waitUntil(p) { tasks.push(p); } };
  const fetchMock = t.mock.method(globalThis, "fetch", () => { throw new Error("must not send"); });
  for (const [request, changed, status] of [
    [post(session, { message: "" }), {}, 400], [post(session, { csrf: "wrong" }), {}, 403],
    [post(session), { ENABLE_GUESTBOOK: "false" }, 503],
  ]) assert.equal((await worker.fetch(request, { ...notificationEnv(), ...changed }, ctx)).status, status);
  await db.prepare("UPDATE guestbook_gate SET next_allowed_at = ?").bind(Date.now() + 60000).run();
  assert.equal((await worker.fetch(post(session), notificationEnv(), ctx)).status, 429);
  await db.prepare("UPDATE guestbook_gate SET next_allowed_at = 0").run();
  await db.prepare("CREATE TRIGGER notification_reject_gate BEFORE UPDATE ON guestbook_gate BEGIN SELECT RAISE(ABORT, 'private'); END").run();
  try { assert.equal((await worker.fetch(post(session), notificationEnv(), ctx)).status, 503); }
  finally { await db.prepare("DROP TRIGGER notification_reject_gate").run(); }
  assert.equal((await db.prepare("SELECT count(*) AS n FROM guestbook_posts").first()).n, 0);
  assert.equal(tasks.length, 0); assert.equal(fetchMock.mock.callCount(), 0);
});

test("actual Worker/D1: all notification failures and configuration skip retain saved post and receipt", async t => {
  const session = await form();
  const logs = [];
  t.mock.method(console, "log", line => logs.push(JSON.parse(line)));
  for (const [label, fetcher, changed, expected] of [
    ["network", () => { throw new Error("private"); }, {}, "failed"],
    ["HTTP", () => new Response("error", { status: 500 }), {}, "failed"],
    ["GAS rejection", () => Response.json({ ok: false, error: "unauthorized" }), {}, "failed"],
    ["HTML", () => new Response("<html>error</html>"), {}, "failed"],
    ["invalid JSON", () => new Response("{"), {}, "failed"],
    ["missing config", () => { throw new Error("must not fetch"); }, { GUESTBOOK_NOTIFY_SECRET: undefined }, "skipped"],
  ]) {
    await db.prepare("UPDATE guestbook_gate SET next_allowed_at = 0").run();
    const fetchMock = t.mock.method(globalThis, "fetch", fetcher), tasks = [];
    const response = await worker.fetch(post(session, { name: "Saved", message: label }), { ...notificationEnv(), ...changed }, { waitUntil(p) { tasks.push(p); } });
    assert.equal(response.status, 303, label); await Promise.all(tasks);
    const id = response.headers.get("set-cookie").split(";")[0].split("=")[1];
    const row = await db.prepare("SELECT * FROM guestbook_posts WHERE id = ?").bind(id).first();
    assert.equal(row.message, label); assert.equal(row.status, "pending");
    assert.equal(logs.at(-1).result, expected);
    assert.equal(fetchMock.mock.callCount(), expected === "skipped" ? 0 : 1);
    fetchMock.mock.restore();
  }
});

test("actual Worker/D1: timeout retains committed success and aborts once with no resend", async t => {
  const session = await form(), tasks = [], logs = [];
  t.mock.method(console, "log", line => logs.push(JSON.parse(line)));
  const fetchMock = t.mock.method(globalThis, "fetch", () => new Promise(() => {}));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const response = await worker.fetch(post(session), notificationEnv(), { waitUntil(p) { tasks.push(p); } });
  assert.equal(response.status, 303); assert.equal(tasks.length, 1);
  t.mock.timers.tick(NOTIFY_TIMEOUT_MS); await Promise.all(tasks);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[1].signal.aborted, true);
  assert.equal(logs[0].classification, "timeout_outcome_unknown");
  assert.equal((await db.prepare("SELECT status FROM guestbook_posts").first()).status, "pending");
});
