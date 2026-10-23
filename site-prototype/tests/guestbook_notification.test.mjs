import test from "node:test";
import assert from "node:assert/strict";
import { notifyGuestbook, NOTIFY_TIMEOUT_MS } from "../src/guestbook_notification.js";

const env = { GUESTBOOK_NOTIFY_URL: "https://script.google.com/macros/s/test/exec",
  GUESTBOOK_NOTIFY_SECRET: "synthetic-secret-".repeat(3), GUESTBOOK_NOTIFY_ENVIRONMENT: "staging" };
const post = { id: "synthetic-id", created_at: "2026-10-23T01:02:03.004Z", name: "Saved name", message: "Saved text\nsecond line" };
function capture(t, fetcher) {
  const calls = [], logs = [];
  t.mock.method(globalThis, "fetch", async (...args) => { calls.push(args); return fetcher(...args); });
  t.mock.method(console, "log", line => logs.push(JSON.parse(line)));
  return { calls, logs };
}
function safeLog(logs) {
  assert.equal(logs.length, 1);
  for (const text of [env.GUESTBOOK_NOTIFY_SECRET, post.name, post.message, "private Google body"])
    assert.ok(!JSON.stringify(logs).includes(text));
}
test("one JSON POST uses exact saved values, server environment, redirects and finite deadline", async t => {
  const { calls, logs } = capture(t, () => Response.json({ ok: true }));
  await notifyGuestbook(env, post);
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, env.GUESTBOOK_NOTIFY_URL);
  assert.equal(options.method, "POST"); assert.equal(options.redirect, "follow");
  assert.deepEqual(options.headers, { "Content-Type": "application/json" });
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(options.body), { secret: env.GUESTBOOK_NOTIFY_SECRET, environment: "staging", ...post });
  assert.equal(logs[0].result, "sent"); safeLog(logs);
});
test("missing/invalid configuration skips with no fetch", async t => {
  const { calls, logs } = capture(t, () => { throw new Error("must not call"); });
  for (const changed of [{ GUESTBOOK_NOTIFY_URL: undefined }, { GUESTBOOK_NOTIFY_URL: "bad-url" },
    { GUESTBOOK_NOTIFY_URL: "http://example.com" }, { GUESTBOOK_NOTIFY_SECRET: undefined },
    { GUESTBOOK_NOTIFY_SECRET: "short" }, { GUESTBOOK_NOTIFY_ENVIRONMENT: "client-supplied" }]) {
    await notifyGuestbook({ ...env, ...changed }, post);
    assert.equal(logs.at(-1).result, "skipped");
  }
  assert.equal(calls.length, 0);
});
for (const [label, fetcher, classification] of [
  ["network", () => { throw new Error("private Google body"); }, "network_or_configuration_error_outcome_unknown"],
  ["HTTP 500", () => new Response("private Google body", { status: 500 }), "http_error_outcome_unknown"],
  ["200 ok:false", () => Response.json({ ok: false, error: "unauthorized" }), "gas_unauthorized"],
  ["GAS mail failure", () => Response.json({ ok: false, error: "mail_send_failed" }), "gas_mail_send_failed"],
  ["HTML", () => new Response("<html>private Google body</html>"), "invalid_response_outcome_unknown"],
  ["broken JSON", () => new Response('{"ok":'), "invalid_response_outcome_unknown"],
  ["unexpected JSON", () => Response.json({ ok: "true", error: "private Google body" }), "invalid_response_outcome_unknown"],
  ["null JSON", () => Response.json(null), "invalid_response_outcome_unknown"],
]) test(`${label} is safely recorded and never retried`, async t => {
  const { calls, logs } = capture(t, fetcher);
  await notifyGuestbook(env, post);
  assert.equal(calls.length, 1); assert.equal(logs[0].result, "failed");
  assert.equal(logs[0].classification, classification); safeLog(logs);
});
for (const phase of ["fetch", "body"]) test(`20s timeout includes ${phase}; abort, unknown outcome and no retry`, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { calls, logs } = capture(t, () => phase === "fetch" ? new Promise(() => {})
    : { ok: true, json: () => new Promise(() => {}) });
  const pending = notifyGuestbook(env, post);
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(NOTIFY_TIMEOUT_MS - 1);
  assert.equal(logs.length, 0);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(calls.length, 1); assert.equal(calls[0][1].signal.aborted, true);
  assert.equal(logs[0].classification, "timeout_outcome_unknown"); safeLog(logs);
});
