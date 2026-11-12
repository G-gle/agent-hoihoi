import { mkdir, readFile, writeFile, cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { SITE_PATHS, discovery } from "../src/site.js";
import { PAGE_PATHS } from "../src/observation.js";
import { OBSERVATION_PATHS } from "../src/observation_view.js";
import { PRODUCTION, validateTarget } from "./deployment_targets.mjs";
import { notificationVars } from "./guestbook_notification_config.mjs";
import { researchPages } from "./research_pages.mjs";
import { ARTICLES } from '../src/articles.generated.js';

export async function prepareProduction(root, values) {
  // Dated production builds are prepared on the actual first publication day.
  // A stale or missing date is never silently substituted with the build date.
  if (ARTICLES.some(a => !a.date)) throw new Error('Confirm the actual first publication date in the manuscript before preparing production.');
  if (values.probe || values["account-id"] !== PRODUCTION.account ||
      values["database-id"] !== PRODUCTION.id || values.url !== PRODUCTION.url) {
    throw new Error("Production requires the exact pinned account, separate D1 UUID and candidate URL; probe is staging-only.");
  }
  const output = path.join(root, ".cloudflare"), assets = path.join(output, "production/public");
  const config = {
    name: PRODUCTION.worker, account_id: PRODUCTION.account, main: "../src/worker.js",
    compatibility_date: "2026-10-21", workers_dev: true, preview_urls: false,
    assets: { directory: "./production/public", binding: "ASSETS", html_handling: "none",
      not_found_handling: "none", run_worker_first: [...new Set([...Object.keys(PAGE_PATHS), ...SITE_PATHS, ...OBSERVATION_PATHS, "/api/internal/*"])] },
    d1_databases: [{ binding: "DB", database_name: PRODUCTION.database, database_id: PRODUCTION.id,
      migrations_dir: "../migrations", remote: false }],
    vars: { SITE_ORIGIN: new URL(PRODUCTION.url).origin, ENABLE_DB_CHECK: "false", ENABLE_OBSERVATION: "true", ENABLE_GUESTBOOK: "true", ...notificationVars("production") },
    triggers: { crons: ["17 3 * * *"] },
  };
  validateTarget(config, "production");
  const pages = await researchPages(root);
  await rm(assets, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  await cp(path.join(root, "public"), assets, { recursive: true });
  for (const name of ['sitemap.xml','llms.txt','robots.txt'])
    await writeFile(path.join(assets,name),discovery('/'+name,new URL(PRODUCTION.url).origin));
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
