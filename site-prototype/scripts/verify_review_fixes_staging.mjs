// This review's disposable answer groups only; never production or post data.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { cloudflare,verifiedDatabase,query } from './cloudflare_api.mjs';
const phase=process.argv[2];
assert(['before','who-only','complete','cleanup'].includes(phase));
const manifest=JSON.parse(await readFile('.cloudflare/private/review-fixes-groups.json','utf8'));
const groups=manifest.groups;
assert(groups.length>=1&&groups.length<=2&&new Set(groups).size===groups.length);
assert(groups.every(g=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(g)));
assert(manifest.created_at.startsWith('2026-11-12'));
const api=await cloudflare(),target=await verifiedDatabase(api,'staging');
const own=async group=>(await query(api,target,'SELECT question_id,target_id,value FROM response_answers WHERE response_group_id=? ORDER BY question_id,target_id',[group])).results;
const answers=await Promise.all(groups.map(own));
if(phase==='before')assert(answers.every(rows=>rows.length===0));
if(phase==='who-only')assert.deepEqual(answers[0],[{question_id:'who',target_id:'site',value:'agent'}]);
if(phase==='complete') {
  assert.equal(groups.length,2);
  assert.deepEqual(answers[0],[
    {question_id:'chooser',target_id:'site',value:'other'},
    {question_id:'purpose',target_id:'site',value:'not_sure'},
    {question_id:'reaction',target_id:'pulled-by-my-material',value:'question'},
    {question_id:'visit',target_id:'site',value:'not_sure'},
    {question_id:'who',target_id:'site',value:'other'},
  ]);
  assert.deepEqual(answers[1],[{question_id:'visit',target_id:'site',value:'first'},{question_id:'who',target_id:'site',value:'human'}]);
}
let removed=0;
if(phase==='cleanup') {
  // Re-read and bound-check before deleting only the newly recorded groups.
  assert.equal(groups.length,2);assert.deepEqual(answers.map(rows=>rows.length),[5,2]);
  for(const group of groups) {
    const result=await query(api,target,'DELETE FROM response_answers WHERE response_group_id=?',[group]);
    removed+=result.meta.changes;
    assert.deepEqual(await own(group),[]);
  }
  assert.equal(removed,7);
}
const evidence={environment:'staging',phase,checked_at:new Date().toISOString(),fixture_groups:groups.length,
  answers_by_fixture:answers,removed_fixture_answers:removed,production_or_posts_modified:false};
await writeFile(`verification/2026-11-12-review-fixes/answers-${phase}.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
