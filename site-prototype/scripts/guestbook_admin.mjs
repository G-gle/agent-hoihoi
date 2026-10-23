import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { adminTarget, readTargetConfig, rejectRepeatedOptions } from "./deployment_targets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export function adminQuery(action, options = {}) {
  if (action === "pending") {
    const limit = options.limit ?? "50";
    if (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100) throw new Error("--limit must be 1–100.");
    if (options.id) throw new Error("pending takes --limit, not --id.");
    return { sql: "SELECT id, created_at, name, message FROM guestbook_posts WHERE status = 'pending' ORDER BY created_at, id LIMIT ?", params: [Number(limit)] };
  }
  if (!["approve", "delete"].includes(action)) throw new Error("Action: pending | approve | delete");
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(options.id ?? "")) throw new Error("Specify one UUID with --id. Bulk deletion is not supported.");
  if (options.limit) throw new Error("--limit is only valid with pending.");
  return { sql: action === "approve"
    ? "UPDATE guestbook_posts SET status = 'approved' WHERE id = ? AND status = 'pending' RETURNING id, status"
    : "DELETE FROM guestbook_posts WHERE id = ? RETURNING id, status", params: [options.id] };
}

// Remote SQL uses the documented D1 REST {sql, params} interface. Wrangler CLI
// --command has no bind option; never interpolate a submitted value into SQL.
export async function openDatabase(remote = false, environment = "staging") {
  const target = adminTarget(environment, remote);
  if (!remote) {
    const { getPlatformProxy } = await import("wrangler");
    const proxy = await getPlatformProxy({ configPath: path.join(root, "wrangler.jsonc"),
      persist: { path: path.join(root, ".wrangler/state/v3") } });
    return { async query(sql, params = []) { const statement = proxy.env.DB.prepare(sql); return (params.length ? statement.bind(...params) : statement).all(); }, close: () => proxy.dispose() };
  }
  await readTargetConfig(environment);
  const credential = JSON.parse(await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "auth", "token", "--json"],
      { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", () => {});
    child.on("error", () => reject(new Error("Wrangler authentication could not start.")));
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error("Wrangler authentication failed. Run wrangler login locally.")));
  }));
  const authHeaders = credential.type === "api_key"
    ? { "X-Auth-Key": credential.key, "X-Auth-Email": credential.email }
    : { Authorization: `Bearer ${credential.token}` };
  return {
    async query(sql, params = []) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/d1/database/${target.id}/query`,
        { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000) });
      const body = await response.json();
      if (!response.ok || !body.success || body.result?.length !== 1 || !body.result[0].success) throw new Error("D1 query failed.");
      return body.result[0];
    }, async close() {},
  };
}

async function main() {
  const { values, positionals, tokens } = parseArgs({ allowPositionals: true, tokens: true, options: {
    env: { type: "string" }, remote: { type: "boolean", default: false },
    id: { type: "string" }, limit: { type: "string" },
  } });
  rejectRepeatedOptions(tokens);
  const target = adminTarget(values.env, values.remote);
  if (positionals.length !== 1) throw new Error("Specify exactly one action.");
  const query = adminQuery(positionals[0], values);
  const db = await openDatabase(values.remote, values.env);
  try {
    const result = await db.query(query.sql, query.params);
    if (!result.success) throw new Error("D1 query failed.");
    const outcome = positionals[0] === "pending" ? "pending-list" : result.results.length ? positionals[0] === "approve" ? "approved" : "deleted" : "unchanged: ID absent or already approved";
    // JSON string encoding prevents submitted ANSI/control text from acting as terminal commands.
    console.log(JSON.stringify({ environment: values.env, location: values.remote ? "remote" : "local",
      database: target.database, database_id: values.remote ? target.id : "local-only", action: positionals[0], outcome, rows: result.results }, null, 2));
  } finally { await db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Guestbook operation failed. Use pending|approve|delete --env staging|production [--remote] [--id UUID] [--limit 1-100]; production requires --remote. Check the pinned target and local Wrangler authentication."); process.exitCode = 1; });
}
