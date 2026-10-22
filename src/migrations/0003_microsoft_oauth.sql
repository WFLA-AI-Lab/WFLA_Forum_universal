CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  linked_at TEXT NOT NULL,
  UNIQUE(provider, subject)
);
CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  return_to TEXT
);
