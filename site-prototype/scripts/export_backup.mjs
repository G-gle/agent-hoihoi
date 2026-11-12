import { spawn } from 'node:child_process';
import { access,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cloudflare,verifiedDatabase } from './cloudflare_api.mjs';
import { readTargetConfig } from './deployment_targets.mjs';
const environment=process.argv[2],label=process.argv[3]??'prepublish';
if(!['staging','production'].includes(environment)||!['prepublish'].includes(label))throw new Error('Invalid backup target');
const api=await cloudflare(),target=await verifiedDatabase(api,environment);await readTargetConfig(environment);
const output=`.cloudflare/private/${environment}-${label}.sql`;
try{await access(output);throw new Error('Backup already exists; do not overwrite');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir('.cloudflare/private',{recursive:true});
const cli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,'d1','export',target.database,'--remote','--config',`.cloudflare/wrangler.${environment}.json`,'--output',output],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  // CLI output can include a signed backup URL. Deliberately discard it.
  child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
  child.on('error',()=>reject(new Error('Backup could not start')));child.on('close',code=>code===0?resolve():reject(new Error('Backup failed')));
});
console.log(`${environment}: SQL backup stored privately; no download URL or data printed`);
