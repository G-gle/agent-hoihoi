import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';
import { database } from './sqlite_fixture.mjs';
import { ARTICLES } from '../src/articles.generated.js';
import { INTRO } from '../src/site_copy.js';
import { LIMITS, responseState, sign, verify, validateText } from '../src/participation.js';
import { adminQuery } from '../scripts/guestbook_admin.mjs';
import { buildQuery } from '../scripts/observation_admin.mjs';

const origin='https://test.invalid', secret='synthetic-secret-for-local-tests-only';
const unescape=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const links=html=>[...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m=>({url:unescape(m[1]),label:unescape(m[2])}));
function fixture() {
  const db=database(),tasks=[];
  const env={DB:db,PARTICIPATION_SECRET:secret,SITE_ORIGIN:origin,ENABLE_GUESTBOOK:'true',ENABLE_OBSERVATION:'true',
    ASSETS:{fetch:async()=>new Response('asset')}};
  const ctx={waitUntil(task){tasks.push(task);}};
  const fetch=(path,options={})=>worker.fetch(new Request(new URL(path,origin),options),env,ctx);
  const done=async()=>{while(tasks.length)await Promise.all(tasks.splice(0));};
  const form=async(path='/leave-a-message.html')=>{
    const response=await fetch(path),html=await response.text();assert.equal(response.status,200);
    const values=Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],unescape(m[2])]));
    return {html,...values};
  };
  const send=(form,message='Operator test',name='',method='POST')=>{
    const params=new URLSearchParams({submission_id:form.submission_id,state:form.state,message,name});
    return fetch(method==='GET'?'/send?'+params:'/send',method==='GET'?{}:{method,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
  };
  return {db,env,fetch,form,send,done,ctx};
}

test('migration preserves existing text, decisions and all observation columns; reply deletion is SET NULL and numbers never reused',async()=>{
  const db=database({migrate:false}),s=db.sqlite;
  const id1=crypto.randomUUID(),id2=crypto.randomUUID();
  s.prepare("INSERT INTO guestbook_posts VALUES(?,?,?,?,?)").run(id1,'2026-10-20T00:00:00Z','旧名','既存本文\n😀','approved');
  s.prepare("INSERT INTO guestbook_posts VALUES(?,?,?,?,?)").run(id2,'2026-10-21T00:00:00Z','','pending text','pending');
  s.exec("INSERT INTO page_request_daily VALUES('2026-10-20','agent_traps',7); INSERT INTO page_requests VALUES(8,'2026-10-20T01:02:03Z','2026-10-20','agent_traps',404,'UA','example.com')");
  const posts=s.prepare('SELECT * FROM guestbook_posts ORDER BY id').all(),raw=s.prepare('SELECT * FROM page_requests').all(),daily=s.prepare('SELECT * FROM page_request_daily').all();
  db.apply('0005_participation.sql');db.apply('0006_registered_article_logs.sql');
  assert.deepEqual(s.prepare('SELECT id,created_at,name,message,status FROM guestbook_posts ORDER BY id').all(),posts);
  assert.deepEqual(s.prepare('SELECT * FROM page_requests').all(),raw);assert.deepEqual(s.prepare('SELECT * FROM page_request_daily').all(),daily);
  assert.deepEqual(s.prepare('PRAGMA foreign_key_check').all(),[]);
  s.prepare("UPDATE guestbook_posts SET reply_to_id=?,category='unfinished_output' WHERE id=?").run(id1,id2);
  const no=s.prepare('SELECT max(public_no) AS n FROM guestbook_posts').get().n;
  s.prepare('DELETE FROM guestbook_posts WHERE id=?').run(id1);
  assert.equal(s.prepare('SELECT reply_to_id FROM guestbook_posts WHERE id=?').get(id2).reply_to_id,null);
  s.prepare('DELETE FROM guestbook_posts WHERE id=?').run(id2);
  s.prepare("INSERT INTO guestbook_posts(id,created_at,name,message) VALUES(?,'now','x','y')").run(crypto.randomUUID());
  assert(s.prepare('SELECT public_no FROM guestbook_posts').get().public_no>no);
});

test('signed state is purpose-bound, tamper-resistant and has no automatic expiry',async()=>{
  const state=await responseState(secret,'');assert.equal((await responseState(secret,state.token)).group,state.group);
  assert.equal((await responseState(secret,state.token+'x')).invalid,true);
  assert.equal(await verify(secret,'submission',state.token),null);
});

test('home and lists share copy, have ordered entrances and preserve all four authors, bodies and references',async()=>{
  const f=fixture(),home=await(await f.fetch('/')).text();
  assert(!home.includes('Pulled by My Material'));assert(home.includes(INTRO.muse.replace(/'/g,'&#39;')));
  assert(home.indexOf('<h2>Muse')<home.indexOf('<h2>Unfinished'));assert(home.indexOf('<h2>Unfinished')<home.indexOf('<h2>Research'));
  for(const a of ARTICLES){
    const response=await f.fetch(a.path),html=await response.text();assert.equal(response.status,200);assert(html.includes('What did this leave you with?'));
    assert.equal((html.match(/<h1>/g)||[]).length,1);assert(!/<script\b/i.test(html));assert(!response.headers.has('set-cookie'));
    assert(html.includes(a.byline==='Muse'?'Muse':a.byline));assert(html.includes(a.html.split('\n')[0].slice(0,25)));
    assert.equal(response.headers.get('cache-control'),'no-store');assert(html.includes('rel="canonical"'));
  }
  const research=await(await f.fetch('/research.html')).text();assert(research.indexOf('Owed, Approved')<research.indexOf('Which AI Agents'));
  for(const s of ['muse','research'])assert((await(await f.fetch('/'+s+'.html')).text()).includes(INTRO[s].replace(/'/g,'&#39;')));
  await f.done();
});

test('normal flow asks one unanswered question; skip applies to one movement and direct article URL stays direct',async()=>{
  const f=fixture(),form=await f.form(),state=form.state;
  const gate='/participate?'+new URLSearchParams({to:'/agent-traps.html',article:'agent-traps',state});
  let html=await(await f.fetch(gate)).text();assert(html.includes('<h1>Who are you?'));
  const skip=links(html).find(l=>l.label==='Continue without answering');
  assert.equal(new URL(skip.url,origin).pathname,'/agent-traps.html');
  assert.equal((await f.fetch(skip.url)).status,200);
  assert((await(await f.fetch(gate)).text()).includes('<h1>Who are you?'));
  let r=await f.fetch(links(html).find(l=>l.label==='Agent').url);assert.equal(r.status,303);
  html=await(await f.fetch(r.headers.get('location'))).text();assert(html.includes('<h1>Who chose to visit this page?'));
  r=await f.fetch(links(html).find(l=>l.label==='Myself').url);html=await(await f.fetch(r.headers.get('location'))).text();assert(html.includes('<h1>Why are you here?'));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM response_answers').get().n,2);
});

test('response retries do not increment, changes update one row, cross-tab distinguishes unanswered Who and Other',async()=>{
  const f=fixture(),{state}=await f.form();
  const answer=(question,value)=>f.fetch('/respond?'+new URLSearchParams({state,question,value,edit:'1'}));
  await answer('chooser','myself');await answer('chooser','myself');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM response_answers').get().n,1);
  let html=await(await f.fetch('/responses.html?'+new URLSearchParams({state}))).text();assert(html.includes('Who unanswered'));
  assert.match(html,/<th scope="row">Myself<\/th><td>0<\/td><td>0<\/td><td>0<\/td><td>1<\/td>/);
  await answer('who','other');await answer('purpose','other');await answer('purpose','not_sure');
  html=await(await f.fetch('/responses.html?'+new URLSearchParams({state}))).text();assert.match(html,/<th scope="row">Myself<\/th><td>0<\/td><td>0<\/td><td>1<\/td><td>0<\/td>/);
  assert.equal(f.db.sqlite.prepare("SELECT value FROM response_answers WHERE question_id='purpose'").get().value,'not_sure');
  for(const a of ARTICLES){await f.fetch('/respond?'+new URLSearchParams({state,question:'reaction',value:'question',article:a.slug,back:a.section}));}
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM response_answers WHERE question_id='reaction'").get().n,4);
  const invalid=await f.fetch('/respond?'+new URLSearchParams({state:state+'x',question:'who',value:'agent'}));assert.equal(invalid.status,400);
  assert.equal(f.db.sqlite.prepare("SELECT value FROM response_answers WHERE question_id='who'").get().value,'other');
});

test('home partial answer can skip remaining question into responses; complete home flow shows results',async()=>{
  const f=fixture(),home=await(await f.fetch('/')).text(),agent=links(home).find(l=>l.label==='Agent');
  const r=await f.fetch(agent.url),html=await(await f.fetch(r.headers.get('location'))).text();
  assert(html.includes('<h3>Have you been here before?</h3>'));
  const skip=links(html).find(l=>l.label==='Continue without answering');assert.equal(new URL(skip.url,origin).pathname,'/responses.html');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM response_answers').get().n,1);
});

test('GET and POST retain whitespace, Japanese, emoji and newlines; pending receipt hides content and state reaches all steps',async()=>{
  for(const method of ['GET','POST']){
    const f=fixture(),form=await f.form('/leave-a-message.html?article=agent-traps&source=research');
    const text='  テスト😀\r\nsecond <line>  ',r=await f.send(form,text,'',method);assert.equal(r.status,303);
    const received=r.headers.get('location');assert.equal(new URL(received,origin).searchParams.get('state'),form.state);
    const row=f.db.sqlite.prepare('SELECT * FROM guestbook_posts').get();assert.equal(row.message,text.replace(/\r\n/g,'\n'));assert.equal(row.name,'Anonymous');assert.notEqual(row.id,row.receipt_id);
    let response=await f.fetch(received),html=await response.text();assert(html.includes('<h1>Message Received'));assert.equal(response.headers.get('x-robots-tag'),'noindex');assert(!html.includes('second &lt;line&gt;'));
    const status=links(html).find(l=>l.label==='Check submission status');response=await f.fetch(status.url);html=await response.text();assert(html.includes('Pending review'));assert(!html.includes('second &lt;line&gt;'));
    assert(html.includes(form.state));assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert(!(await(await f.fetch('/guestbook.html')).text()).includes('second &lt;line&gt;'));
    for(const action of ['reject','approve']){const q=adminQuery(action,{id:row.id});f.db.sqlite.prepare(q.sql).all(...q.params);}
    html=await(await f.fetch(status.url)).text();assert(html.includes('Published'));assert(html.includes('#message-'+row.public_no));
    assert((await(await f.fetch('/guestbook.html')).text()).includes('second &lt;line&gt;'));
    await f.done();
  }
});

test('empty, whitespace, over-limit and malformed inputs never save; valid received fields are retained and escaped',async()=>{
  const f=fixture(),form=await f.form();
  for(const [message,name,error] of [['','x','Please enter a message.'],[' \n\t ','','Please enter a message.'],['😀'.repeat(10001),'','10,000 characters'],['<message>','名'.repeat(101),'100 characters']]){
    const r=await f.send(form,message,name),html=await r.text();assert.equal(r.status,400);assert(html.includes(error));assert(html.includes(name));assert(html.includes(message.replace(/</g,'&lt;').replace(/>/g,'&gt;')));
  }
  for(const raw of ['message=%ff','message=x&message=y','message=x&unknown=z'])assert.equal((await f.fetch('/send?'+raw)).status,400);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM guestbook_posts').get().n,0);
  assert.equal(validateText('','😀'.repeat(10000)),'');
});

test('concurrent retries, lost response and expired saved lookup give one post, one receipt and one notification scheduling',async()=>{
  const f=fixture(),form=await f.form(),originalLog=console.log,logs=[];
  console.log=value=>logs.push(value);
  try{
    const results=await Promise.all([f.send(form),f.send(form),f.send(form)]);assert(results.every(r=>r.status===303));
    assert.equal(new Set(results.map(r=>r.headers.get('location'))).size,1);
    await f.done();assert.equal(logs.filter(x=>String(x).includes('guestbook_notification')).length,1);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM guestbook_posts').get().n,1);
    const token=await verify(secret,'submission',form.submission_id),expired=await sign(secret,'submission',{...token,t:token.t-9999});
    const retried=await f.send({...form,submission_id:expired});assert.equal(retried.status,303);assert.equal(retried.headers.get('location'),results[0].headers.get('location'));
    const changed=await f.send(form,'changed');assert.equal(changed.status,409);const html=await changed.text();assert(!html.includes(`value="${form.submission_id}"`));assert(html.includes('changed'));
    f.db.sqlite.exec('UPDATE guestbook_gate SET next_allowed_at=0');
    const other=await f.form();f.db.loseWriteResponse=true;
    const lost=await f.send(other,'different ID');assert.equal(lost.status,303);f.db.loseWriteResponse=false;
    assert.equal((await f.send(other,'different ID')).headers.get('location'),lost.headers.get('location'));
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM guestbook_posts').get().n,2);
    // Confirming our own committed UUID schedules once, then retry stays silent.
    await f.done();assert.equal(logs.filter(x=>String(x).includes('guestbook_notification')).length,2);
  }finally{console.log=originalLog;}
});

test('unsaved expiry and missing ID preserve inputs; uncertain storage keeps original submission ID',async()=>{
  const f=fixture(),form=await f.form(),token=await verify(secret,'submission',form.submission_id);
  const expired=await sign(secret,'submission',{...token,t:token.t-2000});
  for(const id of ['',expired]){const response=await f.send({...form,submission_id:id},'keep me');assert.equal(response.status,400);const html=await response.text();assert(html.includes('keep me'));assert(html.includes('updated form'));}
  f.db.failRead=true;
  let r=await f.send(form,'keep me'),html=await r.text();assert.equal(r.status,503);assert(html.includes('<h1>Submission Status Unknown'));assert(html.includes(form.submission_id));
  f.db.failRead=false;f.db.failWrite=true;
  r=await f.send(form,'keep me');html=await r.text();assert(html.includes('Submission Status Unknown'));assert(html.includes(form.submission_id));
});

test('receipt not found differs from query failure; direct completion never claims success; HEAD has no writes',async()=>{
  const f=fixture();
  for(const path of ['/received/not-a-receipt','/receipt/missing']){const r=await f.fetch(path);assert.equal(r.status,404);assert.equal(r.headers.get('x-robots-tag'),'noindex');assert((await r.text()).includes('Receipt Not Found'));}
  assert(!(await(await f.fetch('/guestbook-complete.html')).text()).includes('Message Received'));
  f.db.failRead=true;const r=await f.fetch('/receipt/'+'x'.repeat(43));assert.equal(r.status,503);assert((await r.text()).includes('temporarily unavailable'));f.db.failRead=false;
  for(const path of ['/send?message=test','/respond?question=who&value=agent'])assert.equal((await f.fetch(path,{method:'HEAD'})).status,200);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM response_answers').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM guestbook_posts').get().n,0);
});

test('confirmed SQL rejection differs from lost/unknown outcome and retains text and submission identity',async()=>{
  const f=fixture(),form=await f.form();
  f.db.sqlite.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON guestbook_posts BEGIN SELECT RAISE(ABORT,'synthetic rejection'); END");
  const r=await f.send(form,'retain this input'),html=await r.text();
  assert.equal(r.status,503);assert(html.includes('<h1>Message Not Saved'));assert(html.includes('retain this input'));assert(html.includes(form.submission_id));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM guestbook_posts').get().n,0);
});

test('existing millisecond acceptance gate remains compatible and enforces a real 15-second interval',async()=>{
  const f=fixture(),form=await f.form();
  f.db.sqlite.prepare('UPDATE guestbook_gate SET next_allowed_at=?').run(Date.now()-1000);
  const accepted=await f.send(form,'old gate unit regression');assert.equal(accepted.status,303);
  const gate=f.db.sqlite.prepare('SELECT next_allowed_at FROM guestbook_gate').get().next_allowed_at;
  assert(gate>Date.now()+14000&&gate<=Date.now()+15000);
  assert.equal((await f.send(await f.form(),'new request within gate')).status,429);
  assert.equal((await f.send(form,'old gate unit regression')).status,303);
});

test('reply inherits unfinished tag across Guestbook and parent deletion preserves child, tag, receipt and snapshots',async()=>{
  const f=fixture(),form=await f.form('/leave-a-message.html?category=unfinished_output&source=unfinished');
  await f.send(form,'parent');const parent=f.db.sqlite.prepare('SELECT * FROM guestbook_posts').get();
  f.db.sqlite.prepare("UPDATE guestbook_posts SET status='approved' WHERE id=?").run(parent.id);f.db.sqlite.exec('UPDATE guestbook_gate SET next_allowed_at=0');
  const reply=await f.form('/leave-a-message.html?'+new URLSearchParams({reply:parent.id,source:'guestbook',state:form.state}));
  await f.send(reply,'reply');const child=f.db.sqlite.prepare('SELECT * FROM guestbook_posts WHERE reply_to_id=?').get(parent.id);assert.equal(child.category,'unfinished_output');
  f.db.sqlite.prepare("UPDATE guestbook_posts SET status='approved' WHERE id=?").run(child.id);
  for(const path of ['/guestbook.html','/unfinished-outputs.html']){const html=await(await f.fetch(path)).text();assert(html.includes('parent'));assert(html.includes('reply'));assert(html.includes('In reply to Message #'+parent.public_no));}
  const q=adminQuery('delete',{id:parent.id});f.db.sqlite.prepare(q.sql).all(...q.params);
  assert.equal(f.db.sqlite.prepare('SELECT reply_to_id FROM guestbook_posts').get().reply_to_id,null);
  assert.equal((await f.fetch('/receipt/'+parent.receipt_id)).status,404);assert.equal((await f.fetch('/receipt/'+child.receipt_id)).status,200);
});

test('discovery has correct origin, direct article URLs, no Responses sitemap entry, and permits receipt noindex retrieval',async()=>{
  const f=fixture(),sitemap=await(await f.fetch('/sitemap.xml')).text(),robots=await(await f.fetch('/robots.txt')).text();
  for(const a of ARTICLES)assert(sitemap.includes(origin+a.path));assert(!sitemap.includes('responses.html'));assert(!sitemap.includes('participate'));
  assert(!robots.includes('Disallow: /receipt'));assert(robots.includes('User-agent: *\nAllow: /'));
  const r=await f.fetch('/responses.html');assert(!r.headers.has('x-robots-tag'));
});

test('real article GET records raw + daily data and CLI filters by registered ID before LIMIT',async()=>{
  const f=fixture(),a=ARTICLES.find(a=>a.section==='muse');await f.fetch(a.path);await f.done();
  assert.equal(f.db.sqlite.prepare('SELECT requests FROM page_request_daily WHERE page=?').get(a.page).requests,1);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM page_requests WHERE page=?').get(a.page).n,1);
  const sql=buildQuery('recent',{from:'2026-11-12',to:'2026-11-12',article:a.slug,limit:'1'});
  assert(sql.indexOf("page = '"+a.page+"'")<sql.indexOf('LIMIT'));
});
