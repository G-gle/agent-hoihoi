-- Preserve existing UUIDs, text, timestamps and publication decisions.
CREATE TABLE guestbook_posts_v5 (
  public_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reply_to_id TEXT REFERENCES guestbook_posts_v5(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'message' CHECK (category IN ('message','unfinished_output')),
  source_kind TEXT,
  article_id TEXT,
  who TEXT,
  chooser TEXT,
  purpose TEXT,
  submission_key TEXT UNIQUE,
  content_fingerprint TEXT,
  receipt_id TEXT UNIQUE,
  submission_method TEXT CHECK (submission_method IN ('GET','POST'))
);
INSERT INTO guestbook_posts_v5 (id,created_at,name,message,status)
  SELECT id,created_at,name,message,status FROM guestbook_posts ORDER BY created_at,id;
DROP TABLE guestbook_posts;
ALTER TABLE guestbook_posts_v5 RENAME TO guestbook_posts;
CREATE INDEX guestbook_public ON guestbook_posts(status,created_at DESC,id DESC);
CREATE INDEX guestbook_replies ON guestbook_posts(reply_to_id);

CREATE TABLE response_answers (
  response_group_id TEXT NOT NULL,
  question_id TEXT NOT NULL CHECK (question_id IN ('who','visit','chooser','purpose','reaction')),
  target_id TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (response_group_id,question_id,target_id)
);
CREATE INDEX response_totals ON response_answers(question_id,target_id,value);
