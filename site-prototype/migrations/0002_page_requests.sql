-- Aggregate first, raw second in a single D1 batch transaction.
CREATE TABLE page_request_daily (
  day TEXT NOT NULL CHECK (day GLOB '????-??-??'),
  page TEXT NOT NULL CHECK (page IN ('home', 'research', 'observations', 'guestbook')),
  requests INTEGER NOT NULL CHECK (requests >= 1),
  PRIMARY KEY (day, page)
);
CREATE TABLE page_requests (
  id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day = substr(received_at, 1, 10)),
  page TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status BETWEEN 100 AND 599),
  user_agent TEXT CHECK (length(user_agent) <= 512),
  referrer_domain TEXT CHECK (length(referrer_domain) <= 253),
  FOREIGN KEY (day, page) REFERENCES page_request_daily(day, page) ON DELETE CASCADE
);
CREATE INDEX page_requests_received_at ON page_requests(received_at);
