ALTER TABLE users ADD COLUMN external_provider TEXT;
ALTER TABLE users ADD COLUMN external_subject TEXT;
CREATE UNIQUE INDEX idx_users_external_subject ON users(external_provider, external_subject) WHERE external_provider IS NOT NULL AND external_subject IS NOT NULL;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_invitations_created ON invitations(created_at DESC);
