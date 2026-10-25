-- 0010: admin console data, moderation history and hot query indexes.
ALTER TABLE invitations ADD COLUMN revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN revoked_at TEXT;

CREATE TABLE IF NOT EXISTS user_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sanctions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('mute','ban','restore')),
  reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status_created ON threads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC);
