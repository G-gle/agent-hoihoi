// Isolated real Workers/D1 runtime. All data is synthetic and ephemeral.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(realpathSync(path.join(root,'node_modules/wrangler/package.json')));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {build}=require('esbuild');
const dir=path.join(root,'.cloudflare/renew-runtime');
await mkdir(dir,{recursive:true});
for(const name of ['src','scripts','content'])await cp(path.join(root,name),path.join(dir,name),{recursive:true});
await writeFile(path.join(dir,'package.json'),'{"type":"module"}\n');
await writeFile(path.join(dir,'content/articles/registration-fixture.md'),`---
section: research
number: 999
slug: registration-fixture
title: Registration fixture
summary: A synthetic test of the normal article registration path.
date: "2026-11-12"
byline: Operator test
---

This is a disposable local fixture.
`);
const py=process.env.PYTHON_BIN||'python';
const built=spawnSync(py,[path.join(dir,'scripts/build_articles.py')],{encoding:'utf8',windowsHide:true});
assert.equal(built.status,0,'Normal manuscript build failed');
const bundled=await build({entryPoints:[path.join(dir,'src/worker.js')],bundle:true,format:'esm',platform:'browser',write:false});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,
  compatibilityDate:'2026-10-21',host:'127.0.0.1',port:8787,d1Databases:['DB'],
  bindings:{PARTICIPATION_SECRET:'synthetic-runtime-test-secret-at-least-32',SITE_ORIGIN:'http://127.0.0.1:8787',ENABLE_GUESTBOOK:'true',ENABLE_OBSERVATION:'true'},
  serviceBindings:{ASSETS:async request=>{try{return new Response(await readFile(path.join(root,'public',new URL(request.url).pathname)),{headers:{'Content-Type':request.url.endsWith('.css')?'text/css':'text/html'}});}catch{return new Response('Not found',{status:404});}}},
}));
const url=await mf.ready;
const db=await mf.getD1Database('DB');
const count=async table=>(await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n;
try {
  for(const name of ['0001_environment_check.sql','0002_page_requests.sql','0003_guestbook.sql','0004_article_page_requests.sql','0005_participation.sql','0006_registered_article_logs.sql']) {
    const statements=(await readFile(path.join(root,'migrations',name),'utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(sql=>db.prepare(sql)));
  }
  const get=p=>fetch(new URL(p,url),{redirect:'manual'});
  const unescape=s=>s.replace(/&amp;/g,'&');
  const form=async()=>{
    const html=await(await get('/leave-a-message.html')).text();
    return Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],unescape(m[2])]));
  };
  const send=(f,message,method='POST',pad=0)=>{
    const fields=new URLSearchParams({...f,message,name:''});
    if(pad)fields.set('name',' '.repeat(pad));
    return fetch(new URL(method==='GET'?'/send?'+fields:'/send',url),{method,redirect:'manual',...(method==='POST'?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fields.toString()}:{})});
  };
  const f=await form();
  const simultaneous=await Promise.all(Array.from({length:6},()=>send(f,'Operator local concurrency test 😀\n日本語')));
  assert(simultaneous.every(r=>r.status===303));assert.equal(new Set(simultaneous.map(r=>r.headers.get('location'))).size,1);assert.equal(await count('guestbook_posts'),1);
  const receipt=await get(simultaneous[0].headers.get('location'));assert.equal(receipt.status,200);assert.equal(receipt.headers.get('x-robots-tag'),'noindex');
  const saved=await db.prepare('SELECT id FROM guestbook_posts').first();
  await db.prepare("UPDATE guestbook_posts SET status='approved' WHERE id=?").bind(saved.id).run();
  assert((await(await get('/guestbook.html')).text()).includes('Operator local concurrency test'));
  await db.prepare('UPDATE guestbook_gate SET next_allowed_at=0').run();
  assert.equal((await send(await form(),'😀'.repeat(10000))).status,303);
  await db.prepare('UPDATE guestbook_gate SET next_allowed_at=0').run();
  const edge=await form(),base=new URLSearchParams({...edge,message:'日本語😀\n',name:''}).toString();
  // ASCII spaces in a name normalize to blank: pad transport bytes while
  // keeping the accepted name and message within their character limits.
  const padding=131072-Buffer.byteLength(base);
  assert.equal((await send(edge,'日本語😀\n','POST',padding)).status,303);
  const over=await send(await form(),'keep input','POST',131073);assert.equal(over.status,413);assert((await over.text()).includes('keep input'));
  await db.prepare('UPDATE guestbook_gate SET next_allowed_at=0').run();
  const gf=await form(),prefix=new URL('/send?'+new URLSearchParams({...gf,message:'',name:''}),url).href;
  const getPad=15000-Buffer.byteLength(prefix);
  const atLimit=await send(gf,'x'.repeat(9000),'GET',getPad-9000);assert.equal(atLimit.status,303);
  const above=await send(await form(),'x'.repeat(9000),'GET',getPad-9000+1);assert.equal(above.status,414);
  const before=(await db.prepare("SELECT coalesce(sum(requests),0) AS n FROM page_request_daily WHERE page='research:registration-fixture'").first()).n;
  const article=await get('/research/registration-fixture.html');assert.equal(article.status,200);assert((await article.text()).includes('disposable local fixture'));
  // waitUntil is observed by a following D1 request after the HTTP response.
  for(let n=0;n<20;n++) {
    const after=(await db.prepare("SELECT coalesce(sum(requests),0) AS n FROM page_request_daily WHERE page='research:registration-fixture'").first()).n;
    if(after>before)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal((await db.prepare("SELECT sum(requests) AS n FROM page_request_daily WHERE page='research:registration-fixture'").first()).n,before+1);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM page_requests WHERE page='research:registration-fixture'").first()).n,1);
  assert((await(await get('/sitemap.xml')).text()).includes('/research/registration-fixture.html'));
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  const evidence={runtime:'Miniflare / workerd + actual D1 + Node HTTP client',concurrent_requests:6,one_post_one_receipt:true,post_10000_emoji:true,
    post_encoded_bytes_at_limit:131072,post_above_limit_status:413,get_absolute_url_bytes_at_limit:15000,get_above_limit_status:414,
    registered_new_article_actual_get_raw_and_daily:true,cookies_used:false,javascript_required:false};
  await mkdir(path.join(root,'verification/2026-11-12'),{recursive:true});
  await writeFile(path.join(root,'verification/2026-11-12/local-runtime.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
  if(process.argv.includes('--serve')){console.log('Local preview ready: http://127.0.0.1:8787/');await new Promise(()=>{});}
}finally{await mf.dispose();}
