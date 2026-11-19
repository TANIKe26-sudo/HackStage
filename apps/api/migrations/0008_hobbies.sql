ALTER TABLE profiles ADD COLUMN hobbies TEXT NOT NULL DEFAULT '[]';
ALTER TABLE discovery_preferences ADD COLUMN accepted_hobbies TEXT NOT NULL DEFAULT '[]';
