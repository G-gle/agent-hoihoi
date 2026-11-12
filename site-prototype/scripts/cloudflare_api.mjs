import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STAGING, targetFor } from './deployment_targets.mjs';

// Capture credentials only in memory. Never print child output or API bodies
// on failure: they can contain configuration, submissions, or secrets.
export async function cloudflare() {
  const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const credential = JSON.parse(await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'auth', 'token', '--json'], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let data = '';
    child.stdout.on('data', part => { data += part; });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('Authentication unavailable')));
    child.on('close', code => code === 0 ? resolve(data) : reject(new Error('Authentication unavailable')));
  }));
  const headers = credential.type === 'api_key'
    ? { 'X-Auth-Key': credential.key, 'X-Auth-Email': credential.email }
    : { Authorization: `Bearer ${credential.token}` };
  return async function api(path, options = {}) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${STAGING.account}/${path}`, {
      ...options, headers: { ...headers, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(60000),
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(`Cloudflare operation failed (${response.status})`);
    return body.result;
  };
}

export async function verifiedDatabase(api, environment) {
  const target = targetFor(environment);
  const info = await api(`d1/database/${target.id}`);
  if (info.name !== target.database || info.uuid !== target.id) throw new Error('D1 target mismatch');
  return target;
}

export async function query(api, target, sql, params = []) {
  const result = await api(`d1/database/${target.id}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });
  if (result.length !== 1 || !result[0].success) throw new Error('D1 query failed');
  return result[0];
}
