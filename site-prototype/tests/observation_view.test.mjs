import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { handleObservation, readSnapshot } from "../src/observation_view.js";
const require = createRequire(realpathSync(fileURLToPath(new URL("../node_modules/wrangler/package.json", import.meta.url))));
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const request = path => new Request("https://test.invalid" + path, { headers: { "If-None-Match": '"old"', "If-Modified-Since": "Wed, 21 Oct 2026 00:00:00 GMT" } });
const assets = { async fetch(req) {
  assert.equal(req.headers.has("if-none-match"), false);
  assert.equal(req.headers.has("if-modified-since"), false);
  return new Response(await readFile(new URL("../public" + new URL(req.url).pathname, import.meta.url), "utf8"));
} };

test("durable totals, single UTC snapshot, 30-day bounds, omitted missing dates, zero versus unknown, privacy", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('test')}}", compatibilityDate: "2026-10-21", d1Databases: ["DB"] }));
  try {
    const db = await mf.getD1Database("DB");
    for (const migration of ["0001_environment_check.sql", "0002_page_requests.sql", "0003_guestbook.sql"]) {
      const sql = (await readFile(new URL("../migrations/" + migration, import.meta.url), "utf8")).replace(/--[^\n]*/g, "").split(";").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);
      for (const statement of sql) await db.prepare(statement).run();
    }
    const env = { DB: db, ENABLE_OBSERVATION: "true", ASSETS: assets };
    const unmeasuredHTML = await (await handleObservation(request("/observations.html"), env)).text();
    assert.match(unmeasuredHTML, /Not measured/);
    assert.doesNotMatch(unmeasuredHTML, /Something seems to have stopped by|data-count=/);
    for (const [day, page, n] of [["2020-01-01", "home", 100], ["2026-09-21", "research", 7], ["2026-09-22", "research", 3], ["2026-10-20", "observations", 4], ["2026-10-21", "guestbook", 9]]) {
      await db.prepare("INSERT INTO page_request_daily VALUES (?, ?, ?)").bind(day, page, n).run();
    }
    const before = await readSnapshot(db, "2026-10-20T23:59:59.999Z");
    const after = await readSnapshot(db, "2026-10-21T00:00:00.000Z");
    assert.equal(after.summary.home, 100);
    assert.equal(after.summary.research, 10);
    assert.equal(after.summary.observations, 4);
    assert.equal(after.summary.guestbook, 9);
    assert.equal(after.summary.first_day, "2020-01-01");
    assert.equal(after.summary.retrieved_at, "2026-10-21T00:00:00.000Z");
    assert.equal(before.summary.start_day, "2026-09-21");
    assert.equal(after.summary.start_day, "2026-09-22");
    assert.deepEqual(after.days.map(d => d.day), ["2026-10-21", "2026-10-20", "2026-09-22"]);
    assert.ok(after.days.every(d => d.retrieved_at === after.summary.retrieved_at));
    await db.prepare("INSERT INTO guestbook_posts VALUES ('private-id', '2026', 'PRIVATE_NAME', 'PRIVATE_MESSAGE', 'pending')").run();
    const overview = await handleObservation(request("/observations.html"), env);
    assert.equal(overview.headers.get("cache-control"), "no-store");
    assert.equal(overview.headers.has("etag"), false);
    const overviewHTML = await overview.text();
    assert.match(overviewHTML, /data-count="observations">4</);
    assert.match(overviewHTML, /<h1>Something seems to have stopped by\.<\/h1>/);
    assert.match(overviewHTML, /Recorded requests to this page/);
    assert.match(overviewHTML, /We can't tell that much\. But we do know that a request was made\./);
    const detail = await handleObservation(request("/observations-detail.html"), env);
    assert.equal(detail.headers.get("x-robots-tag"), "noindex");
    const html = await detail.text();
    assert.match(html, /data-count="home">100</);
    assert.doesNotMatch(html, /PRIVATE_NAME|PRIVATE_MESSAGE|private-id/);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM page_requests").first()).n, 0);
    // Other aggregate rows prove recording existed; this selected page can be zero.
    await db.prepare("DELETE FROM page_request_daily WHERE page = 'observations'").run();
    const zeroHTML = await (await handleObservation(request("/observations.html"), env)).text();
    assert.match(zeroHTML, /data-count="observations">0</);
    assert.doesNotMatch(zeroHTML, /Something seems to have stopped by/);
    assert.match(zeroHTML, /No requests to this observation page are recorded/);
    // Only overview GET is recorded, after its rendered snapshot. Detail and HEAD add nothing.
    const tasks = [], ctx = { waitUntil(p) { tasks.push(p); } };
    const response = await worker.fetch(request("/observations.html"), env, ctx);
    assert.match(await response.text(), /data-count="observations">0</);
    await Promise.all(tasks);
    assert.equal((await db.prepare("SELECT SUM(requests) AS n FROM page_request_daily WHERE page='observations'").first()).n, 1);
    for (const path of ["/observations-detail.html", "/observations.html"]) {
      const req = new Request("https://test.invalid" + path, { method: path.endsWith("detail.html") ? "GET" : "HEAD" });
      await worker.fetch(req, env, ctx);
    }
    assert.equal(tasks.length, 1);
  } finally { await mf.dispose(); }
});

test("paused, missing DB, query failure and empty aggregates remain distinct and navigable", async () => {
  for (const [env, expected] of [
    [{ ENABLE_OBSERVATION: "false" }, "Not measured"],
    [{ ENABLE_OBSERVATION: "true" }, "Temporarily unavailable"],
    [{ ENABLE_OBSERVATION: "true", DB: { withSession() { throw new Error("PRIVATE_SQL"); } } }, "Temporarily unavailable"],
    [{ ENABLE_OBSERVATION: "true", DB: { withSession() { return { prepare() { return { bind() { return { all: async () => ({ success: false }) }; } }; } }; } } }, "Temporarily unavailable"],
  ]) {
    const res = await handleObservation(request("/observations.html"), { ...env, ASSETS: assets });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes(expected));
    assert.match(html, /href="guestbook.html"/);
    assert.doesNotMatch(html, /data-count=|PRIVATE_SQL|Something seems to have stopped by/);
  }
});
