PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','limited','suspended','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  birth_year INTEGER,
  area TEXT,
  bio TEXT NOT NULL DEFAULT '',
  purpose TEXT,
  conversation_pace TEXT,
  throat_class TEXT NOT NULL DEFAULT 'pending' CHECK(throat_class IN ('present','absent','pending')),
  location_scope TEXT NOT NULL DEFAULT 'hidden' CHECK(location_scope IN ('hidden','area','meetup')),
  updated_at TEXT NOT NULL
);
CREATE TABLE age_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  verified_at TEXT,
  reviewed_by TEXT
);
CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 4),
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX captures_owner_idx ON captures(owner_id,stage);
CREATE TABLE image_access_logs (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accessed_at TEXT NOT NULL
);
CREATE TABLE likes (
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(from_user,to_user), CHECK(from_user <> to_user)
);
CREATE TABLE discovery_impressions (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shown_at TEXT NOT NULL,
  PRIMARY KEY(viewer_id,candidate_id)
);
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  user_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(user_low,user_high), CHECK(user_low < user_high)
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  warning TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX messages_match_idx ON messages(match_id,created_at);
CREATE TABLE daily_topics (
  id TEXT PRIMARY KEY,
  topic_date TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE daily_answers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES daily_topics(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,topic_id)
);
CREATE TABLE stage_grants (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 4),
  consented_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(owner_id,viewer_id,stage)
);
CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(blocker_id,blocked_id)
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE safety_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT
);
CREATE TABLE appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE TABLE push_devices (
  expo_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE push_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE date_plans (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  place_label TEXT NOT NULL,
  exact_location_cipher TEXT,
  share_expires_at TEXT,
  share_consent_user_low INTEGER NOT NULL DEFAULT 0,
  share_consent_user_high INTEGER NOT NULL DEFAULT 0,
  confirmed_user_low INTEGER NOT NULL DEFAULT 0,
  confirmed_user_high INTEGER NOT NULL DEFAULT 0,
  arrived_user_low_at TEXT,
  arrived_user_high_at TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  updated_at TEXT NOT NULL
);
CREATE TABLE contact_hides (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,contact_hash)
);
CREATE TABLE user_contact_identifiers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_hash TEXT NOT NULL,
  PRIMARY KEY(user_id,contact_hash)
);
CREATE TABLE auth_attempts (
  key_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  subject_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);
