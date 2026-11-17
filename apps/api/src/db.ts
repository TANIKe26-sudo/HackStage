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
  CREATE TABLE IF NOT EXISTS matching_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    relationship_goal TEXT NOT NULL DEFAULT 'undecided' CHECK(relationship_goal IN ('serious','casual','friendship','undecided')),
    conversation_pace TEXT NOT NULL DEFAULT 'balanced' CHECK(conversation_pace IN ('slow','balanced','frequent')),
    preferred_classification TEXT CHECK(preferred_classification IN ('present','absent')),
    accepted_goals TEXT NOT NULL DEFAULT '["serious","casual","friendship","undecided"]',
    accepted_paces TEXT NOT NULL DEFAULT '["slow","balanced","frequent"]',
    location_visibility TEXT NOT NULL DEFAULT 'area' CHECK(location_visibility IN ('hidden','area')),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS discovery_impressions (
    viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    impressions INTEGER NOT NULL DEFAULT 0, last_shown_at TEXT NOT NULL,
    PRIMARY KEY(viewer_id,candidate_id), CHECK(viewer_id<>candidate_id)
  );
  CREATE TABLE IF NOT EXISTS contact_hides (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_digest TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(user_id,contact_digest)
  );
  CREATE TABLE IF NOT EXISTS user_contact_identifiers (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('email','phone')), contact_digest TEXT NOT NULL,
    verified_at TEXT, created_at TEXT NOT NULL,
    PRIMARY KEY(user_id,kind,contact_digest)
  );
  CREATE TABLE IF NOT EXISTS stage_grants (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    grantor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grantee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 4), expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL, revoked_at TEXT,
    UNIQUE(match_id,grantor_id,grantee_id), CHECK(grantor_id<>grantee_id)
  );
  CREATE TABLE IF NOT EXISTS date_plans (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at TEXT NOT NULL, area TEXT NOT NULL, location_ciphertext TEXT,
    scope_a TEXT NOT NULL DEFAULT '{}', scope_b TEXT NOT NULL DEFAULT '{}',
    expires_a TEXT, expires_b TEXT, consented_a_at TEXT, consented_b_at TEXT,
    confirmed_a_at TEXT, confirmed_b_at TEXT, arrived_a_at TEXT, arrived_b_at TEXT,
    status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','confirmed','cancelled','expired')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, actor_id TEXT, actor_role TEXT NOT NULL,
    action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS safety_flags (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL, match_id TEXT NOT NULL,
    sender_id TEXT NOT NULL, categories_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
      CHECK(status IN ('open','reviewing','resolved','dismissed')),
    created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT, decision TEXT
  );
  CREATE TABLE IF NOT EXISTS user_limits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'messaging' CHECK(scope IN ('messaging','discovery','posting','all')),
    reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT, revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS appeals (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    limit_id TEXT REFERENCES user_limits(id) ON DELETE SET NULL, reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT, review_note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, read_at TEXT
  );
  CREATE TABLE IF NOT EXISTS push_devices (
    expo_push_token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_jobs (
    id TEXT PRIMARY KEY, notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued'
      CHECK(status IN ('queued','sent','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL,
    ticket_id TEXT, last_error TEXT, created_at TEXT NOT NULL,
    UNIQUE(notification_id,expo_push_token)
  );
  CREATE TABLE IF NOT EXISTS chat_clears (
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, cleared_at TEXT NOT NULL,
    PRIMARY KEY(match_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS auth_attempts (
    id TEXT PRIMARY KEY, email_digest TEXT NOT NULL, ip_digest TEXT NOT NULL,
    successful INTEGER NOT NULL, attempted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS safety_flags_open ON safety_flags(status,created_at);
  CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(user_id,read_at,created_at);
  CREATE INDEX IF NOT EXISTS push_jobs_ready ON push_jobs(status,available_at);
`);

// Additive migration for sessions created by earlier API versions.
const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
if (!sessionColumns.some(column => column.name === 'device_name')) {
  db.exec("ALTER TABLE sessions ADD COLUMN device_name TEXT NOT NULL DEFAULT ''");
}
