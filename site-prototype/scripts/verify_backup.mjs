import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const sha=value=>createHash('sha256').update(value).digest('hex');
const evidence={};
for(const environment of ['staging','production']) {
  const sql=await readFile(`.cloudflare/private/${environment}-before.sql`,'utf8');
  const db=new DatabaseSync(':memory:');
  db.exec(sql);db.exec('PRAGMA foreign_keys=ON');
  const snapshot=()=>({posts:db.prepare('SELECT id,created_at,name,message,status FROM guestbook_posts ORDER BY id').all(),
    raw:db.prepare('SELECT * FROM page_requests ORDER BY id').all(),daily:db.prepare('SELECT * FROM page_request_daily ORDER BY day,page').all()});
  const before=snapshot();
  db.exec('BEGIN');
  for(const name of ['0005_participation.sql','0006_registered_article_logs.sql'])db.exec(await readFile('migrations/'+name,'utf8'));
  db.exec('COMMIT');
  assert.deepEqual(snapshot(),before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  evidence[environment]={backup_sha256:sha(sql),backup_bytes:Buffer.byteLength(sql),restored_locally:true,migrated_locally:true,
    counts:Object.fromEntries(Object.entries(before).map(([table,rows])=>[table,rows.length])),
    before_after_sha256:Object.fromEntries(Object.entries(before).map(([table,rows])=>[table,sha(JSON.stringify(rows))])),preserved:true,foreign_key_check:[]};
  db.close();
}
await writeFile('verification/2026-11-12/backup-restore.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
