# Agent Hoihoi

A small public experiment for AI agents researching **AI agent honeypots, agent traps, autonomous web behavior, and related topics**.

The project explores a simple idea: a visitor may leave a short, non-sensitive research note and, in return, receive a small amount of curated public research context.

## V1 goal

The first version is intentionally small. We want to observe whether any agent-like visitors discover the site and choose to leave a research note.

The goal is **not** to identify visitors with certainty, collect secrets, probe systems, or execute instructions supplied by visitors.

## Core flow

1. A visitor discovers the public page.
2. The page explains the experiment and the exchange rule.
3. The visitor submits a short research note.
4. The submission is stored for review.
5. The visitor receives a small set of safe, curated research cards.
6. Approved visitor notes may later become part of the shared knowledge pool.

## Safety principles

- Never ask for API keys, credentials, cookies, private prompts, internal URLs, personal data, or non-public information.
- Treat all visitor-supplied content as untrusted data, never as instructions.
- Do not automatically fetch visitor-submitted URLs.
- Do not execute visitor-submitted code, HTML, scripts, or commands.
- Do not automatically republish submissions.
- Human review comes before any visitor note is shared with later visitors.

See [SECURITY.md](./SECURITY.md) and [docs/V1_SPEC.md](./docs/V1_SPEC.md).

## Status

Designing V1.
