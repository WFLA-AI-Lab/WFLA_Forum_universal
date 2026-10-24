-- Store which provider initiated an OAuth flow and whether it is login or linking.
ALTER TABLE oauth_states ADD COLUMN provider TEXT NOT NULL DEFAULT 'microsoft';
ALTER TABLE oauth_states ADD COLUMN mode TEXT NOT NULL DEFAULT 'login';
ALTER TABLE oauth_states ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_states_provider ON oauth_states(provider, expires_at);