// Production release evidence. DB/API operations are read-only. Each explicit
// article/detail HTTP mode sends ONE authorized GET, guarded against replay.
// Full DB values stay in ignored .cloudflare/. Never migrates, deploys or restores.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PRODUCTION, STAGING, readTargetConfig } from "./deployment_targets.mjs";
import { PAGE_PATHS, RETENTION_MS } from "../src/observation.js";
import { notificationVars } from "./guestbook_notification_config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root,"verification/2026-10-25-article-access-production");
const privateDir = path.join(root,".cloudflare/article-production-private");
const mode = process.argv[2];
assert(["before","after-migration","after-deploy","article-1","article-2","detail-http","after-detail","final"].includes(mode));
await mkdir(out,{recursive:true}); await mkdir(privateDir,{recursive:true});
const sha = value => createHash("sha256").update(value).digest("hex");
const hashRows = rows => sha(JSON.stringify(rows));
const config = await readTargetConfig("production");
await readTargetConfig("staging");
for(const route of Object.keys(PAGE_PATHS)) assert(config.assets.run_worker_first.includes(route),route);
assert.deepEqual(config.vars,{ENABLE_DB_CHECK:"false",ENABLE_OBSERVATION:"true",ENABLE_GUESTBOOK:"true",...notificationVars("production")});
assert.equal(config.preview_urls,false); assert.deepEqual(config.triggers.crons,["17 3 * * *"]);
assert.notEqual(PRODUCTION.id,STAGING.id);
assert.equal(JSON.parse(await readFile(path.join(root,"node_modules/wrangler/package.json"),"utf8")).version,"4.151.3");
const migration = await readFile(path.join(root,"migrations/0004_article_page_requests.sql"));
const localProof = JSON.parse(await readFile(path.join(root,"verification/2026-10-25-article-access/migration-local.json"),"utf8"));
assert.equal(sha(migration),localProof.migration_sha256,"Migration differs from the validated bytes");
const finalTests = await readFile(path.join(root,"verification/2026-10-25-article-access/final-tests.txt"),"utf8");
assert.match(finalTests,/pass 44/); assert.match(finalTests,/fail 1/);
const git = args => { const r=spawnSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true}); assert.equal(r.status,0);return r.stdout.trim(); };
assert.equal(git(["branch","--show-current"]),"implement-v1");
const auth = spawnSync(process.execPath,[path.join(root,"node_modules/wrangler/bin/wrangler.js"),"auth","token","--json"],{cwd:root,encoding:"utf8",windowsHide:true});
assert.equal(auth.status,0,"Existing Wrangler authentication unavailable");
const credential = JSON.parse(auth.stdout);
const headers = credential.type === "api_key" ? {"X-Auth-Key":credential.key,"X-Auth-Email":credential.email} : {Authorization:`Bearer ${credential.token}`};
const cf = `https://api.cloudflare.com/client/v4/accounts/${PRODUCTION.account}`;
async function api(endpoint) {
  const response=await fetch(cf+endpoint,{headers,signal:AbortSignal.timeout(30000)});
  const json=await response.json();assert(response.ok&&json.success,`Read-only API failed: ${response.status}`);return json.result;
}
async function query(sql) {
  assert(/^(SELECT|PRAGMA)\b/i.test(sql.trim()),"Only fixed read-only SQL is supported");
  const response=await fetch(`${cf}/d1/database/${PRODUCTION.id}/query`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({sql,params:[]}),signal:AbortSignal.timeout(30000)});
  const json=await response.json();assert(response.ok&&json.success&&json.result?.length===1&&json.result[0].success,`Production read failed: ${response.status}`);return json.result[0];
}
function safe(value) {
  return JSON.parse(JSON.stringify(value,(key,item)=>{
    if(["author_email","email","jwt","token","oauth_token"].includes(key)) return undefined;
    if(item?.type==="secret_text") return {name:item.name,type:item.type};
    if(item?.type==="plain_text"&&item.name==="GUESTBOOK_NOTIFY_URL") return {name:item.name,type:item.type,value_sha256:sha(item.text)};
    return item;
  }));
}
const columns = {
  page_request_daily:["day","page","requests"],page_requests:["id","received_at","day","page","status","user_agent","referrer_domain"],
  guestbook_posts:["id","created_at","name","message","status"],guestbook_gate:["id","next_allowed_at"],
  environment_check:["id","created_at","value"],d1_migrations:["id","name","applied_at"],
};
const snapshotSQL="SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS database_utc, "+Object.entries(columns).map(([table,cols])=>`(SELECT json_group_array(json_object(${cols.map(c=>`'${c}',${c}`).join(",")})) FROM (SELECT * FROM ${table} ORDER BY ${table==="page_request_daily"?"day,page":"id"})) AS ${table}`).join(", ");
async function take(label) {
  const started_at=new Date().toISOString();const result=await query(snapshotSQL);
  const {database_utc,...values}=result.results[0];
  const snapshot=Object.fromEntries(Object.entries(values).map(([table,data])=>[table,JSON.parse(data)]));
  const saved={started_at,completed_at:new Date().toISOString(),database_utc,snapshot,meta:result.meta};
  await writeFile(path.join(privateDir,label+".json"),JSON.stringify(saved,null,2)+"\n"); return saved;
}
const summary = saved => ({database_utc:saved.database_utc,rows:Object.fromEntries(Object.entries(saved.snapshot).map(([table,rows])=>[table,rows.length])),sha256:Object.fromEntries(Object.entries(saved.snapshot).map(([table,rows])=>[table,hashRows(rows)]))});
function compare(before,after) {
  const b=before.snapshot,a=after.snapshot;
  const rawIndex=new Map(a.page_requests.map(row=>[row.id,row]));
  const expired=[];
  for(const row of b.page_requests) {
    if(!rawIndex.has(row.id)&&Date.parse(row.received_at)<Date.parse(after.database_utc)-RETENTION_MS) { expired.push(row.id);continue; }
    assert.deepEqual(rawIndex.get(row.id),row,"Saved raw row missing or changed");
  }
  // Do not silently attribute missing expired rows to Cron without investigation.
  assert.equal(expired.length,0,"Eligible expired rows disappeared; investigate normal retention before continuing");
  for(const table of ["guestbook_posts","environment_check"]) for(const row of b[table]) assert.deepEqual(a[table].find(next=>next.id===row.id),row,`${table}: a saved row changed`);
  const newPosts=a.guestbook_posts.filter(row=>!b.guestbook_posts.some(old=>old.id===row.id));
  if(!newPosts.length) assert.deepEqual(a.guestbook_gate,b.guestbook_gate,"Gate changed without a new post");
  else assert(a.guestbook_gate[0].next_allowed_at>=b.guestbook_gate[0].next_allowed_at,"Gate regressed");
  assert.deepEqual(a.d1_migrations.slice(0,b.d1_migrations.length),b.d1_migrations,"Existing migration history changed");
  const oldIDs=new Set(b.page_requests.map(row=>row.id));
  const added=a.page_requests.filter(row=>!oldIDs.has(row.id));
  const byKey=new Map();for(const row of added) {const key=row.day+"/"+row.page;byKey.set(key,(byKey.get(key)||0)+1);}
  const oldDaily=new Map(b.page_request_daily.map(row=>[row.day+"/"+row.page,row.requests]));
  const newDaily=new Map(a.page_request_daily.map(row=>[row.day+"/"+row.page,row.requests]));
  for(const [key,count] of oldDaily) assert(newDaily.has(key)&&newDaily.get(key)>=count,"Daily aggregate decreased or vanished");
  const deltas=[];
  for(const [key,count] of newDaily) {
    const delta=count-(oldDaily.get(key)||0);assert.equal(delta,byKey.get(key)||0,"Daily/raw increment mismatch: "+key);
    if(delta) deltas.push({key,requests:delta});
  }
  return {all_saved_raw_values_equal:true,all_saved_post_values_equal:true,gate_preserved_or_new_post_explained:true,
    old_migration_rows_equal:true,daily_increments_reconciled_with_new_raw:true,new_post_count:newPosts.length,
    added_raw:added.map(({id,received_at,day,page,status})=>({id,received_at,day,page,status})),daily_deltas:deltas};
}
function checkSchema(schema,foreignKeys,indexes,migrations) {
  const parent=schema.find(row=>row.type==="table"&&row.name==="page_request_daily");
  assert(parent);for(const page of ["home","research","observations","guestbook"]) assert(parent.sql.includes(`'${page}'`));
  assert.match(parent.sql,/CHECK\s*\(requests\s*>=\s*1\)/i);assert.match(parent.sql,/PRIMARY KEY\s*\(day,\s*page\)/i);
  const isV4=migrations.some(row=>row.name==="0004_article_page_requests.sql");
  for(const page of ["agent_traps","agents_and_traps"]) assert.equal(parent.sql.includes(`'${page}'`),isV4);
  assert.deepEqual(migrations.map(row=>row.name),["0001_environment_check.sql","0002_page_requests.sql","0003_guestbook.sql",...(isV4?["0004_article_page_requests.sql"]:[])]);
  assert.equal(foreignKeys.length,2);assert(foreignKeys.every(row=>row.table==="page_request_daily"&&row.on_delete==="CASCADE"));
  assert.deepEqual(foreignKeys.map(row=>[row.from,row.to]),[["day","day"],["page","page"]]);
  assert(indexes.some(row=>row.name==="page_requests_received_at"));
  const extras=schema.filter(row=>((row.type==="trigger"||row.type==="view")&&/page_request/i.test(row.sql||""))||(row.type==="table"&&!["page_requests","page_request_daily"].includes(row.name)&&/REFERENCES\s+"?page_request/i.test(row.sql||"")));
  assert.deepEqual(extras,[],"Additional references or triggers require migration review");
  return {v4_applied:isV4,foreign_keys:foreignKeys,indexes,extra_references_or_triggers:[]};
}
async function worker(target) {
  const base=`/workers/scripts/${target.worker}`;
  const settings=await api(base+"/settings"),deployments=await api(base+"/deployments"),subdomain=await api(base+"/subdomain");
  const current=deployments.deployments[0];assert(current.versions.length===1&&current.versions[0].percentage===100,"Unexpected gradual deployment");
  const version=await api(base+"/versions/"+current.versions[0].version_id);
  const binding=settings.bindings.find(row=>row.type==="d1"&&row.name==="DB");assert.equal(binding.database_id||binding.id,target.id);
  const vars=Object.fromEntries(settings.bindings.filter(row=>row.type==="plain_text").map(row=>[row.name,row.text]));
  assert.equal(vars.ENABLE_DB_CHECK,"false");assert.equal(vars.ENABLE_OBSERVATION,"true");assert.equal(vars.ENABLE_GUESTBOOK,"true");
  assert.deepEqual({GUESTBOOK_NOTIFY_ENVIRONMENT:vars.GUESTBOOK_NOTIFY_ENVIRONMENT,GUESTBOOK_NOTIFY_URL:vars.GUESTBOOK_NOTIFY_URL},notificationVars(target===PRODUCTION?"production":"staging"));
  assert(settings.bindings.some(row=>row.name==="GUESTBOOK_NOTIFY_SECRET"&&row.type==="secret_text"));
  assert.equal(subdomain.previews_enabled,false);
  return safe({settings,current_deployment:current,subdomain,version});
}
async function manifest() {
  const files={};
  async function walk(dir){for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){const file=dir+"/"+entry.name;if(entry.isDirectory()) await walk(file);else files[file]=sha(await readFile(path.join(root,file)));}}
  for(const dir of ["src","public","migrations"]) await walk(dir);
  for(const file of ["package.json","pnpm-lock.yaml","scripts/prepare_cloudflare.mjs","scripts/prepare_production.mjs","scripts/deployment_targets.mjs","scripts/guestbook_notification_config.mjs",".cloudflare/wrangler.production.json"]) files[file]=sha(await readFile(path.join(root,file)));
  return {head:git(["rev-parse","HEAD"]),branch:git(["branch","--show-current"]),files,manifest_sha256:hashRows(files)};
}
if(mode==="detail-http") {
  await writeFile(path.join(privateDir,"detail-http-attempt.json"),JSON.stringify({started_at:new Date().toISOString()})+"\n",{flag:"wx"});
  const before=await take("detail-http-before"),started_at=new Date().toISOString();
  const response=await fetch(new URL("observations-detail.html",PRODUCTION.url),{redirect:"manual",signal:AbortSignal.timeout(30000)});
  const body=await response.text();assert.equal(response.status,200);
  const counts=Object.fromEntries([...body.matchAll(/data-count="([a-z_]+)">([^<]+)</g)].map(match=>[match[1],match[2]]));
  assert.deepEqual(Object.keys(counts),["home","research","observations","guestbook","agent_traps","agents_and_traps"]);
  assert(body.includes("including Article 1 before that URL became the research index"));assert(body.includes("not a measured zero"));
  const after=await take("detail-http-after");const preservation=compare(before,after);
  await writeFile(path.join(privateDir,"detail-http.html"),body);
  const evidence={pathname:"/observations-detail.html",method:"GET",requests_sent:1,status:response.status,started_at,completed_at:new Date().toISOString(),
    reason:"Supplemental status verification because the browser API does not expose navigation performance/status",counts,body_sha256:sha(body),preservation,
    observation_records_added_by_detail:0};
  await writeFile(path.join(out,"detail-http.json"),JSON.stringify(evidence,null,2)+"\n");console.log(JSON.stringify(evidence,null,2));
} else if(mode.startsWith("article-")) {
  const page=mode==="article-1"?"agent_traps":"agents_and_traps";
  const pathname=mode==="article-1"?"/agent-traps.html":"/agents-and-traps.html";
  const marker=path.join(privateDir,mode+"-attempt.json");
  // Exclusive create BEFORE sending: an uncertain result must never auto-retry.
  await writeFile(marker,JSON.stringify({started_at:new Date().toISOString(),pathname})+"\n",{flag:"wx"});
  const before=await take(mode+"-before");
  const started_at=new Date().toISOString();
  const response=await fetch(PRODUCTION.url.slice(0,-1)+pathname,{redirect:"manual",signal:AbortSignal.timeout(30000)});
  const body=await response.text();assert.equal(response.status,200);assert.match(body,/<article\b/);
  let after;let added;
  for(let attempt=0;attempt<12;attempt++) {
    after=await take(mode+"-after");const ids=new Set(before.snapshot.page_requests.map(row=>row.id));
    added=after.snapshot.page_requests.filter(row=>!ids.has(row.id)&&row.page===page);
    if(added.length) break;
    await new Promise(resolve=>setTimeout(resolve,1000)); // DB reads only, never re-send GET.
  }
  const preservation=compare(before,after);assert(added.length>=1,"GET was not recorded within DB polling interval");assert(added.every(row=>row.status===200));
  const evidence={pathname,method:"GET",requests_sent:1,started_at,completed_at:new Date().toISOString(),status:response.status,body_sha256:sha(body),before:summary(before),after:summary(after),preservation,
    matching_new_rows:added.map(({id,received_at,day,page,status})=>({id,received_at,day,page,status})),
    attribution:added.length===1?"One matching recorded request in the verification window; identity is not inferred":"Concurrent matching traffic requires distinguishing natural arrivals; only one GET was sent by this script"};
  await writeFile(path.join(out,mode+".json"),JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify({mode,requests_sent:1,status:response.status,matching_new_rows:evidence.matching_new_rows,preservation},null,2));
} else {
  if(mode==="before") {try {await stat(path.join(privateDir,"before.json"));throw new Error("Production baseline already exists");}catch(error){if(error.code!=="ENOENT")throw error;}}
  const saved=await take(mode);
  const schema=(await query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name")).results;
  const fkCheck=(await query("PRAGMA foreign_key_check")).results;assert.deepEqual(fkCheck,[]);
  const foreignKeys=(await query("PRAGMA foreign_key_list(page_requests)")).results;
  const indexes=(await query("PRAGMA index_list(page_requests)")).results;
  const schemaCheck=checkSchema(schema,foreignKeys,indexes,saved.snapshot.d1_migrations);
  const database=safe(await api(`/d1/database/${PRODUCTION.id}`));
  assert.equal(database.name,PRODUCTION.database);assert.equal(database.uuid,PRODUCTION.id);
  const bytes=database.file_size||saved.meta.size_after;assert(bytes>0&&bytes*3<500*1024*1024,"Conservative Free-plan capacity guard failed");
  const workers={production:await worker(PRODUCTION),staging:await worker(STAGING)};
  if(["after-deploy","after-detail","final"].includes(mode)) {
    const routes=workers.production.version.resources.script_runtime.assets.raw_run_worker_first;
    for(const route of Object.keys(PAGE_PATHS)) assert(routes.includes(route),"Deployed Worker route missing: "+route);
    assert.equal(workers.production.version.resources.script.etag,workers.staging.version.resources.script.etag,"Deployed script differs from verified staging");
  }
  const sources=await manifest();
  const evidence={mode,checked_at:new Date().toISOString(),environment:"production",database_id:PRODUCTION.id,snapshot:summary(saved),schema,schema_check:schemaCheck,foreign_key_check:fkCheck,
    database,capacity:{bytes,conservative_three_times_bytes:bytes*3,minimum_plan_limit_bytes:500*1024*1024},workers,sources};
  if(mode!=="before") {
    const baseline=JSON.parse(await readFile(path.join(privateDir,"before.json"),"utf8"));
    const before=JSON.parse(await readFile(path.join(out,"before.json"),"utf8"));
    evidence.preservation=compare(baseline,saved);
    assert(schemaCheck.v4_applied,"V4 schema is required after migration");
    assert.deepEqual(workers.staging,before.workers.staging,"Staging deployment or settings changed");
    const bindings=w=>[...w.settings.bindings].sort((a,b)=>a.name.localeCompare(b.name));
    assert.deepEqual(bindings(workers.production),bindings(before.workers.production),"Production bindings or flags changed");
    assert.deepEqual(workers.production.subdomain,before.workers.production.subdomain,"Production preview/subdomain changed");
    assert.deepEqual(sources.files,before.sources.files,"Deployable source bytes changed after baseline");
    evidence.staging_version_and_settings_unchanged=true;evidence.production_bindings_and_preview_unchanged=true;
  }
  await writeFile(path.join(out,mode+".json"),JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify({mode,checked_at:evidence.checked_at,rows:evidence.snapshot.rows,v4_applied:schemaCheck.v4_applied,capacity:evidence.capacity,
    versions:Object.fromEntries(Object.entries(workers).map(([name,w])=>[name,w.current_deployment.versions])),preservation:evidence.preservation},null,2));
}
