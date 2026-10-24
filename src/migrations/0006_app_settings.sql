-- Runtime-editable site settings. Secret values are AES-GCM encrypted by the application.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0 CHECK (is_secret IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_app_settings_updated_at ON app_settings(updated_at DESC);