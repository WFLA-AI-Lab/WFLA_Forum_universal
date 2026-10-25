-- 0013: auditable automation, appeals and expiring sanctions.
CREATE TABLE IF NOT EXISTS moderation_rules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('report_threshold','sensitive_words','high_link_density','duplicate_content','new_user_flood')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  threshold INTEGER NOT NULL DEFAULT 3,
  config TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_rules_kind_enabled ON moderation_rules(kind, enabled);

CREATE TABLE IF NOT EXISTS risk_events (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES moderation_rules(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread','post','user')),
  target_id TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_events_target ON risk_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_status ON risk_events(status, created_at DESC);

CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sanction_id TEXT REFERENCES sanctions(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  resolution TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id, submitted_at DESC);

ALTER TABLE sanctions ADD COLUMN resolved_at TEXT;

INSERT INTO moderation_rules (id, kind, name, description, enabled, threshold, config, created_at, updated_at)
VALUES
  ('rule-report-threshold', 'report_threshold', '举报阈值自动隐藏', '同一话题或回复收到多个独立举报后自动隐藏并通知监管者。', 1, 3, '{}', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
  ('rule-sensitive-words', 'sensitive_words', '高风险词预警', '命中高风险词时自动隐藏并生成风险事件。', 1, 1, '{"words":["赌博","毒品","色情","诈骗","人肉","自杀","炸弹","枪支"]}', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
  ('rule-link-density', 'high_link_density', '高链接密度', '单条内容外链数量异常时自动隐藏。', 1, 5, '{}', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
  ('rule-duplicate-content', 'duplicate_content', '重复灌水检测', '短时间内发布相同内容时自动隐藏。', 1, 1, '{"window_minutes":10}', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
  ('rule-new-user-flood', 'new_user_flood', '新用户高频发布', '新账号短时间内发布过多内容时自动隐藏。', 1, 5, '{"window_minutes":10}', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z');
