-- Verification is no longer part of the product. Legacy verification records are
-- retained by this additive migration, but no running API reads or writes them.
ALTER TABLE discovery_impressions ADD COLUMN impressions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE auth_attempts ADD COLUMN expires_at TEXT;
ALTER TABLE messages ADD COLUMN sequence INTEGER;
UPDATE messages SET sequence=rowid;
CREATE UNIQUE INDEX messages_sequence_idx ON messages(sequence);
CREATE TRIGGER messages_sequence AFTER INSERT ON messages WHEN NEW.sequence IS NULL
BEGIN UPDATE messages SET sequence=NEW.rowid WHERE id=NEW.id; END;
CREATE TABLE message_reads (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 0, read_at TEXT NOT NULL,
  PRIMARY KEY(match_id,user_id)
);
CREATE TABLE discovery_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  accepted_purposes TEXT NOT NULL DEFAULT '[]', accepted_paces TEXT NOT NULL DEFAULT '[]',
  preferred_classification TEXT CHECK(preferred_classification IN ('present','absent','pending')),
  min_age INTEGER NOT NULL DEFAULT 18, max_age INTEGER NOT NULL DEFAULT 120
);
CREATE TABLE email_actions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('verify','reset')), expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, available_at TEXT NOT NULL, last_error TEXT
);
CREATE TABLE user_limits (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('all','messaging','posting','discovery')),
  reason TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
ALTER TABLE appeals ADD COLUMN limit_id TEXT REFERENCES user_limits(id) ON DELETE SET NULL;
CREATE TABLE admin_staff (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  roles TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES admin_staff(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
ALTER TABLE captures ADD COLUMN original_key TEXT;
ALTER TABLE captures ADD COLUMN regions TEXT;
ALTER TABLE date_plans ADD COLUMN scope_low TEXT NOT NULL DEFAULT '{}';
ALTER TABLE date_plans ADD COLUMN scope_high TEXT NOT NULL DEFAULT '{}';
ALTER TABLE date_plans ADD COLUMN expires_low TEXT;
ALTER TABLE date_plans ADD COLUMN expires_high TEXT;
ALTER TABLE date_plans ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_jobs ADD COLUMN expo_token TEXT;
ALTER TABLE push_jobs ADD COLUMN ticket_id TEXT;
ALTER TABLE push_jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE push_jobs ADD COLUMN available_at TEXT;
ALTER TABLE push_jobs ADD COLUMN last_error TEXT;
CREATE TABLE daily_deliveries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES daily_topics(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,topic_id)
);
CREATE INDEX user_limits_active_idx ON user_limits(user_id,expires_at);
CREATE INDEX email_outbox_pending_idx ON email_outbox(status,available_at);
CREATE INDEX push_jobs_pending_idx ON push_jobs(status,available_at);
