// Local-only integration harness. Uses only the disposable local observation DB.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { executeSQL, buildQuery, STAGING } from "./observation_admin.mjs";

const base = "http://127.0.0.1:8787";
await executeSQL(buildQuery("clear-staging", { confirm: STAGING.database }));
const paths = ["/", "/index.html", "/research.html", "/observations.html", "/guestbook.html"];
const requests = [];
for (const path of paths) {
  const response = await fetch(base + path, { redirect: "manual" });
  assert.equal(response.status, 200);
  requests.push({ path, status: response.status });
  await response.arrayBuffer();
}
await Promise.all([1, 2, 3].map(async n => {
  const response = await fetch(base + "/research.html?test=" + n);
  assert.equal(response.status, 200); await response.arrayBuffer();
}));
const specialUA = "phase2'; -- " + "x".repeat(600);
await (await fetch(base + "/research.html?never-store=query", { headers: {
  "User-Agent": specialUA, Referer: "https://example.com/private?secret#fragment",
  Cookie: "private=never-store", "CF-Connecting-IP": "192.0.2.1",
} })).arrayBuffer();
const excluded = ["/about.html", "/guestbook-complete.html", "/observations-detail.html", "/assets/style.css",
  "/assets/guestbook.js", "/assets/favicon.svg", "/robots.txt", "/llms.txt", "/sitemap.xml",
  "/research", "/index", "/observations", "/guestbook", "/research.html/", "/missing"];
const exclusions = [];
for (const path of excluded) {
  const response = await fetch(base + path, { redirect: "manual" });
  exclusions.push({ path, status: response.status }); await response.arrayBuffer();
}
for (const method of ["HEAD", "POST", "OPTIONS"]) await (await fetch(base + "/research.html", { method })).arrayBuffer();
for (const method of ["GET", "POST"]) assert.equal((await fetch(base + "/api/internal/db-check", { method })).status, 404);
const rows = (await executeSQL("SELECT * FROM page_requests ORDER BY id;"))[0].results;
assert.equal(rows.length, 9);
const daily = (await executeSQL("SELECT page, requests FROM page_request_daily ORDER BY page;"))[0].results;
assert.deepEqual(daily, [{ page: "guestbook", requests: 1 }, { page: "home", requests: 2 },
  { page: "observations", requests: 1 }, { page: "research", requests: 5 }]);
assert.equal(rows.at(-1).user_agent, specialUA.slice(0, 512));
assert.equal(rows.at(-1).referrer_domain, "example.com");
assert.doesNotMatch(JSON.stringify(rows), /never-store|private=|192\.0\.2|fragment/);
for (const path of ["/index", "/research", "/observations", "/guestbook", "/research.html/"]) {
  assert.equal(exclusions.find(row => row.path === path).status, 404);
}
await executeSQL("INSERT INTO page_request_daily VALUES ('2000-01-01', 'home', 1); INSERT INTO page_requests (received_at, day, page, status) VALUES ('2000-01-01T00:00:00.000Z', '2000-01-01', 'home', 200);");
const scheduled = [];
for (let n = 0; n < 2; n++) {
  const response = await fetch(base + "/cdn-cgi/local/explorer/api/local/scheduled?worker=agent-hoihoi-staging", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cron: "17 3 * * *" }),
  });
  assert.equal(response.status, 200); scheduled.push({ status: response.status }); await response.arrayBuffer();
}
assert.equal((await executeSQL("SELECT count(*) AS n FROM page_requests WHERE day='2000-01-01';"))[0].results[0].n, 0);
assert.equal((await executeSQL("SELECT requests FROM page_request_daily WHERE day='2000-01-01';"))[0].results[0].requests, 1);
await executeSQL(buildQuery("clear-staging", { confirm: STAGING.database }));
const dir = new URL("../verification/2026-10-21-phase2/", import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL("local-http.json", dir), JSON.stringify({ checked_at: new Date().toISOString(),
  requests, exclusions, daily, raw_count: rows.length, scheduled,
  private_fields_absent: true, local_observation_data_cleared: true }, null, 2) + "\n");
console.log("PASS: actual local Worker + D1: 9 GET records, exact totals, exclusions, privacy, scheduled twice, aggregates retained, cleanup.");
