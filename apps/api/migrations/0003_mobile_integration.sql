CREATE TABLE mobile_profile_passes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,other_id)
);
CREATE TABLE mobile_message_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,match_id)
);
CREATE TABLE mobile_discovery_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  min_age INTEGER NOT NULL DEFAULT 18,
  max_age INTEGER NOT NULL DEFAULT 120,
  area TEXT NOT NULL DEFAULT ''
);
