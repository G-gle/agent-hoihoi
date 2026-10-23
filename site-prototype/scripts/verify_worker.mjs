import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { values } = parseArgs({ options: {
  url: { type: "string", default: "http://127.0.0.1:8787/" },
  "db-check": { type: "string", default: "off" },
} });
const base = new URL(values.url);
assert.equal(base.hostname, "127.0.0.1", "This check writes only to the loopback local Worker.");
assert(["on", "off"].includes(values["db-check"]));
const root = fileURLToPath(new URL("../public/", import.meta.url));
async function files(dir, prefix = "") {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(path.join(dir, entry.name), relative + "/"));
    else result.push(relative);
  }
  return result;
}
for (const file of await files(root)) {
  const response = await fetch(new URL(file, base), { redirect: "manual" });
  assert.equal(response.status, 200, file);
  const body = Buffer.from(await response.arrayBuffer());
  if (["observations.html", "observations-detail.html"].includes(file)) {
    const template = await readFile(path.join(root, file), "utf8");
    const [prefix, rest] = template.split("<!--OBSERVATION_DATA_START-->");
    const suffix = rest.split("<!--OBSERVATION_DATA_END-->")[1];
    const html = body.toString();
    assert(html.startsWith(prefix) && html.endsWith(suffix), file);
    assert.match(html, /data-observation-state="(ready|unmeasured|paused|unavailable)"/);
    assert(!html.includes("<!--OBSERVATION_DATA_START-->"));
    assert.equal(response.headers.get("cache-control"), "no-store");
  } else if (!["guestbook.html", "guestbook-complete.html"].includes(file)) assert.deepEqual(body, await readFile(path.join(root, file)), file);
  else { assert.equal(response.headers.get("cache-control"), "no-store"); assert(!body.includes("<!--GUESTBOOK_LIST-->")); }
}
const index = await fetch(base, { redirect: "manual" });
assert.equal(index.status, 200, "/");
assert.deepEqual(Buffer.from(await index.arrayBuffer()), await readFile(path.join(root, "index.html")));
for (const missing of ["missing-page.html", "api/internal/unknown", "content/AIAgentTraps20261021.md", "wrangler.jsonc"]) {
  assert.equal((await fetch(new URL(missing, base))).status, 404, missing);
}
const api = new URL("api/internal/db-check", base);
for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
  const response = await fetch(api, { method });
  assert.equal(response.status, values["db-check"] === "on" ? 405 : 404, method);
  assert.equal(response.headers.get("cache-control"), "no-store");
  if (values["db-check"] === "on") assert.equal(response.headers.get("allow"), "POST");
}
const results = await Promise.all(Array.from({ length: 3 }, async () => {
  const response = await fetch(api, { method: "POST", body: '{"sql":"DROP TABLE environment_check"}' });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.status, values["db-check"] === "on" ? 200 : 404);
  const body = await response.json();
  assert.deepEqual(body, values["db-check"] === "on"
    ? { ok: true, write: true, read: true, deleted: true } : { error: "Not found" });
  return body;
}));
console.log(JSON.stringify({ url: base.href, files: 13, root: "PASS", missing: "PASS",
  methods: "PASS", parallelPosts: results.length, dbCheck: values["db-check"], result: "PASS" }, null, 2));
