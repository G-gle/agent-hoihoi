import { mkdir, readFile, writeFile, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { GUESTBOOK_PATHS } from "../src/guestbook.js";
import { PAGE_PATHS } from "../src/observation.js";
import { OBSERVATION_PATHS } from "../src/observation_view.js";
import { PRODUCTION, validateTarget } from "./deployment_targets.mjs";

export async function prepareProduction(root, values) {
  if (values.probe || values["account-id"] !== PRODUCTION.account ||
      values["database-id"] !== PRODUCTION.id || values.url !== PRODUCTION.url) {
    throw new Error("Production requires the exact pinned account, separate D1 UUID and candidate URL; probe is staging-only.");
  }
  const output = path.join(root, ".cloudflare"), assets = path.join(output, "production/public");
  const config = {
    name: PRODUCTION.worker, account_id: PRODUCTION.account, main: "../src/worker.js",
    compatibility_date: "2026-10-21", workers_dev: true, preview_urls: false,
    assets: { directory: "./production/public", binding: "ASSETS", html_handling: "none",
      not_found_handling: "none", run_worker_first: [...new Set([...Object.keys(PAGE_PATHS), ...GUESTBOOK_PATHS, ...OBSERVATION_PATHS, "/api/internal/*"])] },
    d1_databases: [{ binding: "DB", database_name: PRODUCTION.database, database_id: PRODUCTION.id,
      migrations_dir: "../migrations", remote: false }],
    vars: { ENABLE_DB_CHECK: "false", ENABLE_OBSERVATION: "true", ENABLE_GUESTBOOK: "true" },
    triggers: { crons: ["17 3 * * *"] },
  };
  validateTarget(config, "production");
  await mkdir(assets, { recursive: true });
  await cp(path.join(root, "public"), assets, { recursive: true });
  const urls = ["", "research.html", "about.html"].map(page =>
    `  <url><loc>${new URL(page, PRODUCTION.url).href}</loc></url>`).join("\n");
  await writeFile(path.join(assets, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  // Environment annotation only. Keep the five discovery links and all site copy.
  const stagingNote = "The current staging site remains protected by Cloudflare Access. Public launch is a separate step.";
  const llms = await readFile(path.join(assets, "llms.txt"), "utf8");
  if (llms.split(stagingNote).length !== 2) throw new Error("Review the changed llms environment annotation before preparing production.");
  await writeFile(path.join(assets, "llms.txt"), llms.replace(stagingNote, `Production site: ${PRODUCTION.url}`));
  async function check(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await check(file);
      else if (/\.(html|txt|xml|css|js|svg)$/.test(entry.name) &&
        /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])|agent-hoihoi-staging|current staging site/i.test(await readFile(file, "utf8"))) {
        throw new Error(`Non-production environment reference in ${entry.name}`);
      }
    }
  }
  await check(assets);
  await writeFile(path.join(output, "wrangler.production.json"), JSON.stringify(config, null, 2) + "\n");
  console.log(`Prepared production candidate ${PRODUCTION.url}; no deployment or route activation performed.`);
}
