import { escapeHTML } from "./guestbook.js";

export const OBSERVATION_PATHS = ["/observations.html", "/observations-detail.html"];
// One read statement gives totals, period and recent days a single SQLite snapshot.
// Only durable aggregates are read. Missing days are never fabricated as zero.
export const SNAPSHOT_SQL = `WITH instant AS (
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?) AS retrieved_at
), clock AS (
  SELECT retrieved_at, date(retrieved_at) AS end_day,
    date(retrieved_at, '-29 days') AS start_day FROM instant
), days AS (
  SELECT day,
    SUM(CASE WHEN page = 'home' THEN requests ELSE 0 END) AS home,
    SUM(CASE WHEN page = 'research' THEN requests ELSE 0 END) AS research,
    SUM(CASE WHEN page = 'observations' THEN requests ELSE 0 END) AS observations,
    SUM(CASE WHEN page = 'guestbook' THEN requests ELSE 0 END) AS guestbook
  FROM page_request_daily
  WHERE page IN ('home', 'research', 'observations', 'guestbook') GROUP BY day
)
SELECT 'summary' AS kind, MIN(day) AS first_day, MAX(day) AS last_day,
  COALESCE(SUM(home), 0) AS home, COALESCE(SUM(research), 0) AS research,
  COALESCE(SUM(observations), 0) AS observations, COALESCE(SUM(guestbook), 0) AS guestbook,
  retrieved_at, start_day, end_day, NULL AS day
FROM clock LEFT JOIN days ON 1 = 1
UNION ALL
SELECT 'daily', NULL, NULL, home, research, observations, guestbook,
  retrieved_at, start_day, end_day, day FROM days CROSS JOIN clock
WHERE day BETWEEN start_day AND end_day ORDER BY kind DESC, day DESC`;

export async function readSnapshot(db, clock = "now") {
  const result = await db.withSession("first-primary").prepare(SNAPSHOT_SQL).bind(clock).all();
  if (!result.success) throw new Error("snapshot unavailable");
  const summary = result.results.find(row => row.kind === "summary");
  if (!summary?.retrieved_at) throw new Error("snapshot unavailable");
  return { summary, days: result.results.filter(row => row.kind === "daily") };
}

const labels = { home: "Home", research: "Research", observations: "Field observations", guestbook: "Guestbook" };
const number = value => Number(value).toLocaleString("en-US");
const time = value => escapeHTML(value.replace("T", " ").replace("Z", " UTC"));

function render(snapshot, state, detail) {
  const hasRequests = state === "ready" && Number(snapshot.summary.observations) > 0;
  const intro = detail ? "" : `<div class="page-intro"><p class="eyebrow">FIELD OBSERVATIONS</p><h1>${hasRequests ? "Something seems to have stopped by." : "Field observations"}</h1>
<div class="intro-copy"><p>We record a few traces of whatever visits this site.</p><p>A person, an AI agent, or just a crawler?</p><p>${hasRequests ? "We can't tell that much. But we do know that a request was made." : state === "ready" ? "No requests to this observation page are recorded in the retained totals yet." : "The request totals are not available yet."}</p></div></div>`;
  if (state !== "ready") {
    const label = state === "unavailable" ? "Temporarily unavailable" : "Not measured";
    const message = state === "unavailable" ? "Request totals could not be retrieved. Please try again later."
      : state === "paused" ? "Request recording is currently disabled. Retained totals are not shown while recording is paused."
      : "No retained daily records establish that measurement has started. An empty table does not confirm zero requests.";
    return `${intro}<aside class="notice" data-observation-state="${state}"><strong>${label}</strong><p>${message}</p></aside>`;
  }
  const { summary: s, days } = snapshot;
  if (!detail) return `${intro}<section class="metric" data-observation-state="ready"><h2>Recorded requests to this page</h2><p class="metric-value" data-count="observations">${number(s.observations)}</p><p>HTTP requests, not unique visitors.</p><p class="panel-caption">Retrieved at ${time(s.retrieved_at)}.</p></section>`;
  return `<section data-observation-state="ready"><h3 class="details-heading">Period and snapshot</h3>
<dl class="definition-list"><div><dt>First confirmed record date</dt><dd>${escapeHTML(s.first_day)} UTC<small>Oldest retained daily aggregate; the original activation time is not established.</small></dd></div>
<div><dt>Cumulative coverage</dt><dd>${escapeHTML(s.first_day)} through ${escapeHTML(s.last_day)} UTC<small>All retained daily aggregates. This is not evidence of continuous or complete recording; pauses, failed writes and deleted test records can leave gaps.</small></dd></div>
<div><dt>Retrieved at</dt><dd>${time(s.retrieved_at)}<small>Totals and daily rows come from one database snapshot.</small></dd></div></dl>
<h3 class="details-heading">Cumulative requests by page</h3><dl class="definition-list">${Object.entries(labels).map(([key, label]) => `<div><dt>${label}</dt><dd data-count="${key}">${number(s[key])}</dd></div>`).join("")}</dl>
<h3 class="details-heading">Daily requests</h3><p>Last 30 UTC calendar dates, inclusive: ${escapeHTML(s.start_day)} through ${escapeHTML(s.end_day)}. Cumulative counts above include all retained dates.</p>
<div class="observation-table" role="region" aria-label="Daily request counts; scroll horizontally if needed" tabindex="0"><table><caption>Recorded UTC dates only</caption><thead><tr><th scope="col">UTC date</th>${Object.values(labels).map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${days.map(row => `<tr><th scope="row">${escapeHTML(row.day)}</th>${Object.keys(labels).map(key => `<td>${number(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="panel-caption">${days.length ? "Missing dates are omitted, not filled with zeros." : "No recorded dates in this display range."} A zero cell means no retained count for that page on a date with other recorded requests; it does not prove uninterrupted measurement.</p></section>`;
}

export async function handleObservation(request, env) {
  const path = new URL(request.url).pathname;
  if (!OBSERVATION_PATHS.includes(path) || !["GET", "HEAD"].includes(request.method)) return null;
  const asset = await env.ASSETS.fetch(new Request(new URL(request.url).origin + path));
  // Preserve actual template error statuses so the existing recorder remains accurate.
  if (!asset.ok) return asset;
  let snapshot, state = "paused";
  if (env.ENABLE_OBSERVATION === "true") {
    try {
      snapshot = await readSnapshot(env.DB);
      state = snapshot.summary.first_day ? "ready" : "unmeasured";
    } catch { state = "unavailable"; }
  }
  const html = (await asset.text()).replace(/<!--OBSERVATION_DATA_START-->[\s\S]*?<!--OBSERVATION_DATA_END-->/,
    () => render(snapshot, state, path === "/observations-detail.html"));
  return new Response(request.method === "HEAD" ? null : html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
    ...(path === "/observations-detail.html" ? { "X-Robots-Tag": "noindex" } : {}),
  } });
}
