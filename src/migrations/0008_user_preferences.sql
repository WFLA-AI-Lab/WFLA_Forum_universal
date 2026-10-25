-- 0008: per-account user preferences.
--
-- First consumer: the skin a signed-in member has chosen, so the choice follows
-- them across devices instead of living only in browser localStorage.
--
-- The table is intentionally generic (nullable columns, room to grow) so later
-- preferences can be added with an ALTER TABLE instead of a new table.
-- Rows are per-user; deleting a user cascades.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  skin_id TEXT,
  updated_at TEXT NOT NULL
);