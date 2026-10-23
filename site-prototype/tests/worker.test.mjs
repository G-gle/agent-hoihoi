import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const request = (method = "POST", path = "/api/internal/db-check") => new Request("https://test.invalid" + path, { method });
// Fault injection at the D1 boundary: verify fail-closed responses and cleanup.
function database(failure) {
  const rows = new Map();
  let deletes = 0;
  const session = {
    prepare(sql) {
      return { bind(...args) {
        return {
          async run() {
            if (sql.startsWith("INSERT")) {
              rows.set(args[0], { id: args[0], created_at: args[1], value: args[2] });
              if (failure === "insert-response") throw new Error("private SQL/token detail");
            } else if (sql.startsWith("DELETE")) {
              deletes++;
              if (failure === "delete") throw new Error("private SQL/token detail");
              rows.delete(args[0]);
            } else throw new Error("Unexpected SQL");
            return { success: true, meta: { changes: 1 } };
          },
          async first() {
            if (sql.includes("created_at") && failure === "read") throw new Error("private SQL/token detail");
            if (sql.includes("created_at") && failure === "mismatch") return { ...rows.get(args[0]), value: "wrong" };
            return rows.get(args[0]) ?? null;
          },
        };
      } };
    },
  };
  return { rows, get deletes() { return deletes; }, withSession(mode) { assert.equal(mode, "first-primary"); return session; } };
}

test("unset, false and non-string true never reach the database", async () => {
  for (const value of [undefined, "false", "TRUE", true, "1"]) {
    const response = await worker.fetch(request(), { ENABLE_DB_CHECK: value });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
test("enabled GET and other methods cannot write", async () => {
  for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await worker.fetch(request(method), { ENABLE_DB_CHECK: "true" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
});
test("successful check deletes the exact row before returning", async () => {
  const db = database();
  const response = await worker.fetch(request(), { DB: db, ENABLE_DB_CHECK: "true" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, write: true, read: true, deleted: true });
  assert.equal(db.rows.size, 0);
});
test("browser GET only offers a same-origin POST form, with 405 and no DB access", async () => {
  const response = await worker.fetch(new Request("https://test.invalid/api/internal/db-check", {
    headers: { Accept: "text/html" },
  }), { ENABLE_DB_CHECK: "true" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(await response.text(), /form method="post" action="\/api\/internal\/db-check"/);
});
for (const failure of ["insert-response", "read", "mismatch", "delete"]) {
  test(`D1 ${failure} failure is 500 with cleanup attempted and no leaked details`, async () => {
    const db = database(failure);
    const response = await worker.fetch(request(), { DB: db, ENABLE_DB_CHECK: "true" });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Database check failed" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(db.deletes, 1);
    if (failure !== "delete") assert.equal(db.rows.size, 0);
  });
}
test("missing D1 binding is a generic 500", async () => {
  const response = await worker.fetch(request(), { ENABLE_DB_CHECK: "true" });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Database check failed" });
});
test("root resolves index.html while preserving the query", async () => {
  const response = await worker.fetch(request("GET", "/?check=1"), {
    ASSETS: { fetch(req) {
      assert.equal(new URL(req.url).pathname, "/index.html");
      assert.equal(new URL(req.url).search, "?check=1");
      return new Response("index");
    } },
  });
  assert.equal(await response.text(), "index");
});
test("unknown internal API stays 404 while ordinary paths use ASSETS", async () => {
  assert.equal((await worker.fetch(request("POST", "/api/internal/other"), { ENABLE_DB_CHECK: "true" })).status, 404);
  const response = await worker.fetch(request("GET", "/research.html"), {
    ASSETS: { fetch(req) { assert.equal(new URL(req.url).pathname, "/research.html"); return new Response("asset"); } },
  });
  assert.equal(await response.text(), "asset");
});
