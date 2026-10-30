import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { GUESTBOOK_PATHS } from "../src/guestbook.js";
import { PAGE_PATHS } from "../src/observation.js";
import { OBSERVATION_PATHS } from "../src/observation_view.js";
import { prepareProduction } from "./prepare_production.mjs";
import { rejectRepeatedOptions } from "./deployment_targets.mjs";
import { notificationVars } from "./guestbook_notification_config.mjs";
import { researchPages } from "./research_pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values, tokens } = parseArgs({ tokens: true, options: {
  env: { type: "string", default: "staging" },
  url: { type: "string" }, "account-id": { type: "string" },
  "database-id": { type: "string" }, probe: { type: "boolean", default: false },
} });
rejectRepeatedOptions(tokens);
if (!["staging", "production"].includes(values.env)) throw new Error("Unknown environment.");
if (values.env === "production") {
  await prepareProduction(root, values);
} else {
const account = values["account-id"];
if (!/^[a-f0-9]{32}$/i.test(account ?? "")) {
  throw new Error("Supply the verified target --account-id (32 hexadecimal characters).");
}
const output = path.join(root, ".cloudflare");
await mkdir(output, { recursive: true });
const common = {
  name: "agent-hoihoi-staging", account_id: account,
  compatibility_date: "2026-10-21", workers_dev: true, preview_urls: false,
};
await writeFile(path.join(output, "wrangler.probe.json"), JSON.stringify({
  ...common, main: "../src/probe.js",
}, null, 2) + "\n");
if (values.probe) {
  console.log("Prepared probe config only. Confirm All traffic Access before deployment.");
} else {
  const db = values["database-id"];
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(db ?? "") || /^0[-0]+$/.test(db)) {
    throw new Error("Supply the actual staging --database-id UUID; a placeholder is not deployable.");
  }
  const url = new URL(values.url);
  if (url.protocol !== "https:" ||
      !/^agent-hoihoi-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password || url.port) {
    throw new Error("--url must be the confirmed https://agent-hoihoi-staging.<subdomain>.workers.dev/ URL.");
  }
  const pages = await researchPages(root);
  await rm(path.join(output, "public"), { recursive: true, force: true });
  await cp(path.join(root, "public"), path.join(output, "public"), { recursive: true });
  const urls = pages.map(page =>
    `  <url><loc>${new URL(page, url).href}</loc></url>`).join("\n");
  await writeFile(path.join(output, "public/sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Private staging only; not a confirmed public origin. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  const entries = await import("node:fs/promises");
  async function rejectLocalURLs(dir) {
    for (const entry of await entries.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await rejectLocalURLs(file);
      else if (/\.(html|txt|xml|css|js)$/.test(entry.name) &&
        /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(await readFile(file, "utf8"))) {
        throw new Error(`Local URL remains in deployment asset: ${entry.name}`);
      }
    }
  }
  await rejectLocalURLs(path.join(output, "public"));
  await writeFile(path.join(output, "wrangler.staging.json"), JSON.stringify({
    ...common, main: "../src/worker.js",
    assets: { directory: "./public", binding: "ASSETS", html_handling: "none",
      not_found_handling: "none", run_worker_first: [...new Set([...Object.keys(PAGE_PATHS), ...GUESTBOOK_PATHS, ...OBSERVATION_PATHS, "/api/internal/*"])] },
    d1_databases: [{ binding: "DB", database_name: "agent-hoihoi-staging-db",
      database_id: db, migrations_dir: "../migrations", remote: false }],
    vars: { ENABLE_DB_CHECK: "false", ENABLE_OBSERVATION: "true", ENABLE_GUESTBOOK: "true", ...notificationVars("staging") },
    triggers: { crons: ["17 3 * * *"] },
    env: { production: { name: "agent-hoihoi-production", workers_dev: false,
      preview_urls: false, d1_databases: [], triggers: { crons: [] },
      vars: { ENABLE_DB_CHECK: "false", ENABLE_OBSERVATION: "false", ENABLE_GUESTBOOK: "false" } } },
  }, null, 2) + "\n");
  console.log(`Prepared private staging assets for ${url.href}; source public/ and site.config.json unchanged.`);
}
}
