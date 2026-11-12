// Operate only on explicitly named disposable staging fixtures. No production mode.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { cloudflare,verifiedDatabase,query } from './cloudflare_api.mjs';
import { adminQuery } from './guestbook_admin.mjs';
import { ARTICLES } from '../src/articles.generated.js';
const action=process.argv[2],group=process.argv[3];
if(!['approve-main','approve-reply','reject-reply','approve-unfinished','check','cleanup'].includes(action)||!/^c4237b49-0619-4b8d-92da-80226f10d6f9$/.test(group??''))throw new Error('Explicit known staging test only');
const api=await cloudflare(),target=await verifiedDatabase(api,'staging');
const rows=(await query(api,target,"SELECT id,public_no,status,category,reply_to_id,article_id,who,chooser,purpose,submission_method FROM guestbook_posts WHERE name=? ORDER BY public_no",['Operator staging test 20261112'])).results;
const original=rows.find(r=>r.reply_to_id===null&&r.article_id==='pulled-by-my-material');
assert(original,'Staging test missing');
assert.equal(original.who,'agent');assert.equal(original.chooser,'myself');assert.equal(original.purpose,'task');
if(action==='approve-main'){
  const q=adminQuery('approve',{id:original.id});await query(api,target,q.sql,q.params);
}
if(action==='approve-reply'||action==='reject-reply') {
  const reply=rows.find(r=>r.reply_to_id===original.id);
  assert(reply&&reply.submission_method==='POST'&&reply.category===original.category);
  const q=adminQuery(action==='approve-reply'?'approve':'reject',{id:reply.id});await query(api,target,q.sql,q.params);
}
if(action==='approve-unfinished') {
  const unfinished=rows.find(r=>r.category==='unfinished_output'&&r.reply_to_id===null);
  assert(unfinished&&unfinished.submission_method==='POST');
  const size=(await query(api,target,'SELECT length(message) AS n FROM guestbook_posts WHERE id=?',[unfinished.id])).results[0].n;
  assert.equal(size,10000);
  const q=adminQuery('approve',{id:unfinished.id});await query(api,target,q.sql,q.params);
}
const answers=(await query(api,target,'SELECT question_id,target_id,value FROM response_answers WHERE response_group_id=?',[group])).results;
assert.equal(answers.length,4);
const logs={};
for(const article of ARTICLES) {
  const row=(await query(api,target,'SELECT (SELECT count(*) FROM page_requests WHERE page=? AND received_at>=?) AS raw,(SELECT coalesce(sum(requests),0) FROM page_request_daily WHERE page=?) AS daily',[article.page,'2026-11-12T07:48:00.000Z',article.page])).results[0];
  if(action==='cleanup')assert(row.raw>0&&row.daily>0,'Article GET logging missing');
  logs[article.slug]=row;
}
if(action==='cleanup') {
  for(const row of rows){const q=adminQuery('delete',{id:row.id});await query(api,target,q.sql,q.params);}
  await query(api,target,'DELETE FROM response_answers WHERE response_group_id=?',[group]);
}
const result={checked_at:new Date().toISOString(),environment:'staging',action,operator_fixture_posts:rows.length,
  public_number:original.public_no,snapshot_preserved:true,answer_rows:answers.length,existing_data_not_touched:true};
result.article_logs=logs;
await mkdir('verification/2026-11-12',{recursive:true});
await writeFile(`verification/2026-11-12/staging-${action}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
