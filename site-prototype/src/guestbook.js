export const LIMITS = Object.freeze({ name: 80, message: 500, bodyBytes: 8192,
  intervalSeconds: 15, list: 50, formSeconds: 1800, receiptSeconds: 600 });
export const GUESTBOOK_PATHS = ["/guestbook.html", "/guestbook-complete.html"];
const FORM_COOKIE = "__Host-hoihoi-form";
const RECEIPT_COOKIE = "__Host-hoihoi-receipt";
const tokenPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const PUBLIC_QUERY = `SELECT created_at, name, message FROM guestbook_posts
WHERE status = 'approved' ORDER BY created_at DESC, id DESC LIMIT ?`;
export const INSERT_POST = `INSERT INTO guestbook_posts (id, created_at, name, message, status)
SELECT ?, ?, ?, ?, 'pending' WHERE EXISTS
(SELECT 1 FROM guestbook_gate WHERE id = 1 AND next_allowed_at <= ?)`;
const ADVANCE_GATE = `UPDATE guestbook_gate SET next_allowed_at = ? WHERE id = 1
AND EXISTS (SELECT 1 FROM guestbook_posts WHERE id = ?)`;

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function cookie(request, key) {
  const values = (request.headers.get("Cookie") ?? "").split(";").map(s => s.trim())
    .filter(s => s.startsWith(key + "="));
  return values.length === 1 ? values[0].slice(key.length + 1) : "";
}
function setCookie(key, value, seconds) {
  return `${key}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };
function error(message, status, extra = {}) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guestbook — Agent Hoihoi</title><link rel="stylesheet" href="/assets/style.css"><main class="shell completion"><h1>Message not received</h1><aside class="notice" role="alert"><p>${escapeHTML(message)}</p></aside><p><a href="/guestbook.html">Back to the guestbook</a></p></main></html>`,
    { status, headers: { ...headers, ...extra } });
}
async function template(request, env) {
  // Templates are fetched with GET and no visitor headers or conditional cache headers.
  const response = await env.ASSETS.fetch(new Request(new URL(request.url).origin + new URL(request.url).pathname));
  if (!response.ok) throw new Error("template unavailable");
  return response.text();
}
async function readForm(request) {
  if (request.headers.has("Content-Encoding") && request.headers.get("Content-Encoding") !== "identity") {
    return { response: error("Unsupported content encoding.", 415) };
  }
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) {
    return { response: error("Use the guestbook HTML form to send a message.", 415) };
  }
  const length = request.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > LIMITS.bodyBytes)) {
    return { response: error("The submitted form is too large.", 413) };
  }
  const reader = request.body?.getReader();
  const chunks = []; let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMITS.bodyBytes) {
          await reader.cancel();
          return { response: error("The submitted form is too large.", 413) };
        }
        chunks.push(value);
      }
    } catch { return { response: error("The form could not be read. Please try again.", 400) }; }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // URLSearchParams alone silently replaces malformed percent encoding/UTF-8.
    decodeURIComponent(raw.replace(/\+/g, " "));
  } catch { return { response: error("The form contains invalid text encoding.", 400) }; }
  const fields = new URLSearchParams(raw);
  if ([...fields.keys()].some(k => !["name", "message", "csrf"].includes(k)) ||
      ["name", "message", "csrf"].some(k => fields.getAll(k).length > 1) ||
      !fields.has("message") || !fields.has("csrf")) {
    return { response: error("The form fields are invalid. Please use the guestbook form.", 400) };
  }
  const name = (fields.get("name") ?? "").trim();
  const message = fields.get("message").replace(/\r\n?/g, "\n").trim();
  if (!message || Array.from(name).length > LIMITS.name || Array.from(message).length > LIMITS.message ||
      /[\p{Cc}\p{Cs}]/u.test(name) || /[\p{Cs}\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(message)) {
    return { response: error(`Enter a message of 1–${LIMITS.message} characters and an optional name of up to ${LIMITS.name} characters. Use plain text without control characters.`, 400) };
  }
  return { name, message, csrf: fields.get("csrf") };
}

export async function handleGuestbook(request, env, now) {
  const path = new URL(request.url).pathname;
  if (!GUESTBOOK_PATHS.includes(path)) return null;
  if (!["GET", "HEAD", ...(path === "/guestbook.html" ? ["POST"] : [])].includes(request.method)) {
    return error("This method is not supported.", 405, { Allow: path === "/guestbook.html" ? "GET, HEAD, POST" : "GET, HEAD" });
  }
  try {
    if (request.method === "POST") {
      if (env.ENABLE_GUESTBOOK !== "true") return error("Submissions are temporarily paused. Please try again later.", 503);
      const origin = request.headers.get("Origin"), site = request.headers.get("Sec-Fetch-Site");
      if ((origin !== null && origin !== new URL(request.url).origin) || (site && !["same-origin", "none"].includes(site))) {
        return error("Please submit from this site's guestbook form.", 403);
      }
      const form = await readForm(request);
      if (form.response) return form.response;
      const csrf = cookie(request, FORM_COOKIE);
      if (!tokenPattern.test(csrf) || form.csrf !== csrf) return error("The form session is missing or expired. Open the guestbook and try again.", 403);
      // Sample after the complete bounded body is received and validated. A slow
      // sender must not reserve an earlier timestamp and rewind the shared gate.
      const acceptedAt = now ?? Date.now();
      const id = crypto.randomUUID();
      // D1 batch is transactional. The insert and gate advance serialize concurrent POSTs.
      const result = await env.DB.batch([
        env.DB.prepare(INSERT_POST).bind(id, new Date(acceptedAt).toISOString(), form.name, form.message, acceptedAt),
        env.DB.prepare(ADVANCE_GATE).bind(acceptedAt + LIMITS.intervalSeconds * 1000, id),
      ]);
      if (result.length !== 2 || result.some(r => !r.success)) throw new Error("save failed");
      if (result[0].meta.changes === 0) return error(`Please wait ${LIMITS.intervalSeconds} seconds before trying again. This small guestbook shares one submission interval across all visitors.`, 429, { "Retry-After": String(LIMITS.intervalSeconds) });
      if (result[0].meta.changes !== 1 || result[1].meta.changes !== 1) throw new Error("save failed");
      return new Response(null, { status: 303, headers: { "Cache-Control": "no-store", Location: "/guestbook-complete.html",
        "Set-Cookie": setCookie(RECEIPT_COOKIE, id, LIMITS.receiptSeconds) } });
    }
    let html = await template(request, env);
    const responseHeaders = { ...headers };
    if (path === "/guestbook.html") {
      const result = await env.DB.withSession("first-primary").prepare(PUBLIC_QUERY).bind(LIMITS.list).all();
      if (!result.success) throw new Error("read failed");
      const list = result.results.length ? `<ol class="guest-entries">${result.results.map(row =>
        `<li><article><h3>${escapeHTML(row.name || "Anonymous")}</h3><time datetime="${escapeHTML(row.created_at)}">${escapeHTML(row.created_at.replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC"))}</time><p class="guest-message">${escapeHTML(row.message)}</p></article></li>`).join("")}</ol>` : '<p class="notice">No approved messages yet.</p>';
      let csrf = cookie(request, FORM_COOKIE);
      if (!tokenPattern.test(csrf)) csrf = randomToken();
      responseHeaders["Set-Cookie"] = setCookie(FORM_COOKIE, csrf, LIMITS.formSeconds);
      html = html.replace("<!--CSRF_FIELD-->", `<input type="hidden" name="csrf" value="${csrf}">`)
        .replaceAll("{{NAME_LIMIT}}", String(LIMITS.name)).replaceAll("{{MESSAGE_LIMIT}}", String(LIMITS.message))
        .replace("<!--LIST_LIMIT-->", String(LIMITS.list))
        .replace("<!--FORM_STATUS-->", env.ENABLE_GUESTBOOK === "true" ? "Leave a note" : "Submissions are temporarily paused.")
        .replace("data-worker-submit disabled", env.ENABLE_GUESTBOOK === "true" ? "data-worker-submit" : "disabled")
        .replace("<!--GUESTBOOK_LIST-->", () => list);
    } else {
      const id = cookie(request, RECEIPT_COOKIE);
      const receipt = idPattern.test(id) ? await env.DB.withSession("first-primary").prepare(
        "SELECT created_at FROM guestbook_posts WHERE id = ? AND created_at >= ?",
      ).bind(id, new Date((now ?? Date.now()) - LIMITS.receiptSeconds * 1000).toISOString()).first() : null;
      if (receipt) html = html.replace("<h1>Guestbook receipt</h1>", "<h1>Your note has been received.</h1>")
        .replace('<aside class="notice"><strong>No recent submission confirmed</strong><p>This page does not confirm a new submission. To send a message, use the guestbook form.</p></aside>',
          "<p>Thank you!</p><p>Your message may be published after review.</p>");
    }
    return new Response(request.method === "HEAD" ? null : html, { headers: responseHeaders });
  } catch {
    // Never include SQL, request fields, cookies, identity or database errors in logs.
    return error("The guestbook is temporarily unavailable. Your message could not be confirmed. Please try again later.", 503);
  }
}
