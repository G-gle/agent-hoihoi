-- Wrangler applies this entire file and its migration marker in one transaction.
-- Copy BOTH tables before dropping the old child first: deferring foreign keys
-- alone would not prevent ON DELETE CASCADE from removing the raw records.
CREATE TABLE page_request_daily_v4 (
  day TEXT NOT NULL CHECK (day GLOB '????-??-??'),
  page TEXT NOT NULL CHECK (page IN ('home', 'research', 'observations', 'guestbook', 'agent_traps', 'agents_and_traps')),
  requests INTEGER NOT NULL CHECK (requests >= 1),
  PRIMARY KEY (day, page)
);
CREATE TABLE page_requests_v4 (
  id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day = substr(received_at, 1, 10)),
  page TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status BETWEEN 100 AND 599),
  user_agent TEXT CHECK (length(user_agent) <= 512),
  referrer_domain TEXT CHECK (length(referrer_domain) <= 253),
  FOREIGN KEY (day, page) REFERENCES page_request_daily_v4(day, page) ON DELETE CASCADE
);
INSERT INTO page_request_daily_v4 (day, page, requests)
  SELECT day, page, requests FROM page_request_daily;
INSERT INTO page_requests_v4 (id, received_at, day, page, status, user_agent, referrer_domain)
  SELECT id, received_at, day, page, status, user_agent, referrer_domain FROM page_requests;
DROP TABLE page_requests;
DROP TABLE page_request_daily;
ALTER TABLE page_request_daily_v4 RENAME TO page_request_daily;
ALTER TABLE page_requests_v4 RENAME TO page_requests;
CREATE INDEX page_requests_received_at ON page_requests(received_at);
