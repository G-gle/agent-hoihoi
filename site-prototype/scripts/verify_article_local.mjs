// Runs against an isolated Wrangler dev DB; never the existing local/staging DB.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = path.join(root,"verification/2026-10-25-article-access");
const base = "http://127.0.0.1:8788";
const query = sql => {
  const r = spawnSync(process.execPath,[path.join(root,"node_modules/wrangler/bin/wrangler.js"),"d1","execute","agent-hoihoi-staging-db","--local","--config","wrangler.jsonc","--persist-to",".cloudflare/article-http/state","--command",sql,"--json"],{cwd:root,encoding:"utf8",windowsHide:true});
  assert.equal(r.status,0,r.stderr); return JSON.parse(r.stdout).map(r=>r.results);
};
assert.equal(query("SELECT count(*) AS n FROM page_requests")[0][0].n,0,"Use a fresh isolated fixture path");
const events = [];
async function get(p,method="GET") {
  const start = new Date().toISOString();
  const response = await fetch(base+p,{method,redirect:"manual"}); await response.arrayBuffer();
  events.push({path:p,method,status:response.status,started_at:start}); return response.status;
}
for(const p of ["/","/index.html","/research.html","/observations.html","/guestbook.html","/agent-traps.html","/agents-and-traps.html"]) assert.equal(await get(p),200);
await Promise.all([1,2,3].map(i=>get("/agent-traps.html?fixture="+i)));
assert.equal(await get("/agents-and-traps.html?fixture=query"),200);
for(const p of ["/","/index.html","/research.html","/observations.html","/guestbook.html","/agent-traps.html","/agents-and-traps.html"]) for(const method of ["HEAD","POST","OPTIONS"]) await get(p,method);
for(const p of ["/about.html","/observations-detail.html","/guestbook-complete.html","/assets/style.css","/assets/guestbook.js","/robots.txt","/llms.txt","/sitemap.xml","/api/internal/db-check","/missing","/agent-traps","/agents-and-traps","/agent-traps.html/","/agents-and-traps.html/"]) await get(p);
// D1 CLI starts after the HTTP response tasks; polling checks committed counts.
const [raw,daily] = query("SELECT id,received_at,day,page,status FROM page_requests ORDER BY id; SELECT page,SUM(requests) AS requests FROM page_request_daily GROUP BY page ORDER BY page;");
assert.equal(raw.length,11);
assert(raw.every(r=>r.status===200));
assert.deepEqual(daily,[{page:"agent_traps",requests:4},{page:"agents_and_traps",requests:2},{page:"guestbook",requests:1},{page:"home",requests:2},{page:"observations",requests:1},{page:"research",requests:1}]);
// A 35-date fixture establishes all-period vs inclusive 30 UTC calendar days.
const today = new Date().toISOString().slice(0,10);
const oldDays = Array.from({length:35},(_,i)=>new Date(Date.parse(today)-86400000*(i+1)).toISOString().slice(0,10));
query("INSERT INTO page_request_daily VALUES "+oldDays.map(day=>`('${day}','research',3)`).join(",")+";");
const response = await fetch(base+"/observations-detail.html"); const html = await response.text();
assert.match(html,/data-count="research">106</); assert.match(html,/data-count="agent_traps">4</); assert.match(html,/data-count="agents_and_traps">2</);
assert.equal((html.match(/<tr><th scope="row">/g)||[]).length,30);
assert.match(html,/<td>—<\/td>/); assert(!html.includes(oldDays[34]+"</th>"));
await writeFile(path.join(dir,"local-detail.html"),html);
await writeFile(path.join(dir,"local-http.json"),JSON.stringify({checked_at:new Date().toISOString(),base,events,raw,daily,
  exact_recorded_gets:11,excluded_requests:events.length-11,fixture_dates:35,displayed_dates:30,cumulative_research:106,
  old_article_cells_unknown:true,foreign_key_check:query("PRAGMA foreign_key_check")[0]},null,2)+"\n");
console.log("PASS: isolated real HTTP + D1, 11 GET records, exact totals, method/path exclusions, 35 fixture dates / 30 displayed dates.");
