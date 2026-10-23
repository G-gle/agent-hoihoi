// Explicit staging-only verification. Does not change Access or deploy anything.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { executeSQL, buildQuery } from "./observation_admin.mjs";

const mode = process.argv[2];
assert.ok(["snapshot", "retention"].includes(mode), "Use snapshot or retention");
const query = async sql => (await executeSQL(sql, true))[0].results;
const directory = new URL("../verification/2026-10-21-phase2/", import.meta.url);
await mkdir(directory, { recursive: true });
let result;
if (mode === "snapshot") {
  const label = process.argv[3];
  assert.match(label ?? "", /^[a-z0-9-]{1,40}$/);
  result = { checked_at: new Date().toISOString(),
    daily: await query("SELECT day, page, requests FROM page_request_daily ORDER BY day, page;"),
    raw: await query("SELECT page, status, count(*) AS requests, min(received_at) AS first_utc, max(received_at) AS last_utc, max(length(user_agent)) AS max_ua_length FROM page_requests GROUP BY page, status ORDER BY page, status;"),
    environment_check: await query("SELECT count(*) AS remaining FROM environment_check;"),
  };
  await writeFile(new URL(`remote-${label}.json`, directory), JSON.stringify(result, null, 2) + "\n");
} else {
  assert.deepEqual(await query("SELECT * FROM page_request_daily WHERE day='2000-01-01';"), []);
  const before = await query("SELECT day, page, requests FROM page_request_daily ORDER BY day, page;");
  await query("INSERT INTO page_request_daily VALUES ('2000-01-01', 'home', 1);");
  await query("INSERT INTO page_requests (received_at, day, page, status, user_agent) VALUES ('2000-01-01T00:00:00.000Z', '2000-01-01', 'home', 200, 'phase2-retention-fixture');");
  await query(buildQuery("prune", {}));
  await query(buildQuery("prune", {}));
  assert.equal((await query("SELECT count(*) AS n FROM page_requests WHERE day='2000-01-01';"))[0].n, 0);
  assert.equal((await query("SELECT requests FROM page_request_daily WHERE day='2000-01-01' AND page='home';"))[0].requests, 1);
  await query("DELETE FROM page_request_daily WHERE day='2000-01-01' AND page='home';");
  assert.deepEqual(await query("SELECT day, page, requests FROM page_request_daily ORDER BY day, page;"), before);
  result = { checked_at: new Date().toISOString(), manual_prune_runs: 2,
    expired_fixture_deleted: true, aggregate_retained_after_prune: true,
    fixture_aggregate_cleaned: true, other_aggregates_unchanged: true,
    scheduled_cloudflare_event_observed: false };
  await writeFile(new URL("remote-retention.json", directory), JSON.stringify(result, null, 2) + "\n");
}
console.log(JSON.stringify(result, null, 2));
