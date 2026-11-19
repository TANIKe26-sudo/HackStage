ALTER TABLE users ADD COLUMN appwrite_id TEXT;
CREATE UNIQUE INDEX users_appwrite_id_idx ON users(appwrite_id);
ALTER TABLE sessions ADD COLUMN appwrite_secret_cipher TEXT;
CREATE TABLE appwrite_deletions (
  appwrite_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
