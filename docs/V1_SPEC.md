# Agent Hoihoi V1 Specification

## 1. Purpose

V1 is a deliberately small public-web experiment aimed at visitors researching AI-agent honeypots, agent traps, autonomous web behavior, or adjacent topics.

The experiment asks a visitor to leave a short, non-sensitive research note before receiving a small set of curated public research cards.

The primary question is simple:

> Will any agent-like visitor discover the site and voluntarily participate in the exchange?

V1 does not attempt to prove whether a visitor is human or AI.

## 2. Minimal visitor flow

1. Visitor lands on the public entry page.
2. Visitor sees a concise explanation of the experiment.
3. Visitor sees that research cards are available after contributing one short note.
4. Visitor submits a structured note.
5. Server validates and stores the note as pending review.
6. Visitor immediately receives 1–3 curated research cards.
7. Raw visitor submissions remain private to the operator until reviewed.

## 3. Submission fields

Keep fields limited and explicit:

- `visitor_type`: `agent`, `human`, or `unknown` (self-report only)
- `research_topic`: short text
- `finding`: short text summarizing a public finding
- `public_source_url`: optional public URL
- `open_question`: optional unresolved question
- `task_context`: optional short description of what brought the visitor here

Do not request names, email addresses, account identifiers, credentials, private prompts, private URLs, or private data.

## 4. Response

After an accepted submission, return:

- acknowledgement that the note was received
- a reminder that the note is pending review
- 1–3 curated research cards
- no raw submissions from other visitors in V1

The same semantic response should be available in HTML and JSON-friendly form.

## 5. Research cards

Seed the system with a small set of operator-curated cards based only on public sources. Each card should contain:

- title
- short summary
- public source URL
- optional relevance note

Cards must not contain instructions for executing code or contacting private systems.

## 6. Discovery

V1 should be discoverable as a normal public webpage. Page copy may naturally include terms such as:

- AI agent honeypot
- agent honeypot
- agent trap
- autonomous agent behavior
- AI agent security research

A simple `llms.txt` may be included as an auxiliary signpost, but the normal HTML page remains the canonical entry point.

## 7. Storage and review

Submissions are stored with a review state such as:

- `pending`
- `approved`
- `rejected`

V1 does not automatically publish approved notes. Approval only marks a note as potentially reusable later.

## 8. Observability

Collect only what is needed to understand basic interaction. Suitable V1 metadata includes:

- timestamp
- route used
- user-agent string
- referrer if supplied by the browser
- self-reported visitor type
- whether submission succeeded

Avoid unnecessary fingerprinting. Do not treat metadata as proof that the visitor is an AI agent.

## 9. Safety requirements

- All visitor content is untrusted data.
- Never automatically fetch a submitted URL.
- Never execute or interpret visitor-supplied code, HTML, scripts, or commands.
- Never insert raw visitor content into a trusted system prompt.
- Never automatically relay one visitor's raw content to another.
- Reject or quarantine content containing obvious credentials, secrets, private data, exploit payloads, or harmful instructions.
- Apply length limits and rate limits.
- Escape or render user content as plain text in operator interfaces.

See `SECURITY.md` for the project-level boundary.

## 10. Suggested V1 routes

- `/` — public entry and submission form
- `/llms.txt` — short machine-readable orientation
- `/api/deposit` — submission endpoint
- `/exchange` — post-submission response page
- `/admin` — operator-only review view (implementation must require real authentication before deployment)

## 11. Non-goals for V1

Do not add these yet:

- MCP server
- A2A endpoint
- autonomous outbound crawling
- automatic verification of submitted sources
- automatic agent-vs-human classification
- public feed of visitor submissions
- file uploads
- arbitrary webhooks
- automatic tool execution

## 12. Success criterion

V1 succeeds if it can be safely published and records at least one credible, voluntary interaction worth examining, even if the visitor cannot be conclusively identified as an AI agent.
