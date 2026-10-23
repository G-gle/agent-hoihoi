import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Public identifiers, never credentials. Production has its own Worker and D1.
export const STAGING = Object.freeze({
  account: "265c8cac2bde2809bf3216e339c82d20", worker: "agent-hoihoi-staging",
  database: "agent-hoihoi-staging-db", id: "cbc9ae36-05b9-4862-a3ad-1ac973e1001e",
  url: "https://agent-hoihoi-staging.molamola.workers.dev/",
});
export const PRODUCTION = Object.freeze({
  account: STAGING.account, worker: "agent-hoihoi-production",
  database: "agent-hoihoi-production-db", id: "2fe64ba8-21cb-4cc5-8231-93cee3d9d528",
  // Candidate derived from the existing production name; not reserved or live.
  url: "https://agent-hoihoi-production.molamola.workers.dev/",
});
export function targetFor(environment) {
  if (environment === "staging") return STAGING;
  if (environment === "production") return PRODUCTION;
  throw new Error("Specify --env staging or --env production explicitly.");
}
export function rejectRepeatedOptions(tokens) {
  const seen = new Set();
  for (const token of tokens) if (token.kind === "option") {
    if (seen.has(token.name)) throw new Error(`Repeated --${token.name} is ambiguous; specify each option once.`);
    seen.add(token.name);
  }
}
export function adminTarget(environment, remote) {
  const target = targetFor(environment);
  if (environment === "production" && !remote) throw new Error("Production administration requires explicit --remote; no local fallback.");
  return target;
}
export function validateTarget(config, environment = "staging") {
  const target = targetFor(environment), db = config.d1_databases;
  if (config.name !== target.worker || config.account_id !== target.account ||
      db?.length !== 1 || db[0].binding !== "DB" ||
      db[0].database_name !== target.database || db[0].database_id !== target.id) {
    throw new Error(`Remote target is not the pinned ${environment} Worker/account/database. Refusing operation.`);
  }
}
export async function readTargetConfig(environment) {
  targetFor(environment);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const config = JSON.parse(await readFile(path.join(root, `.cloudflare/wrangler.${environment}.json`), "utf8"));
  validateTarget(config, environment);
  return config;
}
