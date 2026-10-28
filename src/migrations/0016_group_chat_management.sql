-- 0016: QQ-style member-managed group chats.
--
-- Existing administrator-created groups remain available. Their configured
-- owner becomes the group owner; all other memberships stay ordinary members.

ALTER TABLE chat_conversations ADD COLUMN announcement TEXT NOT NULL DEFAULT '';

ALTER TABLE chat_members RENAME TO chat_members_v14;

CREATE TABLE chat_members (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  group_nickname TEXT,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  last_read_message_id TEXT,
  last_read_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

INSERT INTO chat_members
  (conversation_id, user_id, role, group_nickname, joined_at, left_at,
   last_read_message_id, last_read_at)
SELECT cm.conversation_id,
       cm.user_id,
       CASE
         WHEN cc.type = 'group' AND cc.owner_user_id = cm.user_id THEN 'owner'
         ELSE 'member'
       END,
       NULL,
       cm.joined_at,
       cm.left_at,
       cm.last_read_message_id,
       cm.last_read_at
  FROM chat_members_v14 cm
  JOIN chat_conversations cc ON cc.id = cm.conversation_id;

DROP TABLE chat_members_v14;

CREATE INDEX idx_chat_members_user
  ON chat_members(user_id, left_at, conversation_id);
CREATE INDEX idx_chat_members_conversation
  ON chat_members(conversation_id, left_at, role, user_id);
