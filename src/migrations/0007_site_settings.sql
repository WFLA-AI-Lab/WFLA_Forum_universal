-- 0007: public site configuration (skins, registration policy, SEO-ish metadata).
-- Values here are safe to expose to every visitor; secrets never live in this table.
INSERT INTO app_settings (key, value, is_secret, updated_by, updated_at)
VALUES
  ('default_skin', 'x', 0, NULL, '1970-01-01T00:00:00.000Z'),
  ('allowed_skins', 'x,endfield', 0, NULL, '1970-01-01T00:00:00.000Z'),
  ('guest_read_enabled', 'true', 0, NULL, '1970-01-01T00:00:00.000Z'),
  ('registration_enabled', 'true', 0, NULL, '1970-01-01T00:00:00.000Z'),
  ('site_tagline', '世外中学校园论坛', 0, NULL, '1970-01-01T00:00:00.000Z')
ON CONFLICT(key) DO NOTHING;