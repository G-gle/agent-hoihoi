import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readdir, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { STAGING, PRODUCTION, targetFor, adminTarget, validateTarget } from "../scripts/deployment_targets.mjs";
import { buildQuery } from "../scripts/observation_admin.mjs";

const source = fileURLToPath(new URL("../", import.meta.url));
const argsFor = (target, env = []) => [...env, "--url", target.url, "--account-id", target.account, "--database-id", target.id];
function run(root, script, args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args],
    { cwd: root, encoding: "utf8", windowsHide: true });
}
async function files(dir) {
  const result = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) for (const [k, v] of Object.entries(await files(path.join(dir, e.name)))) result[e.name + "/" + k] = v;
    else result[e.name] = (await readFile(path.join(dir, e.name))).toString("base64");
  }
  return result;
}
async function isolated(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "hoihoi-environments-"));
  try {
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    for (const dir of ["public", "scripts", "src"]) await cp(path.join(source, dir), path.join(root, dir), { recursive: true });
    return await fn(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("environment guards reject missing selection, mixed targets, local production and production clearing", () => {
  assert.notEqual(PRODUCTION.id, STAGING.id);
  for (const env of [undefined, "", "prod", "Production"]) assert.throws(() => targetFor(env));
  assert.throws(() => adminTarget("production", false));
  assert.equal(adminTarget("production", true), PRODUCTION);
  for (const [env, target] of [["staging", STAGING], ["production", PRODUCTION]]) {
    const config = { name: target.worker, account_id: target.account,
      d1_databases: [{ binding: "DB", database_name: target.database, database_id: target.id }] };
    validateTarget(config, env);
    assert.throws(() => validateTarget(config, env === "staging" ? "production" : "staging"));
    for (const field of ["name", "account_id"]) assert.throws(() => validateTarget({ ...config, [field]: "other" }, env));
    for (const field of ["binding", "database_name", "database_id"]) {
      assert.throws(() => validateTarget({ ...config, d1_databases: [{ ...config.d1_databases[0], [field]: "other" }] }, env));
    }
  }
  assert.throws(() => buildQuery("clear-staging", { confirm: STAGING.database }, Date.now(), "production"));
});

test("management CLIs fail before authentication on ambiguous or forbidden production commands", () => {
  for (const [script, args] of [
    ["guestbook_admin.mjs", ["pending"]],
    ["guestbook_admin.mjs", ["pending", "--env", "production"]],
    ["guestbook_admin.mjs", ["pending", "--env", "staging", "--env", "production", "--remote"]],
    ["guestbook_admin.mjs", ["approve", "--env", "production", "--remote", "--id", "invalid"]],
    ["observation_admin.mjs", ["recent", "--remote"]],
    ["observation_admin.mjs", ["recent", "--env", "staging", "--env", "production", "--remote"]],
    ["observation_admin.mjs", ["clear-staging", "--env", "production", "--remote", "--confirm", STAGING.database]],
  ]) assert.equal(run(source, script, args).status, 1, script + " " + args.join(" "));
});

test("prepare retains default staging bytes and all source assets while separating production outputs", async () => isolated(async root => {
  const original = await files(path.join(root, "public"));
  assert.equal(run(root, "prepare_cloudflare.mjs", argsFor(STAGING)).status, 0);
  const stage = await files(path.join(root, ".cloudflare"));
  assert.equal(run(root, "prepare_cloudflare.mjs", argsFor(STAGING, ["--env", "staging"])).status, 0);
  assert.deepEqual(await files(path.join(root, ".cloudflare")), stage);
  assert.equal(run(root, "prepare_cloudflare.mjs", argsFor(PRODUCTION, ["--env", "production"])).status, 0);
  const after = await files(path.join(root, ".cloudflare"));
  for (const [name, data] of Object.entries(stage)) assert.equal(after[name], data, name);
  assert.deepEqual(await files(path.join(root, "public")), original);
  const prod = await files(path.join(root, ".cloudflare/production/public"));
  assert.deepEqual(Object.keys(prod).sort(), Object.keys(original).sort());
  for (const [name, data] of Object.entries(original)) {
    if (!["sitemap.xml", "llms.txt"].includes(name)) assert.equal(prod[name], data, name);
  }
  const sitemap = Buffer.from(prod["sitemap.xml"], "base64").toString();
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1]), [PRODUCTION.url, PRODUCTION.url + "research.html", PRODUCTION.url + "about.html"]);
  const llms = Buffer.from(prod["llms.txt"], "base64").toString();
  const expected = Buffer.from(original["llms.txt"], "base64").toString().replace(
    "The current staging site remains protected by Cloudflare Access. Public launch is a separate step.", `Production site: ${PRODUCTION.url}`);
  assert.equal(llms, expected);
  assert.equal((llms.match(/^- \[/gm) ?? []).length, 5);
  assert.match(Buffer.from(prod["robots.txt"], "base64").toString(), /Allow: \//);
  const config = JSON.parse(await readFile(path.join(root, ".cloudflare/wrangler.production.json"), "utf8"));
  validateTarget(config, "production");
  assert.deepEqual(config.vars, { ENABLE_DB_CHECK: "false", ENABLE_OBSERVATION: "true", ENABLE_GUESTBOOK: "true" });
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers.crons, ["17 3 * * *"]);
  for (const target of [{ ...PRODUCTION, id: STAGING.id }, { ...PRODUCTION, url: STAGING.url }, { ...PRODUCTION, account: "0".repeat(32) }]) {
    assert.equal(run(root, "prepare_cloudflare.mjs", argsFor(target, ["--env", "production"])).status, 1);
  }
  assert.equal(run(root, "prepare_cloudflare.mjs", [...argsFor(PRODUCTION, ["--env", "production"]), "--probe"]).status, 1);
  assert.equal(run(root, "prepare_cloudflare.mjs", [...argsFor(PRODUCTION, ["--env", "staging", "--env", "production"])]).status, 1);
  assert.equal(run(root, "prepare_cloudflare.mjs", [...argsFor(PRODUCTION, ["--env", "production"]), "--database-id", STAGING.id]).status, 1);
  assert.deepEqual(await files(path.join(root, ".cloudflare")), after);
}));

test("remote management routes production to its pinned UUID; mismatched config stops before credentials", async () => isolated(async root => {
  assert.equal(run(root, "prepare_cloudflare.mjs", argsFor(PRODUCTION, ["--env", "production"])).status, 0);
  const fake = path.join(root, "node_modules/wrangler/bin");
  await mkdir(fake, { recursive: true });
  // No credential access or actual network. This child stands in for Wrangler.
  await writeFile(path.join(fake, "wrangler.js"), `if(process.argv[2]==='auth')console.log(JSON.stringify({type:'oauth',token:'test-only'}));else console.log(JSON.stringify([{success:true,results:process.argv.slice(2)}]));`);
  const { openDatabase } = await import(pathToFileURL(path.join(root, "scripts/guestbook_admin.mjs")));
  const { executeSQL } = await import(pathToFileURL(path.join(root, "scripts/observation_admin.mjs")));
  const fetchOriginal = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ success: true, result: [{ success: true, results: [] }] });
  };
  try {
    const db = await openDatabase(true, "production");
    await db.query("SELECT ?", ["bound-value"]); await db.close();
    assert.equal(requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${PRODUCTION.account}/d1/database/${PRODUCTION.id}/query`);
    assert.deepEqual(requests[0].body, { sql: "SELECT ?", params: ["bound-value"] });
    const result = await executeSQL("SELECT 1", true, "production");
    assert.deepEqual(result[0].results.slice(0, 7), ["d1", "execute", PRODUCTION.database, "--remote", "--config", ".cloudflare/wrangler.production.json", "--command"]);
    const configPath = path.join(root, ".cloudflare/wrangler.production.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.d1_databases[0].database_id = STAGING.id;
    await writeFile(configPath, JSON.stringify(config));
    await assert.rejects(openDatabase(true, "production"));
    await assert.rejects(executeSQL("SELECT 1", true, "production"));
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = fetchOriginal; }
}));
