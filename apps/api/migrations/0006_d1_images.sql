-- Small, private image objects for the exhibition. Chunks keep SQL exports
-- below D1's per-statement length limit; each object is capped by the API.
CREATE TABLE image_objects (
  object_key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 1800000),
  updated_at TEXT NOT NULL
);
CREATE TABLE image_chunks (
  object_key TEXT NOT NULL REFERENCES image_objects(object_key) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data BLOB NOT NULL CHECK(length(data)<=32768),
  PRIMARY KEY(object_key,chunk_index)
);
