// Only the new, recorded staging answer groups for the one-question review.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { cloudflare,verifiedDatabase,query } from './cloudflare_api.mjs';
const phase=process.argv[2];
const expected={
  'desktop-before':[[]],
  'desktop-who':[[['who','agent']]],
  'desktop-complete':[[['visit','first'],['who','agent']]],
  'mobile-before':[[['visit','first'],['who','agent']],[]],
  'mobile-who':[[['visit','first'],['who','agent']],[['who','human']]],
  'mobile-skip':[[['visit','first'],['who','agent']],[['who','human']]],
  'visit-before':[[['visit','first'],['who','agent']],[['who','human']],[]],
  'visit-only':[[['visit','first'],['who','agent']],[['who','human']],[['visit','not_sure']]],
  'cleanup':[[['visit','first'],['who','agent']],[['who','human']],[['visit','not_sure']]],
}[phase];
assert(expected,'Unknown phase');
const manifest=JSON.parse(await readFile('.cloudflare/private/visitor-questions-fixtures.json','utf8'));
assert(manifest.created_at.startsWith('2026-11-12'));
const groups=manifest.groups;
assert(groups.length===expected.length&&new Set(groups).size===groups.length);
assert(groups.every(g=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(g)));
const api=await cloudflare(),target=await verifiedDatabase(api,'staging');
const read=async group=>(await query(api,target,'SELECT question_id,target_id,value FROM response_answers WHERE response_group_id=? ORDER BY question_id,target_id',[group])).results;
const answers=await Promise.all(groups.map(read));
assert.deepEqual(answers,expected.map(rows=>rows.map(([question_id,value])=>({question_id,target_id:'site',value}))));
let removed=0;
if(phase==='cleanup') {
  for(const group of groups){removed+=(await query(api,target,'DELETE FROM response_answers WHERE response_group_id=?',[group])).meta.changes;assert.deepEqual(await read(group),[]);}
  assert.equal(removed,4);
}
const evidence={phase,environment:'staging',checked_at:new Date().toISOString(),answers_by_fixture:answers,removed_fixture_answers:removed,production_or_posts_modified:false};
await writeFile(`verification/2026-11-12-visitor-questions/answers-${phase}.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
