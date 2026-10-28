import type { Env, SessionUser } from '../../env';
import { AppError, badRequest, forbidden, notFound } from '../../core/errors';
import { createId, nowIso } from '../../core/utils';
import { renderMarkdown } from '../content/markdown';
import { insertAudit } from '../moderation/audit';

export interface ConversationRow {
  id: string;
  type: 'direct' | 'group';
  direct_key: string | null;
  name: string | null;
  description: string | null;
  owner_user_id: string | null;
  last_message_id: string | null;
  last_message_at: string | null;
  status: 'active' | 'deleted';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  content_markdown: string;
  content_html: string;
  status: 'published' | 'deleted';
  created_at: string;
  deleted_at: string | null;
}

export interface MessageSenderRow {
  id: string;
  username: string;
  real_name: string;
  nickname: string | null;
  avatar_data_url: string | null;
  enrollment_year: string;
  role: SessionUser['role'];
  status: SessionUser['status'];
}

export interface MessageWithSender extends MessageRow {
  sender: MessageSenderRow | null;
}

export function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export async function findDirectConversation(env: Env, key: string): Promise<ConversationRow | null> {
  return await env.DB.prepare(
    'SELECT * FROM chat_conversations WHERE direct_key = ? AND status = ? LIMIT 1'
  ).bind(key, 'active').first<ConversationRow>();
}

export async function ensureDirectConversation(
  env: Env,
  actor: SessionUser,
  targetId: string
): Promise<ConversationRow> {
  if (actor.id === targetId) throw badRequest('不能和自己建立私聊');
  const target = await env.DB.prepare(
    'SELECT id, status FROM users WHERE id = ?'
  ).bind(targetId).first<{ id: string; status: SessionUser['status'] }>();
  if (!target) throw notFound('用户不存在');
  if (target.status === 'deleted' || target.status === 'banned') {
    throw badRequest('该用户当前不可接收私聊');
  }
  if (await isBlocked(env, targetId, actor.id)) throw forbidden('对方已屏蔽你，无法建立私聊');
  const key = directKey(actor.id, targetId);
  const existing = await findDirectConversation(env, key);
  if (existing) {
    await ensureMembership(env, existing.id, actor.id);
    return existing;
  }
  const timestamp = nowIso();
  const id = createId();
  await env.DB.prepare(
    `INSERT INTO chat_conversations
       (id, type, direct_key, name, description, owner_user_id, last_message_id,
        last_message_at, status, created_by, created_at, updated_at, deleted_at)
     VALUES (?, 'direct', ?, NULL, NULL, NULL, NULL, NULL, 'active', ?, ?, ?, NULL)`
  ).bind(id, key, actor.id, timestamp, timestamp).run();
  await env.DB.prepare(
    `INSERT INTO chat_members (conversation_id, user_id, role, joined_at, left_at, last_read_message_id, last_read_at)
     VALUES (?, ?, 'member', ?, NULL, NULL, NULL)`
  ).bind(id, actor.id, timestamp).run();
  await env.DB.prepare(
    `INSERT INTO chat_members (conversation_id, user_id, role, joined_at, left_at, last_read_message_id, last_read_at)
     VALUES (?, ?, 'member', ?, NULL, NULL, NULL)`
  ).bind(id, targetId, timestamp).run();
  const conversation = await findDirectConversation(env, key);
  if (!conversation) throw new AppError('INTERNAL_ERROR', '私聊会话创建失败');
  return conversation;
}

export async function ensureMembership(env: Env, conversationId: string, userId: string): Promise<void> {
  const existing = await env.DB.prepare(
    'SELECT left_at FROM chat_members WHERE conversation_id = ? AND user_id = ?'
  ).bind(conversationId, userId).first<{ left_at: string | null }>();
  if (existing && existing.left_at === null) return;
  throw forbidden('你不是该会话的有效成员');
}

export async function requireConversation(
  env: Env,
  conversationId: string,
  userId: string,
  options: { requireActiveMember?: boolean } = { requireActiveMember: true }
): Promise<ConversationRow> {
  const conversation = await env.DB.prepare(
    'SELECT * FROM chat_conversations WHERE id = ? LIMIT 1'
  ).bind(conversationId).first<ConversationRow>();
  if (!conversation || conversation.status === 'deleted') throw notFound('会话不存在');
  if (options.requireActiveMember !== false) {
    const member = await env.DB.prepare(
      'SELECT left_at FROM chat_members WHERE conversation_id = ? AND user_id = ?'
    ).bind(conversationId, userId).first<{ left_at: string | null }>();
    if (!member || member.left_at !== null) throw forbidden('你不是该会话的有效成员');
  }
  return conversation;
}

export async function isBlocked(env: Env, blockerId: string, blockedId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM chat_user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1'
  ).bind(blockerId, blockedId).first();
  return row !== null;
}

export async function getMessageWithSender(env: Env, messageId: string): Promise<MessageWithSender | null> {
  const row = await env.DB.prepare(
    `SELECT m.*, u.id AS sender_user_id, u.username AS sender_username,
            u.real_name AS sender_real_name, u.enrollment_year AS sender_enrollment_year,
            u.role AS sender_role, u.status AS sender_status,
            up.nickname AS sender_nickname, up.avatar_data_url AS sender_avatar_data_url
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE m.id = ? LIMIT 1`
  ).bind(messageId).first<MessageRow & {
    sender_user_id: string | null;
    sender_username: string | null;
    sender_real_name: string | null;
    sender_enrollment_year: string | null;
    sender_role: SessionUser['role'] | null;
    sender_status: SessionUser['status'] | null;
    sender_nickname: string | null;
    sender_avatar_data_url: string | null;
  }>();
  if (!row) return null;
  const sender = row.sender_user_id ? {
    id: row.sender_user_id,
    username: row.sender_username ?? '',
    real_name: row.sender_real_name ?? '',
    nickname: row.sender_nickname ?? row.sender_real_name ?? '',
    avatar_data_url: row.sender_avatar_data_url ?? null,
    enrollment_year: row.sender_enrollment_year ?? '',
    role: row.sender_role ?? 'member',
    status: row.sender_status ?? 'deleted'
  } : null;
  return { ...row, sender };
}

export async function assertCanSendDirect(
  env: Env,
  conversation: ConversationRow,
  senderId: string
): Promise<void> {
  const member = await env.DB.prepare(
    `SELECT cm.user_id, cm.left_at, u.status
       FROM chat_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ? LIMIT 1`
  ).bind(conversation.id, senderId).first<{ user_id: string; left_at: string | null; status: SessionUser['status'] }>();
  if (!member) throw new AppError('INTERNAL_ERROR', '私聊成员数据不完整');
  if (member.left_at !== null) throw notFound('对方已退出该私聊');
  if (await isBlocked(env, member.user_id, senderId)) throw forbidden('对方已屏蔽你，无法发送私聊');
}

export async function createMessage(
  env: Env,
  input: { conversationId: string; senderId: string; clientId: string; content: string }
): Promise<MessageWithSender> {
  const existing = await env.DB.prepare(
    `SELECT id FROM chat_messages
      WHERE conversation_id = ? AND sender_id = ? AND client_id = ? LIMIT 1`
  ).bind(input.conversationId, input.senderId, input.clientId).first<{ id: string }>();
  if (existing) {
    const message = await getMessageWithSender(env, existing.id);
    if (message) return message;
  }

  const timestamp = nowIso();
  const id = createId();
  const html = renderMarkdown(input.content);
  await env.DB.prepare(
    `INSERT INTO chat_messages
       (id, conversation_id, sender_id, client_id, content_markdown, content_html, status, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, 'published', ?, NULL)`
  ).bind(id, input.conversationId, input.senderId, input.clientId, input.content, html, timestamp).run();
  await env.DB.prepare(
    `UPDATE chat_conversations
        SET last_message_id = ?, last_message_at = ?, updated_at = ?
      WHERE id = ? AND status = 'active'`
  ).bind(id, timestamp, timestamp, input.conversationId).run();
  const message = await getMessageWithSender(env, id);
  if (!message) throw new AppError('INTERNAL_ERROR', '消息创建失败');
  return message;
}

export async function conversationJson(
  env: Env,
  conversation: ConversationRow,
  viewerId: string
): Promise<Record<string, unknown>> {
  const member = await env.DB.prepare(
    'SELECT joined_at, left_at, last_read_message_id, last_read_at FROM chat_members WHERE conversation_id = ? AND user_id = ?'
  ).bind(conversation.id, viewerId).first<{
    joined_at: string; left_at: string | null; last_read_message_id: string | null; last_read_at: string | null;
  }>();
  let counterpart = null;
  let blockedByMe = false;
  let blockedMe = false;
  if (conversation.type === 'direct') {
    counterpart = await env.DB.prepare(
      `SELECT u.id, u.username, u.real_name, u.enrollment_year, u.role, u.status,
              up.nickname, up.avatar_data_url
         FROM chat_members cm JOIN users u ON u.id = cm.user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE cm.conversation_id = ? AND cm.user_id != ? LIMIT 1`
    ).bind(conversation.id, viewerId).first();
    if (counterpart && typeof counterpart === 'object' && 'id' in counterpart) {
      const counterpartId = String(counterpart.id);
      [blockedByMe, blockedMe] = await Promise.all([
        isBlocked(env, viewerId, counterpartId),
        isBlocked(env, counterpartId, viewerId)
      ]);
    }
  }
  let owner = null;
  if (conversation.type === 'group' && conversation.owner_user_id) {
    owner = await env.DB.prepare(
      `SELECT u.id, u.username, u.real_name, u.enrollment_year, u.role, u.status,
              up.nickname, up.avatar_data_url
         FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = ?`
    ).bind(conversation.owner_user_id).first();
  }
  const lastMessage = conversation.last_message_id
    ? await getMessageWithSender(env, conversation.last_message_id)
    : null;
  const unread = member?.last_read_message_id
    ? await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM chat_messages
        WHERE conversation_id = ? AND (created_at, id) >
          (SELECT created_at, id FROM chat_messages WHERE id = ?)
          AND status = 'published' AND sender_id != ?`
    ).bind(conversation.id, member.last_read_message_id, viewerId).first<{ total: number }>()
    : await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM chat_messages
        WHERE conversation_id = ? AND status = 'published' AND sender_id != ?`
    ).bind(conversation.id, viewerId).first<{ total: number }>();
  return {
    id: conversation.id,
    type: conversation.type,
    title: conversation.type === 'direct' ? counterpart?.nickname ?? counterpart?.real_name ?? '私聊' : conversation.name,
    description: conversation.description,
    counterpart,
    blocked_by_me: blockedByMe,
    blocked_me: blockedMe,
    owner,
    last_message: lastMessage,
    last_message_at: conversation.last_message_at,
    unread_count: Number(unread?.total ?? 0),
    member: member ? {
      joined_at: member.joined_at,
      left_at: member.left_at,
      last_read_message_id: member.last_read_message_id,
      last_read_at: member.last_read_at
    } : null,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at
  };
}

export async function listMembers(
  env: Env,
  conversationId: string,
  includeLeft = false
): Promise<Array<MessageSenderRow & { user_id: string; joined_at: string; left_at: string | null }>> {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.real_name, u.enrollment_year, u.role, u.status,
            up.nickname, up.avatar_data_url,
            cm.user_id, cm.joined_at, cm.left_at
       FROM chat_members cm JOIN users u ON u.id = cm.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE cm.conversation_id = ? ${includeLeft ? '' : 'AND cm.left_at IS NULL'}
      ORDER BY cm.joined_at ASC, cm.user_id ASC`
  ).bind(conversationId).all<MessageSenderRow & { user_id: string; joined_at: string; left_at: string | null }>();
  return rows.results ?? [];
}

export async function auditChatAccess(
  env: Env,
  actorId: string,
  reportId: string,
  conversationId: string,
  context: { first_id: string | null; last_id: string | null; total: number }
): Promise<void> {
  await insertAudit(
    env,
    actorId,
    'chat.report_context_access',
    'report',
    reportId,
    '监管者查看被举报消息上下文',
    { conversation_id: conversationId, context_first_id: context.first_id, context_last_id: context.last_id, context_total: context.total }
  );
}
