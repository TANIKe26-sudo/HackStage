-- Keep established mobile settings/decisions when merging the modular API.
ALTER TABLE discovery_preferences ADD COLUMN area TEXT NOT NULL DEFAULT '';
INSERT OR IGNORE INTO discovery_preferences(user_id,min_age,max_age,area)
  SELECT user_id,min_age,max_age,area FROM mobile_discovery_preferences;
UPDATE discovery_preferences SET
  min_age=CASE WHEN min_age=18 AND max_age=120 THEN (SELECT min_age FROM mobile_discovery_preferences m WHERE m.user_id=discovery_preferences.user_id) ELSE min_age END,
  max_age=CASE WHEN min_age=18 AND max_age=120 THEN (SELECT max_age FROM mobile_discovery_preferences m WHERE m.user_id=discovery_preferences.user_id) ELSE max_age END,
  area=(SELECT area FROM mobile_discovery_preferences m WHERE m.user_id=discovery_preferences.user_id)
WHERE EXISTS(SELECT 1 FROM mobile_discovery_preferences m WHERE m.user_id=discovery_preferences.user_id);
INSERT INTO message_reads(match_id,user_id,sequence,read_at)
  SELECT match_id,user_id,last_sequence,datetime('now') FROM mobile_message_reads WHERE 1
  ON CONFLICT(match_id,user_id) DO UPDATE SET sequence=MAX(message_reads.sequence,excluded.sequence);
-- Previous connect uploads were already cropped, but had no original_key.
-- Preserve their object keys and use the known public/<owner>/<group>/<stage> format.
