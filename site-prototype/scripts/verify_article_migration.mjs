// Disposable, LOCAL-ONLY Wrangler/D1 verification. No remote flag or credentials.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { SNAPSHOT_SQL } from "../src/observation_view.js";
import { buildQuery } from "./observation_admin.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = path.join(root, ".cloudflare/article-access-validation", Date.now().toString());
const evidence = path.join(root, "verification/2026-10-25-article-access");
await mkdir(evidence, { recursive: true });
const migrations = ["0001_environment_check.sql", "0002_page_requests.sql", "0003_guestbook.sql", "0004_article_page_requests.sql"];
const v4 = await readFile(path.join(root, "migrations", migrations[3]), "utf8");
const hash = rows => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const report = { checked_at: new Date().toISOString(), wrangler: "4.151.3", location: "local only", migration_sha256: createHash("sha256").update(v4).digest("hex"), cases: {} };
async function setup(name, count) {
  const dir = path.join(run, name);
  await mkdir(path.join(dir, "migrations"), { recursive: true });
  for (const file of migrations.slice(0, count)) await copyFile(path.join(root, "migrations", file), path.join(dir, "migrations", file));
  await writeFile(path.join(dir, "wrangler.json"), JSON.stringify({ name: "article-migration-local", compatibility_date: "2026-10-21",
    d1_databases: [{ binding: "DB", database_name: "article-migration-local-db", database_id: "00000000-0000-0000-0000-000000000000", migrations_dir: "migrations" }] }));
  function cli(args, failure = false) {
    const result = spawnSync(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", ...args,
      "--local", "--config", path.join(dir, "wrangler.json"), "--persist-to", path.join(dir, "state")],
      { cwd: root, encoding: "utf8", windowsHide: true, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" }, maxBuffer: 12 * 1024 * 1024 });
    if (failure) assert.notEqual(result.status, 0, "fault-injected migration must fail");
    else assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  }
  return { dir, migrate: failure => cli(["migrations", "apply", "article-migration-local-db"], failure),
    query(sql) { return JSON.parse(cli(["execute", "article-migration-local-db", "--command", sql, "--json"])); } };
}
const fixture = `INSERT INTO environment_check VALUES ('fixture-env','2001','preserve');
INSERT INTO guestbook_posts VALUES ('fixture-post','2001','fixture','fixture message','pending');
UPDATE guestbook_gate SET next_allowed_at=123456789;
INSERT INTO page_request_daily VALUES ('2000-01-01','home',99),('2026-10-23','home',3),('2026-10-23','research',11),('2026-10-24','observations',2),('2026-10-24','guestbook',4);
INSERT INTO page_requests VALUES (7,'2026-10-23T00:00:00.000Z','2026-10-23','home',301,NULL,NULL),(19,'2026-10-23T23:59:59.999Z','2026-10-23','research',404,'fixture UA','example.com'),(42,'2026-10-24T00:00:00.000Z','2026-10-24','observations',200,'',NULL),(103,'2026-10-24T01:00:00.000Z','2026-10-24','guestbook',500,NULL,'example.org');`;
const snapshotSQL = `SELECT * FROM page_request_daily ORDER BY day,page; SELECT * FROM page_requests ORDER BY id;
SELECT * FROM guestbook_posts ORDER BY id; SELECT * FROM guestbook_gate; SELECT * FROM environment_check ORDER BY id;
SELECT name,sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name;
SELECT * FROM d1_migrations ORDER BY id;`;
const take = db => db.query(snapshotSQL).map(r => r.results);
const empty = await setup("empty", 4); empty.migrate();
assert.equal(empty.query("SELECT count(*) AS n FROM d1_migrations")[0].results[0].n, 4);
assert.deepEqual(empty.query("PRAGMA foreign_key_check")[0].results, []);
report.cases.empty = { all_four_applied: true, foreign_key_check: [] };

const existing = await setup("existing", 3); existing.migrate(); existing.query(fixture);
const before = take(existing);
await writeFile(path.join(existing.dir, "migrations", migrations[3]), v4);
existing.migrate();
const after = take(existing);
assert.deepEqual(after.slice(0, 5), before.slice(0, 5));
assert.deepEqual(after[6].slice(0, 3), before[6]);
assert.equal(after[6].length, 4);
const fk = existing.query("PRAGMA foreign_key_check; PRAGMA foreign_key_list(page_requests); PRAGMA index_list(page_requests); PRAGMA index_list(page_request_daily);").map(r => r.results);
assert.deepEqual(fk[0], []);
assert.equal(fk[1].length, 2);
assert(fk[1].every(r => r.table === "page_request_daily" && r.on_delete === "CASCADE"));
assert(fk[2].some(r => r.name === "page_requests_received_at"));
assert(fk[3].some(r => r.origin === "pk" && r.unique === 1));
// Legacy recorder statements and legacy snapshot SQL must still run after expansion.
const oldView = spawnSync("git", ["show", "HEAD:site-prototype/src/observation_view.js"], { cwd: root, encoding: "utf8", windowsHide: true }).stdout;
const oldSnapshot = oldView.match(/export const SNAPSHOT_SQL = `([\s\S]*?)`;/)[1].replace("?", "'2026-10-25T00:00:00.000Z'");
assert(existing.query(oldSnapshot)[0].results.some(r => r.kind === "summary" && r.research === 11));
existing.query("INSERT INTO page_request_daily VALUES ('2026-10-25','research',1) ON CONFLICT(day,page) DO UPDATE SET requests=requests+1; INSERT INTO page_requests(received_at,day,page,status) VALUES ('2026-10-25T00:00:00.000Z','2026-10-25','research',200);");
for (const page of ["agent_traps", "agents_and_traps"]) existing.query(`INSERT INTO page_request_daily VALUES ('2026-10-25','${page}',1); INSERT INTO page_requests(received_at,day,page,status) VALUES ('2026-10-25T00:00:00.000Z','2026-10-25','${page}',404);`);
const snapshot = existing.query(SNAPSHOT_SQL.replace("?", "'2026-10-25T00:00:00.000Z'"))[0].results;
assert.equal(snapshot.find(r => r.kind === "summary").agent_traps, 1);
const managed = existing.query(buildQuery("daily", {from:"2026-10-25",to:"2026-10-25"}))[0].results;
assert(managed.some(r => r.page === "agent_traps")); assert(managed.some(r => r.page === "agents_and_traps"));
existing.query("DELETE FROM page_request_daily WHERE day='2026-10-25' AND page='agent_traps'");
assert.deepEqual(existing.query("SELECT * FROM page_requests WHERE page='agent_traps'; PRAGMA foreign_key_check;").map(r => r.results), [[],[]]);
report.cases.existing = { preserved_daily_rows: before[0].length, preserved_raw_rows: before[1].length, preserved_raw_ids: before[1].map(r=>r.id),
  all_values_equal: true, before_hashes: before.slice(0,5).map(hash), after_hashes: after.slice(0,5).map(hash),
  includes_aggregate_without_raw: true, posts_gate_environment_unchanged: true, foreign_key_check: fk[0], foreign_keys: fk[1], indexes: fk.slice(2),
  legacy_snapshot_and_writes: true, new_page_writes_and_management: true, cascade_verified: true };

// Fail late, AFTER both old tables were dropped/renamed, using real Wrangler.
const failed = await setup("failure", 3); failed.migrate(); failed.query(fixture);
const failureBefore = take(failed);
await writeFile(path.join(failed.dir, "migrations", migrations[3]), v4 + "\nINSERT INTO page_request_daily VALUES ('2026-10-25','INVALID',1);\n");
failed.migrate(true);
assert.deepEqual(take(failed), failureBefore);
assert.deepEqual(failed.query("PRAGMA foreign_key_check")[0].results, []);
await writeFile(path.join(failed.dir, "migrations", migrations[3]), v4);
failed.migrate();
assert.deepEqual(take(failed).slice(0,5), failureBefore.slice(0,5));
report.cases.failure = { late_failure_rolled_back_all_rows_schema_indexes_and_marker: true, retry_succeeded: true, foreign_key_check: [] };
report.completed_at = new Date().toISOString();
await writeFile(path.join(evidence, "migration-local.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
