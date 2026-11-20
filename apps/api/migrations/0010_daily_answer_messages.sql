ALTER TABLE messages ADD COLUMN daily_topic_id TEXT REFERENCES daily_topics(id) ON DELETE SET NULL;

-- Last answer delivered to each conversation, used to deduplicate retries atomically.
CREATE TABLE daily_answer_deliveries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES daily_topics(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  PRIMARY KEY(user_id,topic_id,match_id)
);
