export const NOTIFY_TIMEOUT_MS = 20_000;

// Only fixed classifications and saved IDs belong in these logs. Never log
// exceptions, request/response bodies, credentials or submitted text.
function record(environment, id, result, classification) {
  console.log(JSON.stringify({ event: "guestbook_notification", environment, id, result, classification }));
}

export async function notifyGuestbook(env, post) {
  const environment = ["staging", "production"].includes(env.GUESTBOOK_NOTIFY_ENVIRONMENT)
    ? env.GUESTBOOK_NOTIFY_ENVIRONMENT : "unknown";
  let timer;
  let timedOut = false;
  try {
    let url;
    try { url = new URL(env.GUESTBOOK_NOTIFY_URL); } catch { /* skip invalid configuration */ }
    if (!url || url.protocol !== "https:" || url.username || url.password ||
        environment === "unknown" || typeof env.GUESTBOOK_NOTIFY_SECRET !== "string" ||
        env.GUESTBOOK_NOTIFY_SECRET.length < 32) {
      record(environment, post.id, "skipped", "configuration_missing_or_invalid");
      return;
    }
    const controller = new AbortController();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("deadline"));
      }, NOTIFY_TIMEOUT_MS);
    });
    const operation = async () => {
      // Standard redirect following lets GAS ContentService return its JSON.
      // There is exactly one initial POST; no manual redirect POST or retry.
      const response = await fetch(url.href, {
        method: "POST", redirect: "follow", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: env.GUESTBOOK_NOTIFY_SECRET, environment,
          id: post.id, created_at: post.created_at, name: post.name, message: post.message }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return ["failed", "http_error_outcome_unknown"];
      }
      let body;
      try { body = await response.json(); }
      catch { return ["failed", "invalid_response_outcome_unknown"]; }
      if (body?.ok === true) return ["sent", "gas_send_succeeded"];
      const known = ["invalid_json", "configuration_error", "unauthorized", "invalid_payload", "mail_send_failed"];
      if (body?.ok === false && known.includes(body.error)) return ["failed", "gas_" + body.error];
      return ["failed", "invalid_response_outcome_unknown"];
    };
    const [result, classification] = await Promise.race([operation(), deadline]);
    record(environment, post.id, result, classification);
  } catch {
    // An unreachable endpoint or lost response can still mean mail was sent.
    record(environment, post.id, "failed", timedOut ? "timeout_outcome_unknown" : "network_or_configuration_error_outcome_unknown");
  } finally {
    clearTimeout(timer);
  }
}

export function scheduleGuestbookNotification(ctx, env, post) {
  try {
    // Defer even starting the notification until waitUntil has been registered.
    if (!ctx?.waitUntil) return;
    ctx.waitUntil(Promise.resolve().then(() => notifyGuestbook(env, post)));
  } catch {
    // Notification setup must never turn a committed submission into an error.
    record("unknown", post.id, "failed", "scheduling_failed");
  }
}
