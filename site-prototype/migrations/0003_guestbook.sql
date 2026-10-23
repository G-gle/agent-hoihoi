-- Guestbook text has no automatic expiry. Access-log retention is separate.
CREATE TABLE guestbook_posts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved'))
);
CREATE INDEX guestbook_public ON guestbook_posts(status, created_at DESC, id DESC);
-- One shared acceptance gate, no IP or visitor identifier.
CREATE TABLE guestbook_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_allowed_at INTEGER NOT NULL
);
INSERT INTO guestbook_gate VALUES (1, 0);
