// Read-only local/staging verification evidence; never prints submitted text or auth.
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { openDatabase } from "./guestbook_admin.mjs";
const { values, positionals } = parseArgs({ allowPositionals: true, options: { remote: { type: "boolean", default: false } } });
const label = positionals[0];
if (positionals.length !== 1 || !/^[a-z0-9-]{1,40}$/.test(label ?? "")) throw new Error("Supply one evidence label [--remote]. Only staging is supported.");
const db = await openDatabase(values.remote);
try {
  const result = { checked_at: new Date().toISOString(), environment: "staging", location: values.remote ? "remote" : "local",
    guestbook: (await db.query("SELECT status, count(*) AS n FROM guestbook_posts GROUP BY status ORDER BY status")).results,
    // Only synthetic test IDs and UTC times are recorded in verification artifacts.
    fixture_ids: (await db.query("SELECT id, created_at, status FROM guestbook_posts WHERE name LIKE ? OR message = ? ORDER BY created_at", ["Phase 3 synthetic%", "Phase 3 anonymous pending verification."])).results,
    daily: (await db.query("SELECT day, page, requests FROM page_request_daily ORDER BY day, page")).results,
    raw: (await db.query("SELECT page, status, count(*) AS n, min(id) AS first_id, max(id) AS last_id FROM page_requests GROUP BY page, status ORDER BY page, status")).results,
    environment_check: (await db.query("SELECT count(*) AS n FROM environment_check")).results,
  };
  const directory = new URL("../verification/2026-10-21-phase3/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${values.remote ? "remote" : "local"}-${label}.json`, directory), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await db.close(); }
