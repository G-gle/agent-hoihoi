// Read-only staging evidence. Raw rows and post bodies stay under ignored .cloudflare/.
// Never migrates, deploys, posts, prunes, or changes Access. Credentials are not saved.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAGING, PRODUCTION, readTargetConfig } from "./deployment_targets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
assert(["before", "after-migration", "after-old-code", "after-deploy", "after-requests", "final"].includes(mode));
const dir = path.join(root, "verification/2026-10-25-article-access");
const privateDir = path.join(root, ".cloudflare/article-access-private");
await mkdir(dir, { recursive: true }); await mkdir(privateDir, { recursive: true });
const sha = data => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const config = await readTargetConfig("staging");
const auth = spawnSync(process.execPath,[path.join(root,"node_modules/wrangler/bin/wrangler.js"),"auth","token","--json"],{cwd:root,encoding:"utf8",windowsHide:true});
assert.equal(auth.status,0,"Existing Wrangler authentication unavailable");
const credential = JSON.parse(auth.stdout);
const headers = credential.type === "api_key" ? {"X-Auth-Key":credential.key,"X-Auth-Email":credential.email} : {Authorization:`Bearer ${credential.token}`};
const db = { async query(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${STAGING.account}/d1/database/${STAGING.id}/query`, {
    method:"POST", headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({sql,params:[]}),signal:AbortSignal.timeout(30000) });
  const body = await response.json();
  // These statements contain schema names only, never submitted post text.
  assert(response.ok && body.success && body.result?.[0]?.success, JSON.stringify({status:response.status,errors:body.errors}));
  return body.result[0];
} };
const columns = {
  page_request_daily: ["day", "page", "requests"],
  page_requests: ["id", "received_at", "day", "page", "status", "user_agent", "referrer_domain"],
  guestbook_posts: ["id", "created_at", "name", "message", "status"],
  guestbook_gate: ["id", "next_allowed_at"], environment_check: ["id", "created_at", "value"],
  d1_migrations: ["id", "name", "applied_at"],
};
// One statement, one DB snapshot, with a deterministic ordering for hashing.
const sql = "SELECT " + Object.entries(columns).map(([table, cols]) => `(SELECT json_group_array(json_object(${cols.map(c=>`'${c}',${c}`).join(",")})) FROM (SELECT * FROM ${table} ORDER BY ${cols.slice(0,table === "page_request_daily" ? 2 : 1).join(",")})) AS ${table}`).join(", ");
const start = new Date().toISOString();
const result = await db.query(sql);
const snapshot = Object.fromEntries(Object.entries(result.results[0]).map(([table,data])=>[table,JSON.parse(data)]));
const fk = (await db.query("PRAGMA foreign_key_check")).results;
assert.deepEqual(fk, []);
const foreignKeys = (await db.query("PRAGMA foreign_key_list(page_requests)")).results;
assert.equal(foreignKeys.length,2);
assert(foreignKeys.every(r=>r.table === "page_request_daily" && r.on_delete === "CASCADE"));
const schema = (await db.query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name")).results;
const saved = { started_at: start, completed_at: new Date().toISOString(), snapshot, schema };
const privateFile = path.join(privateDir, `${mode}.json`);
if (mode === "before") {
  try { await readFile(privateFile); throw new Error("Baseline already exists; do not overwrite it."); } catch(error) { if (error.code !== "ENOENT") throw error; }
}
await writeFile(privateFile, JSON.stringify(saved, null, 2) + "\n");
const evidence = { started_at: start, completed_at: saved.completed_at, environment: "staging", database_id: STAGING.id,
  rows: Object.fromEntries(Object.entries(snapshot).map(([t,r])=>[t,r.length])),
  sha256: Object.fromEntries(Object.entries(snapshot).map(([t,r])=>[t,sha(r)])), foreign_key_check: fk,
  raw_foreign_keys: foreignKeys,
  daily: snapshot.page_request_daily, migrations: snapshot.d1_migrations.map(r=>r.name),
  private_snapshot: path.relative(root, privateFile).replaceAll("\\","/"), schema };
if (mode !== "before") {
  const before = JSON.parse(await readFile(path.join(privateDir, "before.json"), "utf8")).snapshot;
  for (const row of before.page_request_daily) {
    const next = snapshot.page_request_daily.find(r=>r.day===row.day && r.page===row.page);
    assert(next && next.requests >= row.requests, "Saved daily count decreased or vanished");
    if (mode === "after-migration") assert.equal(next.requests, row.requests, "Traffic occurred: investigate before treating it as a migration change");
  }
  for (const table of ["page_requests","guestbook_posts","guestbook_gate","environment_check"]) for (const row of before[table]) {
    assert.deepEqual(snapshot[table].find(r=>r.id===row.id), row, `${table}: a saved row changed or vanished`);
  }
  if (mode === "after-migration") for (const table of Object.keys(columns).filter(t=>t!=="d1_migrations")) assert.deepEqual(snapshot[table], before[table]);
  assert.deepEqual(snapshot.d1_migrations.slice(0,before.d1_migrations.length), before.d1_migrations);
  assert(snapshot.d1_migrations.some(r=>r.name === "0004_article_page_requests.sql"));
  evidence.preservation = { every_saved_raw_and_post_row_equal: true, gate_and_environment_rows_equal: true,
    daily_values_equal: mode === "after-migration" ? true : undefined, daily_never_decreased: true,
    old_migration_rows_unchanged: true };
  const maxBefore = Math.max(0,...before.page_requests.map(r=>r.id));
  const added = snapshot.page_requests.filter(r=>r.id>maxBefore);
  evidence.added_raw = added.map(({id,received_at,day,page,status})=>({id,received_at,day,page,status}));
  if (mode === "after-requests" || mode === "final") {
    const deployed = JSON.parse(await readFile(path.join(privateDir,"after-deploy.json"),"utf8")).snapshot;
    const priorId = Math.max(0,...deployed.page_requests.map(r=>r.id));
    const verifiedRows = snapshot.page_requests.filter(r=>r.id>priorId);
    const expected = { agent_traps:2, agents_and_traps:1, home:2, research:1, observations:1, guestbook:1 };
    const counts = Object.fromEntries(Object.keys(expected).map(page=>[page,verifiedRows.filter(r=>r.page===page).length]));
    assert.deepEqual(counts,expected,"Investigate traffic in the test interval before changing expected counts");
    assert.equal(verifiedRows.length,8);
    assert(verifiedRows.every(r=>r.status===200));
    for (const [page,n] of Object.entries(expected)) {
      const sum = rows=>rows.filter(r=>r.page===page).reduce((s,r)=>s+r.requests,0);
      assert.equal(sum(snapshot.page_request_daily)-sum(deployed.page_request_daily),n);
    }
    assert(!JSON.stringify(snapshot.page_requests).includes("article-access-check"));
    evidence.test_gets = { expected, raw_and_daily_exactly_equal:true, statuses_all_200:true, raw_added:8,
      first_received_at:verifiedRows[0].received_at,last_received_at:verifiedRows.at(-1).received_at, query_not_stored:true };
  }
}
// Read deployed settings using the existing Wrangler session; never print token.
async function get(url) {
  const response = await fetch(url,{headers,signal:AbortSignal.timeout(30000)});
  const json = await response.json(); assert(response.ok && json.success,"Read-only Cloudflare API failed"); return json.result;
}
const cf = `https://api.cloudflare.com/client/v4/accounts/${STAGING.account}`;
evidence.workers = {};
for (const target of [STAGING, PRODUCTION]) {
  const base = `${cf}/workers/scripts/${target.worker}`;
  const settings = await get(`${base}/settings`);
  const deployed = await get(`${base}/deployments`);
  const deployments = { ...deployed, deployments: deployed.deployments.map(({author_email, ...rest})=>rest) };
  const subdomain = await get(`${base}/subdomain`);
  // Secret bindings contain names/types only. Omit the external notification URL.
  const bindings = settings.bindings.map(b=>b.type === "plain_text" && b.name === "GUESTBOOK_NOTIFY_URL" ? {name:b.name,type:b.type,value_sha256:sha(b.text)} : b);
  evidence.workers[target.worker] = {settings_sha256:sha(settings), settings:{...settings,bindings},deployments,subdomain};
}
assert.equal(config.d1_databases[0].database_id, STAGING.id);
assert.notEqual(STAGING.id, PRODUCTION.id);
if (mode !== "before") {
  const initial = JSON.parse(await readFile(path.join(dir,"staging-before.json"),"utf8"));
  assert.deepEqual(evidence.workers[PRODUCTION.worker], initial.workers[PRODUCTION.worker],"Production settings or deployment changed");
  const sortBindings = w => [...w.settings.bindings].sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(sortBindings(evidence.workers[STAGING.worker]),sortBindings(initial.workers[STAGING.worker]),"Staging bindings or notification settings changed");
  assert.deepEqual(evidence.workers[STAGING.worker].subdomain,initial.workers[STAGING.worker].subdomain,"Staging preview or subdomain settings changed");
  evidence.production_settings_and_deployment_unchanged = true;
  evidence.staging_bindings_notification_flags_and_preview_unchanged = true;
}
await writeFile(path.join(dir,`staging-${mode}.json`), JSON.stringify(evidence,null,2)+"\n");
console.log(JSON.stringify({ mode, checked_at:saved.completed_at, rows:evidence.rows, preservation:evidence.preservation,
  versions:Object.fromEntries(Object.entries(evidence.workers).map(([w,s])=>[w,s.deployments.deployments?.[0]?.versions])),
  production_unchanged:evidence.production_settings_and_deployment_unchanged },null,2));
