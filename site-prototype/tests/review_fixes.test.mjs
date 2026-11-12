import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { ARTICLES } from '../src/articles.generated.js';
import { database } from './sqlite_fixture.mjs';
import { responseState } from '../src/participation.js';

const origin='https://review.invalid',secret='synthetic-review-fixture-secret-only';
const links=html=>[...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
  .map(m=>({url:m[1].replace(/&amp;/g,'&'),label:m[2]}));
const find=(html,label)=>{const match=links(html).find(l=>l.label===label);assert(match,'Missing '+label);return match.url;};
const changes=html=>links(html).filter(l=>l.label==='Change response').map(l=>new URL(l.url,origin));
async function fixture() {
  const db=database(),s=await responseState(secret,'');
  const env={DB:db,PARTICIPATION_SECRET:secret,SITE_ORIGIN:origin};
  const get=path=>worker.fetch(new Request(new URL(path,origin)),env,{waitUntil(){}});
  const page=async path=>(await get(path)).text();
  const url=(path,params={})=>path+'?'+new URLSearchParams({state:s.token,...params});
  const results=(back='home')=>page(url('/responses.html',{back}));
  const answer=(question,value,article='')=>get(url('/respond',{question,value,article,edit:'1'}));
  const count=()=>db.sqlite.prepare('SELECT count(*) AS n FROM response_answers').get().n;
  return {db,s,get,page,url,results,answer,count};
}

test('HOME saves Who then visit in one unit and reaches Responses without counting retries',async()=>{
  const f=await fixture(),home=await f.page(f.url('/'));
  assert(home.indexOf('<h2>Who are you?')<home.indexOf('<h2>Have you been here before?'));
  let response=await f.get(find(home,'Agent'));
  let html=await f.page(response.headers.get('location'));
  assert(html.includes('<h1>Have you been here before?'));
  response=await f.get(find(html,'First visit'));
  const destination=new URL(response.headers.get('location'),origin);
  assert.equal(destination.pathname,'/responses.html');assert.equal(destination.hash,'#visit');
  assert.equal(destination.searchParams.get('state'),f.s.token);
  assert.equal(f.count(),2);
  await f.get(find(html,'First visit'));await f.results();assert.equal(f.count(),2);
  assert.equal(f.db.sqlite.prepare('SELECT count(DISTINCT response_group_id) AS n FROM response_answers').get().n,1);
});

test('HOME preserves either partial answer on skip and returns to Home when both are unanswered',async()=>{
  for(const [label,question,next]of [['Agent','who','Have you been here before?'],['Not sure','visit','Who are you?']]) {
    const f=await fixture(),home=await f.page(f.url('/'));
    const response=await f.get(find(home,label)),html=await f.page(response.headers.get('location'));
    assert(html.includes('<h1>'+next));
    const skip=new URL(find(html,'Continue without answering'),origin);
    assert.equal(skip.pathname,'/responses.html');assert.equal(skip.hash,'#'+question);assert.equal(f.count(),1);
  }
  const f=await fixture(),html=await f.page(f.url('/participate',{home:'1'}));
  assert.equal(new URL(find(html,'Continue without answering'),origin).pathname,'/');assert.equal(f.count(),0);
});

test('unanswered, missing and invalid state show all aggregates but no Change response links',async()=>{
  const f=await fixture();
  for(const path of ['/responses.html',f.url('/responses.html')]) {
    const html=await f.page(path);assert(html.includes('Article reactions'));assert.equal(changes(html).length,0);
    assert.equal(links(html).filter(l=>ARTICLES.some(a=>a.title===l.label)).length,4);
  }
  await f.answer('who','other');assert.equal(changes(await f.results()).length,1);
  assert.equal(changes(await f.page('/responses.html?'+new URLSearchParams({state:f.s.token+'x'}))).length,0);
  assert.equal(f.count(),1);
});

test('Responses and lists share article entrances; unanswered and partially answered flows preserve destination and context',async()=>{
  const f=await fixture();
  for(const article of ARTICLES) {
    const results=await f.results(article.section),list=await f.page(f.url('/'+article.section+'.html'));
    const entry=find(results,article.title);assert.equal(entry,find(list,article.title));
    const parsed=new URL(entry,origin);assert.equal(parsed.pathname,'/participate');
    assert.equal(parsed.searchParams.get('article'),article.slug);assert.equal(parsed.searchParams.get('to'),article.path);
    const question=await f.page(entry);assert(question.includes('<h1>Who are you?'));
    const skip=new URL(find(question,'Continue without answering'),origin);
    assert.equal(skip.pathname,article.path);assert.equal(skip.searchParams.get('state'),f.s.token);
    assert.equal(skip.searchParams.get('back'),article.section);assert.equal(skip.searchParams.get('source'),article.section);
  }
  await f.answer('who','agent');
  let html=await f.results('muse');assert.deepEqual(changes(html).map(u=>u.searchParams.get('question')),['who']);
  const article=ARTICLES.find(a=>a.section==='research'),entry=find(html,article.title);
  html=await f.page(entry);assert(html.includes('<h1>Who chose to visit this page?'));
  assert((await f.page(entry)).includes('<h1>Who chose to visit this page?'));
  let response=await f.get(find(html,'Myself'));html=await f.page(response.headers.get('location'));
  assert(html.includes('<h1>Why are you here?'));
  const skip=new URL(find(html,'Continue without answering'),origin);
  assert.equal(skip.pathname,article.path);assert.equal(skip.searchParams.get('article'),article.slug);
  assert.equal(skip.searchParams.get('back'),'muse');assert.equal(skip.searchParams.get('source'),'research');
  assert((await f.page(entry)).includes('<h1>Why are you here?'));assert.equal(f.count(),2);
});

test('fully answered Responses entries go straight to the correct article; direct URLs and sitemap remain direct',async()=>{
  const f=await fixture();
  for(const [q,v]of [['who','other'],['chooser','other'],['purpose','not_sure']])await f.answer(q,v);
  const html=await f.results('research');
  for(const article of ARTICLES) {
    const response=await f.get(find(html,article.title));assert.equal(response.status,303);
    const to=new URL(response.headers.get('location'),origin);assert.equal(to.pathname,article.path);
    assert.equal(to.searchParams.get('state'),f.s.token);assert.equal(to.searchParams.get('back'),'research');
    const direct=await f.get(article.path);assert.equal(direct.status,200);assert(!direct.headers.has('location'));
  }
  const sitemap=await f.page('/sitemap.xml');assert(!sitemap.includes('responses.html'));assert(!sitemap.includes('participate'));
  for(const article of ARTICLES)assert(sitemap.includes(origin+article.path));assert.equal(f.count(),3);
});

test('Other/Not sure and one article reaction are changeable only for their saved targets; changes update the same row',async()=>{
  const f=await fixture(),article=ARTICLES[0];
  for(const [q,v]of [['who','other'],['visit','not_sure'],['chooser','other'],['purpose','not_sure']])await f.answer(q,v);
  await f.answer('reaction','made_sense',article.slug);
  let html=await f.results(),available=changes(html);assert.equal(available.length,5);
  assert.deepEqual(available.filter(u=>u.searchParams.get('question')==='reaction').map(u=>u.searchParams.get('article')),[article.slug]);
  for(const u of available)assert.equal(u.searchParams.get('state'),f.s.token);
  const who=available.find(u=>u.searchParams.get('question')==='who');html=await f.page(who.pathname+who.search);
  const choice=find(html,'Human');await f.get(choice);await f.get(choice);assert.equal(f.count(),5);
  assert.equal(f.db.sqlite.prepare("SELECT value FROM response_answers WHERE question_id='who'").get().value,'human');
  const reaction=available.find(u=>u.searchParams.get('question')==='reaction');html=await f.page(reaction.pathname+reaction.search);
  await f.get(find(html,'It raised a question.'));assert.equal(f.count(),5);
  assert.equal(f.db.sqlite.prepare("SELECT value FROM response_answers WHERE question_id='reaction'").get().value,'question');
  html=await f.results();assert.equal(changes(html).length,5);assert.equal(f.count(),5);
});
