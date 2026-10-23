import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { RETENTION_MS } from "../src/observation.js";
import { STAGING, adminTarget, readTargetConfig, rejectRepeatedOptions } from "./deployment_targets.mjs";
export { STAGING, validateTarget } from "./deployment_targets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error("Use a real UTC date: YYYY-MM-DD for --from and --to.");
  }
  return value;
}

export function buildQuery(action, options, now = Date.now(), environment = "staging") {
  adminTarget(environment, true);
  if (action === "clear-staging") {
    if (environment !== "staging") throw new Error("clear-staging is never allowed for production.");
    if (options.confirm !== STAGING.database) throw new Error("--confirm agent-hoihoi-staging-db is required.");
    // One statement: FK cascade atomically deletes only these observation rows.
    return "DELETE FROM page_request_daily;";
  }
  if (action === "prune") {
    return `DELETE FROM page_requests WHERE received_at < '${new Date(now - RETENTION_MS).toISOString()}';`;
  }
  if (!["daily", "recent"].includes(action)) throw new Error("Action: daily | recent | prune | clear-staging");
  const from = date(options.from), to = date(options.to);
  if (to < from || Date.parse(to) - Date.parse(from) > 365 * 86400000) {
    throw new Error("The inclusive date range must be 1–366 days.");
  }
  const limit = options.limit ?? "100";
  if (!/^[1-9]\d{0,3}$/.test(limit) || Number(limit) > 1000) throw new Error("--limit must be 1–1000.");
  // Wrangler CLI has no bind parameter option: only validated canonical dates
  // and integers are interpolated. No arbitrary SQL, identifiers or text input.
  if (action === "daily") return `SELECT day, page, requests FROM page_request_daily
WHERE day >= '${from}' AND day <= '${to}' ORDER BY day DESC, page LIMIT ${Number(limit)};`;
  const end = new Date(Date.parse(to) + 86400000).toISOString();
  return `SELECT id, received_at, page, status, user_agent, referrer_domain FROM page_requests
WHERE received_at >= '${from}T00:00:00.000Z' AND received_at < '${end}'
ORDER BY received_at DESC, id DESC LIMIT ${Number(limit)};`;
}

export async function executeSQL(sql, remote = false, environment = "staging") {
  const target = adminTarget(environment, remote);
  if (remote) await readTargetConfig(environment);
    const args = [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", target.database,
      remote ? "--remote" : "--local", "--config", remote ? `.cloudflare/wrangler.${environment}.json` : "wrangler.jsonc",
      "--command", sql, "--json"];
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", data => { stdout += data; });
      child.stderr.on("data", () => {}); // Never echo raw authentication/CLI diagnostics.
      child.on("error", () => reject(new Error("Wrangler could not start.")));
      child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error("D1 operation failed; check Wrangler authentication and target configuration.")));
    });
    const result = JSON.parse(output);
    if (result.some(item => item.success === false)) throw new Error("D1 operation failed.");
    return result;
}

async function main() {
  const { values, positionals, tokens } = parseArgs({ allowPositionals: true, tokens: true, options: {
    env: { type: "string" }, remote: { type: "boolean", default: false },
    from: { type: "string" }, to: { type: "string" }, limit: { type: "string" }, confirm: { type: "string" },
  } });
  rejectRepeatedOptions(tokens);
  const target = adminTarget(values.env, values.remote);
  if (positionals.length !== 1) throw new Error("Specify exactly one action.");
  const sql = buildQuery(positionals[0], values, Date.now(), values.env);
  console.log(JSON.stringify({ environment: values.env, location: values.remote ? "remote" : "local",
    database: target.database, database_id: values.remote ? target.id : "local-only",
    result: await executeSQL(sql, values.remote, values.env) }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
