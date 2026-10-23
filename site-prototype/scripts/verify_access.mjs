// Fresh Node fetch has no cookie jar and is independent of browser sessions.
// Never print response headers, cookies, redirect query strings, or login HTML.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { url: { type: "string" }, out: { type: "string" } } });
const base = new URL(values.url);
assert.equal(base.protocol, "https:");
assert(base.hostname.endsWith(".workers.dev"));
assert(!base.username && !base.password && !base.search && !base.hash);
const paths = ["", "index.html", "research.html", "about.html", "observations.html", "guestbook.html",
  "guestbook-complete.html", "observations-detail.html", "assets/style.css", "assets/guestbook.js",
  "assets/favicon.svg", "llms.txt", "robots.txt", "sitemap.xml"];
const safeURL = url => { const safe = new URL(url); return safe.origin + safe.pathname; };
const results = [];
for (const [relative, originalMethod] of [...paths.map(p => [p, "GET"]), ["api/internal/db-check", "POST"], ["guestbook.html", "POST"]]) {
  let url = new URL(relative, base);
  let method = originalMethod;
  const chain = [];
  let gate = false;
  let finalBody = "";
  for (let i = 0; i < 10; i++) {
    const response = await fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(30000) });
    chain.push({ url: safeURL(url), status: response.status });
    const body = await response.text();
    assert(!body.includes("Staging environment unavailable."), "Anonymous client reached probe");
    assert(!body.includes("<title>Agent Hoihoi") && !body.includes('"write":true'), "Anonymous client reached site/API");
    // Exact source comparison catches returned CSS, JS and machine files too.
    if (relative) {
      try {
        const source = await readFile(new URL("../public/" + relative, import.meta.url), "utf8");
        assert.notEqual(body, source, "Anonymous client reached static asset");
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const target = new URL(location, url);
      if (target.hostname.endsWith(".cloudflareaccess.com") && target.pathname.startsWith("/cdn-cgi/access/")) gate = true;
      assert.equal(target.protocol, "https:");
      if ([301, 302, 303].includes(response.status) && method === "POST") method = "GET";
      url = target;
      continue;
    }
    finalBody = body;
    if ([401, 403].includes(response.status) && /cloudflare access|access denied/i.test(body)) gate = true;
    break;
  }
  assert(gate, `No verified Access gate for ${relative || "/"}`);
  assert(finalBody.length > 0, "Redirect chain did not reach a terminal page");
  results.push({ path: "/" + relative, method: originalMethod, accessProtected: true, chain });
}
const record = { checkedAt: new Date().toISOString(), authentication: "no cookies or authorization headers",
  base: base.href, results };
if (values.out) await writeFile(values.out, JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify(record, null, 2));
