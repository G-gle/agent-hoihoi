// Read-only public deployment checks. Production posts are not created or deleted.
// No cookies/JS and no private URL output. Normal GET observation remains active.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cloudflare,query,verifiedDatabase } from './cloudflare_api.mjs';
import { PRODUCTION,STAGING,readTargetConfig } from './deployment_targets.mjs';
import { ARTICLES } from '../src/articles.generated.js';
const api=await cloudflare(),target=await verifiedDatabase(api,'production');await readTargetConfig('production');
const origin=new URL(PRODUCTION.url).origin;
const get=p=>fetch(new URL(p,origin),{redirect:'manual'});
const unescape=s=>s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const links=html=>[...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m=>({url:unescape(m[1]),label:unescape(m[2])}));
const follow=(html,label)=>{const found=links(html).find(l=>l.label===label);assert(found,'Required public link missing');return found.url;};
const evidence={checked_at:new Date().toISOString(),checkout_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),environment:'production',cookies_used:false,javascript_used:false,pages:{}};
// Compare database IDs, avoiding clock skew between this client and Workers.
const logCursor=(await query(api,target,'SELECT coalesce(max(id),0) AS n FROM page_requests')).results[0].n;
for(const p of ['/','/index.html','/muse.html','/research.html','/about.html','/unfinished-outputs.html','/guestbook.html','/responses.html',...ARTICLES.map(a=>a.path),'/llms.txt','/robots.txt','/sitemap.xml']){
  const response=await get(p),html=await response.text();assert.equal(response.status,200,'Public resource failed: '+p);
  if(p.endsWith('.html')||p==='/'){
    assert(!/<script\b/i.test(html));assert(html.includes('Home</a> · '));assert.equal(response.headers.get('cache-control'),'no-store');assert(!response.headers.has('set-cookie'));
  }
  if(p==='/')assert(!html.includes('Pulled by My Material'));
  if(p==='/muse.html')assert(html.includes('2026-11-12'));
  if(p==='/sitemap.xml'){assert(!html.includes('responses.html'));for(const article of ARTICLES)assert(html.includes(origin+article.path));}
  if(p==='/responses.html')assert(!response.headers.has('x-robots-tag'));
  evidence.pages[p]=response.status;
}
let home=await(await get('/')).text();
let html=await(await get(follow(home,'View Muse'))).text();
let response=await get(follow(html,'Pulled by My Material'));html=await response.text();assert(html.includes('<h1>Who are you?'));
response=await get(follow(html,'Continue without answering'));html=await response.text();assert(html.includes('<h1>Pulled by My Material'));
response=await get(follow(html,'Write a comment or question'));html=await response.text();assert(html.includes('<h1>Who are you?'));
response=await get(follow(html,'Continue without answering'));html=await response.text();assert(html.includes('<h1>Leave a message'));
const fields=Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],unescape(m[2])]));
assert(fields.state&&fields.submission_id);
evidence.production_write_test_performed=false;
evidence.production_write_test_omitted_reason='Automatic approval review rejected production test post creation/deletion; submission behavior verified in staging.';
evidence.state_preserved_to_post_form=true;
const invalidReceipt=await get('/receipt/not-a-valid-receipt');
assert.equal(invalidReceipt.status,404);assert.equal(invalidReceipt.headers.get('x-robots-tag'),'noindex');
assert((await invalidReceipt.text()).includes('Receipt Not Found'));
evidence.invalid_receipt_noindex=true;
const stage=await fetch(STAGING.url,{redirect:'manual'});evidence.staging_still_access_protected=stage.status===302&&new URL(stage.headers.get('location')).hostname.endsWith('.cloudflareaccess.com');assert(evidence.staging_still_access_protected);
const current=await api(`workers/scripts/${target.worker}/deployments`);evidence.worker_version=current.deployments[0].versions;
const logs={};
for(const article of ARTICLES){const row=(await query(api,target,'SELECT (SELECT count(*) FROM page_requests WHERE page=? AND id>?) AS raw,(SELECT coalesce(sum(requests),0) FROM page_request_daily WHERE page=?) AS daily',[article.page,logCursor,article.page])).results[0];assert(row.raw>0&&row.daily>0);logs[article.slug]=row;}
evidence.article_logs=logs;evidence.email_inbox_delivery_independently_confirmed=false;
await mkdir('verification/2026-11-12',{recursive:true});await writeFile('verification/2026-11-12/production-http.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
