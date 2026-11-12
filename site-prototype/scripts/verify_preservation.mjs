import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile,writeFile } from 'node:fs/promises';
import { cloudflare,verifiedDatabase,query } from './cloudflare_api.mjs';
const environment=process.argv[2],phase=process.argv[3]??'after-migration';
const baselineLabel=process.argv[4]??'before';
if(!['before','prepublish'].includes(baselineLabel))throw new Error('Invalid backup label');
if(!['staging','production'].includes(environment)||!['after-migration','after-deploy','final'].includes(phase))throw new Error('Invalid verification target');
const local=new DatabaseSync(':memory:');local.exec(await readFile(`.cloudflare/private/${environment}-${baselineLabel}.sql`,'utf8'));
const api=await cloudflare(),target=await verifiedDatabase(api,environment),evidence={environment,phase,checked_at:new Date().toISOString(),preservation:{}};
const queries={posts:'SELECT id,created_at,name,message,status FROM guestbook_posts ORDER BY id',raw:'SELECT * FROM page_requests ORDER BY id',daily:'SELECT * FROM page_request_daily ORDER BY day,page'};
for(const [kind,sql]of Object.entries(queries)) {
  const baseline=local.prepare(sql).all(),current=(await query(api,target,sql)).results;
  for(const row of baseline) {
    const found=current.find(r=>kind==='daily'?r.day===row.day&&r.page===row.page:r.id===row.id);
    assert(found,'Existing row missing');
    if(kind==='daily'){assert(found.requests>=row.requests);if(phase==='after-migration')assert.equal(found.requests,row.requests);}
    else assert.equal(JSON.stringify(Object.fromEntries(Object.keys(row).map(k=>[k,found[k]]))),JSON.stringify(row),'Existing row changed');
  }
  evidence.preservation[kind]={baseline_rows:baseline.length,current_rows:current.length,all_existing_rows_preserved:true};
}
assert.deepEqual((await query(api,target,'PRAGMA foreign_key_check')).results,[]);
evidence.migrations=(await query(api,target,'SELECT name FROM d1_migrations ORDER BY id')).results.map(r=>r.name);
await writeFile(`verification/2026-11-12/${environment}-${phase}.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
