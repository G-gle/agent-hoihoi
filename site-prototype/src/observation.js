export const PAGE_PATHS = Object.freeze({
  "/": "home", "/index.html": "home", "/research.html": "research",
  "/observations.html": "observations", "/guestbook.html": "guestbook",
});
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const INSERT_DAILY = `INSERT INTO page_request_daily (day, page, requests)
VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET requests = requests + 1`;
export const INSERT_RAW = `INSERT INTO page_requests
(received_at, day, page, status, user_agent, referrer_domain) VALUES (?, ?, ?, ?, ?, ?)`;
export const PRUNE_RAW = "DELETE FROM page_requests WHERE received_at < ?";

export function referrerDomain(value) {
  if (!value || value.length > 8192) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!["http:", "https:"].includes(url.protocol) || !host || host.length > 253 ||
        host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    return host;
  } catch { return null; }
}

export async function recordRequest(db, request, page, status, receivedAt) {
  const day = receivedAt.slice(0, 10);
  const ua = request.headers.get("User-Agent");
  const results = await db.batch([
    db.prepare(INSERT_DAILY).bind(day, page),
    db.prepare(INSERT_RAW).bind(receivedAt, day, page, status,
      ua ? Array.from(ua).slice(0, 512).join("") : null,
      referrerDomain(request.headers.get("Referer"))),
  ]);
  if (results.length !== 2 || results.some(result => !result.success)) {
    throw new Error("Observation batch failed");
  }
}

export async function pruneRaw(db, now = Date.now()) {
  const cutoff = new Date(now - RETENTION_MS).toISOString();
  const result = await db.prepare(PRUNE_RAW).bind(cutoff).run();
  if (!result.success) throw new Error("Observation retention failed");
  return result;
}
