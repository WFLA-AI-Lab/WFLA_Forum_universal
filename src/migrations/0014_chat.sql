-- 0014: direct messages and administrator-managed group conversations.
--
-- Self-hosted SQLite is the acceptance target. The chat is intentionally
-- polling-based: no WebSocket/SSE/Durable Object dependency is introduced.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('direct','group')),
  direct_key TEXT UNIQUE,
  name TEXT,
  description TEXT,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_message_id TEXT,
  last_message_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_activity
  ON chat_conversations(status, last_message_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_type
  ON chat_conversations(type, status);

CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  last_read_message_id TEXT,
  last_read_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user
  ON chat_members(user_id, left_at, conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_conversation
  ON chat_members(conversation_id, left_at, user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  content_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted')),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(conversation_id, sender_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_order
  ON chat_messages(conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
  ON chat_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_status
  ON chat_messages(conversation_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_user_blocks_blocked
  ON chat_user_blocks(blocked_id, blocker_id);

-- SQLite cannot alter an existing CHECK constraint. These two one-way table
-- rebuilds preserve all published rows and add the chat message target type.
-- The self-host migration runner applies the whole file in one transaction.
ALTER TABLE reports RENAME TO reports_v13;
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('thread','post','user','message')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','rejected')),
  assigned_to TEXT REFERENCES users(id),
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(reporter_id, target_type, target_id)
);
INSERT INTO reports
  SELECT id, reporter_id, target_type, target_id, reason, details, status,
         assigned_to, resolution, created_at, updated_at
    FROM reports_v13;
DROP TABLE reports_v13;
CREATE INDEX idx_reports_queue ON reports(status, created_at);

ALTER TABLE risk_events RENAME TO risk_events_v13;
CREATE TABLE risk_events (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES moderation_rules(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread','post','user','message')),
  target_id TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at TEXT NOT NULL
);
INSERT INTO risk_events
  SELECT id, rule_id, target_type, target_id, actor_id, score, reason,
         metadata, status, created_at
    FROM risk_events_v13;
DROP TABLE risk_events_v13;
CREATE INDEX idx_risk_events_target ON risk_events(target_type, target_id, created_at DESC);
CREATE INDEX idx_risk_events_status ON risk_events(status, created_at DESC);
