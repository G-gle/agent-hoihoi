-- Copy both sides before removing the old child. ON DELETE CASCADE must
-- never erase retained raw requests while replacing the daily table.
CREATE TABLE page_request_daily_v6 (
  day TEXT NOT NULL CHECK (day GLOB '????-??-??'),
  page TEXT NOT NULL CHECK (length(page) BETWEEN 1 AND 160),
  requests INTEGER NOT NULL CHECK (requests >= 1),
  PRIMARY KEY(day,page)
);
CREATE TABLE page_requests_v6 (
  id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day = substr(received_at,1,10)),
  page TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status BETWEEN 100 AND 599),
  user_agent TEXT CHECK (length(user_agent) <= 512),
  referrer_domain TEXT CHECK (length(referrer_domain) <= 253),
  FOREIGN KEY(day,page) REFERENCES page_request_daily_v6(day,page) ON DELETE CASCADE
);
INSERT INTO page_request_daily_v6 SELECT day,page,requests FROM page_request_daily;
INSERT INTO page_requests_v6 SELECT id,received_at,day,page,status,user_agent,referrer_domain FROM page_requests;
DROP TABLE page_requests;
DROP TABLE page_request_daily;
ALTER TABLE page_request_daily_v6 RENAME TO page_request_daily;
ALTER TABLE page_requests_v6 RENAME TO page_requests;
CREATE INDEX page_requests_received_at ON page_requests(received_at);
CREATE INDEX page_requests_page_time ON page_requests(page,received_at);
