-- Optional, user-controlled presentation profile.
-- Real name / graduation year remain in users and keep their existing identity semantics.
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  avatar_data_url TEXT,
  updated_at TEXT NOT NULL
);
