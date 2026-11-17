import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const path = resolve(process.env.DATABASE_PATH ?? 'data/app.sqlite');
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS age_verifications (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unsubmitted' CHECK(status IN ('unsubmitted','pending','approved','rejected')),
    adult_confirmed_at TEXT, reviewed_at TEXT, reviewed_by TEXT
  );
  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL, age INTEGER NOT NULL CHECK(age BETWEEN 18 AND 120),
    area TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '',
    throat_classification TEXT NOT NULL DEFAULT 'pending' CHECK(throat_classification IN ('present','absent','pending')),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 4), storage_key TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL CHECK(media_type IN ('image/jpeg','image/png')),
    capture_source TEXT NOT NULL CHECK(capture_source='in_app_camera'), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS image_access_logs (
    id TEXT PRIMARY KEY, capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, accessed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL,
    PRIMARY KEY(from_user_id,to_user_id), CHECK(from_user_id<>to_user_id)
  );
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL,
    UNIQUE(user_a,user_b), CHECK(user_a<user_b)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), sent_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_by_match ON messages(match_id,sent_at);
  CREATE TABLE IF NOT EXISTS daily_topics (
    id TEXT PRIMARY KEY, topic_date TEXT NOT NULL UNIQUE, title TEXT NOT NULL, prompt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_answers (
    id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES daily_topics(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer TEXT NOT NULL CHECK(length(answer) BETWEEN 1 AND 2000), created_at TEXT NOT NULL,
    UNIQUE(topic_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL,
    PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open'
      CHECK(status IN ('open','reviewing','resolved','dismissed')),
    created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT, CHECK(reporter_id<>reported_id)
  );
`);
