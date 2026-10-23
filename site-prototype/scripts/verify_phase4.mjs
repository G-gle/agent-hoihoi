// Read-only, target-pinned evidence. No raw log fields or guestbook text exported.
import { writeFile } from "node:fs/promises";
import { openDatabase } from "./guestbook_admin.mjs";
import { SNAPSHOT_SQL } from "../src/observation_view.js";
const label = process.argv[2];
if (!/^[a-z0-9-]{1,40}$/.test(label ?? "")) throw new Error("One evidence label required");
const db = await openDatabase(true);
try {
  const snapshot = await db.query(SNAPSHOT_SQL, ["now"]);
  const evidence = { checked_at: new Date().toISOString(), environment: "staging", snapshot: snapshot.results,
    guestbook: (await db.query("SELECT status, count(*) AS n FROM guestbook_posts GROUP BY status")).results,
    fixtures: (await db.query("SELECT id, status FROM guestbook_posts WHERE name = ?", ["Phase 4 synthetic test"])).results,
    raw_counts: (await db.query("SELECT page, status, count(*) AS n, min(id) AS first_id, max(id) AS last_id FROM page_requests GROUP BY page, status ORDER BY page")).results,
  };
  await writeFile(new URL(`../verification/2026-10-21-phase4/${label}.json`, import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} finally { await db.close(); }
