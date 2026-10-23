import { PAGE_PATHS, recordRequest, pruneRaw } from "./observation.js";
import { handleGuestbook } from "./guestbook.js";
import { handleObservation } from "./observation_view.js";

const CHECK_PATH = "/api/internal/db-check";
const FIXED_VALUE = "agent-hoihoi-phase1-environment-check";

function json(body, status, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

async function checkDatabase(db) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  // Use a primary session for write/read/delete consistency, even if replicas
  // are enabled later. Each request only deletes its own random test ID.
  const session = db.withSession("first-primary");
  let succeeded = false;
  let cleaned = false;
  try {
    const inserted = await session.prepare(
      "INSERT INTO environment_check (id, created_at, value) VALUES (?, ?, ?)",
    ).bind(id, createdAt, FIXED_VALUE).run();
    if (!inserted.success || inserted.meta.changes !== 1) throw new Error("insert failed");
    const row = await session.prepare(
      "SELECT id, created_at, value FROM environment_check WHERE id = ?",
    ).bind(id).first();
    if (row?.id !== id || row.created_at !== createdAt || row.value !== FIXED_VALUE) {
      throw new Error("read mismatch");
    }
    succeeded = true;
  } catch {
    succeeded = false;
  } finally {
    // Also attempt cleanup after an insert/read failure; do not mask a failed
    // check if cleanup succeeds, or a failed cleanup if the read succeeded.
    try {
      const deleted = await session.prepare(
        "DELETE FROM environment_check WHERE id = ?",
      ).bind(id).run();
      const remaining = await session.prepare(
        "SELECT id FROM environment_check WHERE id = ?",
      ).bind(id).first();
      cleaned = deleted.success && remaining === null;
    } catch {
      cleaned = false;
    }
  }
  return succeeded && cleaned;
}

export default {
  async fetch(request, env, ctx) {
    const receivedAt = new Date().toISOString();
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/internal/")) {
      if (path !== CHECK_PATH || env.ENABLE_DB_CHECK !== "true") {
        return json({ error: "Not found" }, 404);
      }
      if (request.method !== "POST") {
        // A direct authenticated browser visit can submit the POST without
        // copying Access cookies into a command or enabling developer tools.
        // GET is still 405 and performs no database work.
        if (request.method === "GET" && request.headers.get("Accept")?.includes("text/html")) {
          return new Response(`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Temporary staging database check</title>
<h1>Temporary staging database check</h1>
<p>This GET request does not run a check (405). The button sends a POST,
writes fixed test data, reads it back, and deletes it. No visitor data is used.</p>
<form method="post" action="/api/internal/db-check"><button type="submit">Run temporary database check</button></form>
</html>`, { status: 405, headers: {
            "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", Allow: "POST",
            "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
          } });
        }
        return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
      }
      // No request body or query parameters are used as SQL or saved content.
      try {
        if (await checkDatabase(env.DB)) {
          return json({ ok: true, write: true, read: true, deleted: true }, 200);
        }
      } catch {
        // Missing bindings and initialization errors also return a generic 5xx.
      }
      return json({ error: "Database check failed" }, 500);
    }
    // html_handling:none keeps .html links but does not resolve / to index.
    let response;
    try {
      response = await handleObservation(request, env) ?? await handleGuestbook(request, env);
      if (response) {
        // Guestbook responses always pass through the Worker, including HEAD/POST.
      } else if (path === "/") {
        const index = new URL(request.url);
        index.pathname = "/index.html";
        response = await env.ASSETS.fetch(new Request(index, request));
      } else {
        response = await env.ASSETS.fetch(request);
      }
    } catch {
      response = new Response("Internal Server Error", { status: 500 });
    }
    const page = PAGE_PATHS[path];
    if (request.method === "GET" && page && env.ENABLE_OBSERVATION === "true") {
      // Do not log exception objects, requests, headers, or individual values.
      ctx.waitUntil(recordRequest(env.DB, request, page, response.status, receivedAt)
        .catch(() => { console.error("page_request_write_failed"); }));
    }
    return response;
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(pruneRaw(env.DB).catch(() => {
      console.error("page_request_retention_failed");
      // Mark this scheduled invocation as failed, without leaking D1 details.
      throw new Error("page_request_retention_failed");
    }));
  },
};
