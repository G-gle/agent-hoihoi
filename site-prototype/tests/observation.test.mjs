import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { PAGE_PATHS, referrerDomain, recordRequest, pruneRaw, RETENTION_MS } from "../src/observation.js";
import { buildQuery, validateTarget, STAGING } from "../scripts/observation_admin.mjs";

const require = createRequire(realpathSync(fileURLToPath(new URL("../node_modules/wrangler/package.json", import.meta.url))));
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const req = (path, method = "GET", headers) => new Request("https://test.invalid" + path, { method, headers });
function context() {
  const tasks = [];
  return { waitUntil(task) { tasks.push(task); }, async done() { await Promise.all(tasks); } };
}

test("Referer accepts only HTTP(S) hostname, rejects malformed, IP and long input", () => {
  for (const value of [null, "", "bad", "/relative", "mailto:a@example.com", "ftp://example.com",
    "http://127.0.0.1/p", "http://2130706433/", "http://0x7f000001/", "http://127.1/",
    "http://[::1]/", "http://[::ffff:192.0.2.1]/", "http://192.0.2.1./", "https://example.com/" + "a".repeat(8192)]) {
    assert.equal(referrerDomain(value), null, value);
  }
  assert.equal(referrerDomain("https://user:secret@EXAMPLE.com:8443/private?q=secret#secret"), "example.com");
  assert.equal(referrerDomain("https://例え.jp/path"), "xn--r8jz45g.jp");
});

test("GET-only exact path scope, actual statuses, receipt UTC, stop switch and private error output", async () => {
  const events = [];
  const db = { prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    withSession() { return { prepare() { return { bind() { return { all: async () => ({ success: true, results: [] }) }; } }; } }; },
    async batch(statements) { events.push(statements); return [{ success: true }, { success: true }]; } };
  for (const path of Object.keys(PAGE_PATHS)) for (const status of [200, 301, 302, 304, 404, 500]) {
    const ctx = context();
    const response = await worker.fetch(req(path + "?private=query"), {
      ENABLE_OBSERVATION: "true", DB: db,
      ASSETS: { async fetch() { return new Response(null, { status }); } },
    }, ctx);
    await ctx.done();
    const expectedStatus = path === "/guestbook.html" && status !== 200 ? 503 : status;
    assert.equal(response.status, expectedStatus);
    const last = events.at(-1)[1].values;
    assert.equal(last[2], PAGE_PATHS[path]);
    assert.equal(last[3], expectedStatus);
    assert.match(last[0], /^\d{4}-\d\d-\d\dT.*Z$/);
  }
  const before = events.length;
  for (const path of ["/about.html", "/agent-traps.html", "/agents-and-traps.html", "/observations-detail.html", "/guestbook-complete.html", "/assets/style.css",
    "/llms.txt", "/robots.txt", "/sitemap.xml", "/research", "/index", "/missing", "/research.html/"]) {
    await worker.fetch(req(path), { ENABLE_OBSERVATION: "true", DB: db, ASSETS: { fetch: () => new Response("asset") } }, context());
  }
  for (const method of ["HEAD", "POST", "OPTIONS", "PUT", "DELETE"]) {
    await worker.fetch(req("/research.html", method), { ENABLE_OBSERVATION: "true", DB: db, ASSETS: { fetch: () => new Response(null) } }, context());
  }
  for (const value of [undefined, "false", true]) {
    await worker.fetch(req("/"), { ENABLE_OBSERVATION: value, ASSETS: { fetch: () => new Response("site") } }, context());
  }
  assert.equal(events.length, before);
  const failedAssetContext = context();
  const failedAsset = await worker.fetch(req("/research.html"), { ENABLE_OBSERVATION: "true", DB: db,
    ASSETS: { fetch() { throw new Error("private asset detail"); } } }, failedAssetContext);
  await failedAssetContext.done();
  assert.equal(failedAsset.status, 500);
  assert.equal(events.at(-1)[1].values[3], 500);
  const ctx = context();
  const original = console.error, errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const response = await worker.fetch(req("/"), { ENABLE_OBSERVATION: "true", ASSETS: { fetch: () => new Response("site") } }, ctx);
    assert.equal(await response.text(), "site");
    await ctx.done();
    assert.deepEqual(errors, [["page_request_write_failed"]]);
  } finally { console.error = original; }
});

test("actual D1: concurrent increments, privacy, UTC boundary, atomic rollback, retention and clear isolation", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('test')}}",
    compatibilityDate: "2026-10-21", d1Databases: ["DB"] }));
  try {
    const db = await mf.getD1Database("DB");
    for (const migration of ["0001_environment_check.sql", "0002_page_requests.sql"]) {
      // D1 exec requires one statement per line; comments removed for this harness.
      const sql = (await readFile(new URL("../migrations/" + migration, import.meta.url), "utf8"))
        .replace(/--[^\n]*/g, "").split(";").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);
      for (const statement of sql) await db.prepare(statement).run();
    }
    const stamp = "2026-10-21T00:00:00.000Z";
    const special = `test'; DROP TABLE page_requests; -- ` + "x".repeat(600);
    const request = req("/research.html?secret=never-save", "GET", {
      "User-Agent": special, Referer: "https://user:secret@EXAMPLE.com/private?secret#hidden",
      Cookie: "secret", Authorization: "Bearer secret", "CF-Connecting-IP": "192.0.2.10",
      "Cf-Access-Authenticated-User-Email": "private@example.com",
    });
    await Promise.all(Array.from({ length: 40 }, () => recordRequest(db, request, "research", 200, stamp)));
    assert.equal((await db.prepare("SELECT requests FROM page_request_daily").first()).requests, 40);
    const raw = await db.prepare("SELECT * FROM page_requests LIMIT 1").first();
    assert.equal(raw.user_agent, special.slice(0, 512));
    assert.equal(raw.referrer_domain, "example.com");
    assert.deepEqual(Object.keys(raw).sort(), ["id", "received_at", "day", "page", "status", "user_agent", "referrer_domain"].sort());
    assert.doesNotMatch(JSON.stringify(raw), /Bearer|private@example|192\.0\.2|never-save|\/private|hidden/);
    await recordRequest(db, req("/"), "home", 301, "2026-10-20T23:59:59.999Z");
    await recordRequest(db, req("/"), "home", 304, stamp);
    const noHeaders = await db.prepare("SELECT user_agent, referrer_domain FROM page_requests WHERE page='home' LIMIT 1").first();
    assert.deepEqual(noHeaders, { user_agent: null, referrer_domain: null });
    assert.equal((await db.prepare("SELECT count(*) AS n FROM page_request_daily WHERE page='home'").first()).n, 2);
    await db.prepare("CREATE TRIGGER reject_raw BEFORE INSERT ON page_requests BEGIN SELECT RAISE(ABORT, 'fixture failure'); END").run();
    await assert.rejects(recordRequest(db, req("/"), "guestbook", 200, stamp));
    assert.equal(await db.prepare("SELECT * FROM page_request_daily WHERE page='guestbook'").first(), null);
    // Also verify rollback of an update to an existing total.
    await assert.rejects(recordRequest(db, req("/research.html"), "research", 200, stamp));
    assert.equal((await db.prepare("SELECT requests FROM page_request_daily WHERE page='research'").first()).requests, 40);
    await db.prepare("DROP TRIGGER reject_raw").run();
    const now = Date.parse("2026-10-21T12:00:00.000Z"), boundary = now - RETENTION_MS;
    for (const delta of [-1, 0, 1]) await recordRequest(db, req("/"), "observations", 200, new Date(boundary + delta).toISOString());
    await pruneRaw(db, now);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM page_requests WHERE page='observations'").first()).n, 2);
    assert.equal((await db.prepare("SELECT requests FROM page_request_daily WHERE page='observations'").first()).requests, 3);
    await pruneRaw(db, now);
    // Invoke actual scheduled handler twice; create an expired dedicated fixture.
    await recordRequest(db, req("/"), "guestbook", 200, "2000-01-01T00:00:00.000Z");
    for (let n = 0; n < 2; n++) { const ctx = context(); await worker.scheduled({}, { DB: db }, ctx); await ctx.done(); }
    assert.equal((await db.prepare("SELECT count(*) AS n FROM page_requests WHERE page='guestbook'").first()).n, 0);
    assert.equal((await db.prepare("SELECT requests FROM page_request_daily WHERE page='guestbook'").first()).requests, 1);
    await db.prepare("INSERT INTO environment_check VALUES ('fixture', '2000', 'keep')").run();
    await db.prepare(buildQuery("clear-staging", { confirm: STAGING.database })).run();
    assert.equal((await db.prepare("SELECT count(*) AS n FROM page_requests").first()).n, 0);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM page_request_daily").first()).n, 0);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM environment_check").first()).n, 1);
  } finally { await mf.dispose(); }
});

test("administrator commands reject production, unknown DBs, invalid ranges and SQL input", () => {
  const config = { name: "agent-hoihoi-staging", account_id: STAGING.account,
    d1_databases: [{ binding: "DB", database_name: STAGING.database, database_id: STAGING.id }] };
  validateTarget(config);
  for (const bad of [{ ...config, name: "production" }, { ...config, account_id: "other" },
    { ...config, d1_databases: [{ ...config.d1_databases[0], database_id: "other" }] }]) assert.throws(() => validateTarget(bad));
  for (const options of [{ from: "2026-10-21'; DROP TABLE page_requests;--", to: "2026-10-21" },
    { from: "2026-02-30", to: "2026-10-21" }, { from: "2020-01-01", to: "2026-10-21" },
    { from: "2026-10-21", to: "2026-10-20" }, { from: "2026-10-21", to: "2026-10-21", limit: "1; DELETE" }]) {
    assert.throws(() => buildQuery("recent", options));
  }
  assert.throws(() => buildQuery("clear-staging", { confirm: "production" }));
  assert.match(buildQuery("daily", { from: "2026-10-21", to: "2026-10-21" }), /LIMIT 100/);
});
