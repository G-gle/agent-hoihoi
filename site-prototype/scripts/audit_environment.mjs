import { mkdir, writeFile } from 'node:fs/promises';
import { cloudflare, query, verifiedDatabase } from './cloudflare_api.mjs';

const api = await cloudflare();
const audit = { checked_at: new Date().toISOString(), environments: {} };
for (const environment of ['staging','production']) {
  const target = await verifiedDatabase(api, environment);
  const settings = await api(`workers/scripts/${target.worker}/settings`);
  const bindings = settings.bindings.map(binding => ({ name: binding.name, type: binding.type,
    ...(binding.type === 'd1' ? { id: binding.id } : {}),
    ...(binding.type === 'plain_text' && /^ENABLE_/.test(binding.name) ? { text: binding.text } : {}) }));
  const db = bindings.find(b => b.name === 'DB');
  if (db?.type !== 'd1' || db.id !== target.id) throw new Error('Worker binding mismatch');
  const deployments = await api(`workers/scripts/${target.worker}/deployments`);
  const schema = await query(api, target, "SELECT name,type,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
  const migrations = await query(api, target, 'SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
  const counts = await query(api, target, 'SELECT (SELECT count(*) FROM guestbook_posts) AS posts,(SELECT count(*) FROM page_requests) AS raw_rows,(SELECT count(*) FROM page_request_daily) AS daily_rows,(SELECT sum(requests) FROM page_request_daily) AS requests');
  audit.environments[environment] = { worker: target.worker, database: target.database, bindings,
    deployment: deployments.deployments?.[0], migrations: migrations.results, schema: schema.results, counts: counts.results[0],
    observability: settings.observability };
}
await mkdir('verification/2026-11-12', { recursive: true });
await writeFile('verification/2026-11-12/environment-before.json', JSON.stringify(audit, null, 2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(audit.environments).map(([key, value]) => [key, { deployment: value.deployment?.versions, migrations: value.migrations.map(m=>m.name), counts: value.counts, secrets: value.bindings.filter(b=>b.type==='secret_text').map(b=>b.name) }]))));
