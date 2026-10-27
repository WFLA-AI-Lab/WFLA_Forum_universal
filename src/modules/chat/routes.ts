import { Hono } from 'hono';
import type { Env } from '../../env';
import { badRequest, forbidden, notFound } from '../../core/errors';
import { chatClientSchema, chatMessageSchema, idSchema } from '../../core/validation';
import { nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import {
  assertCanSendDirect,
  conversationJson,
  createMessage,
  ensureDirectConversation,
  listMembers,
  requireConversation,
  getMessageWithSender
} from './service';
import { applyChatRules } from '../moderation/automation';
import type { ConversationRow, MessageWithSender } from './service';

interface ConversationListRow extends ConversationRow {
  member_left_at: string | null;
  member_last_read_message_id: string | null;
}

function parseLimit(value: string | undefined, fallback: number, max: number): number {
  const limit = Number(value ?? fallback);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw badRequest('分页大小无效');
  return limit;
}

async function cursorConversationExists(env: Env, id: string): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 FROM chat_conversations WHERE id = ? LIMIT 1').bind(id).first();
  if (!row) throw badRequest('游标无效');
}

async function cursorMessageExists(env: Env, id: string): Promise<void> {
  const row = await env.DB.prepare('SELECT 1 FROM chat_messages WHERE id = ? LIMIT 1').bind(id).first();
  if (!row) throw badRequest('游标无效');
}

export const chatRoutes = new Hono<{ Bindings: Env }>();

chatRoutes.post('/conversations/direct', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'active') throw forbidden('当前账号状态不能发起私聊');
  const body = await c.req.json().catch(() => null);
  const targetId = idSchema.parse(body?.user_id);
  const conversation = await ensureDirectConversation(c.env, actor, targetId);
  return c.json({ item: await conversationJson(c.env, conversation, actor.id) }, conversation.last_message_at ? 200 : 201);
});

chatRoutes.get('/conversations', async c => {
  const actor = await requireUser(c);
  const limit = parseLimit(c.req.query('limit'), 20, 50);
  const type = c.req.query('type');
  if (type && !['direct', 'group'].includes(type)) throw badRequest('会话类型无效');
  const cursor = c.req.query('cursor') ?? null;
  if (cursor) {
    await cursorConversationExists(c.env, cursor);
  }
  const rows = await c.env.DB.prepare(
    `SELECT cc.*, cm.left_at AS member_left_at, cm.last_read_message_id AS member_last_read_message_id
       FROM chat_conversations cc
       JOIN chat_members cm ON cm.conversation_id = cc.id
      WHERE cm.user_id = ? AND cm.left_at IS NULL AND cc.status = 'active'
        AND (? IS NULL OR type = ?)
        AND (? IS NULL OR (COALESCE(cc.last_message_at, cc.created_at), cc.id) <
          (SELECT COALESCE(last_message_at, created_at), id FROM chat_conversations WHERE id = ?))
      ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC, cc.id DESC
      LIMIT ?`
  ).bind(actor.id, type ?? null, type ?? null, cursor, cursor, limit + 1)
    .all<ConversationListRow>();
  const page = (rows.results ?? []).slice(0, limit);
  const items = [];
  for (const row of page) items.push(await conversationJson(c.env, row, actor.id));
  return c.json({
    items,
    next_cursor: (rows.results ?? []).length > limit ? page[page.length - 1]?.id ?? null : null
  });
});

chatRoutes.get('/conversations/:id', async c => {
  const actor = await requireUser(c);
  const conversation = await requireConversation(c.env, c.req.param('id'), actor.id);
  const members = await listMembers(c.env, conversation.id);
  const json = await conversationJson(c.env, conversation, actor.id);
  return c.json({ item: { ...json, members } });
});

chatRoutes.get('/conversations/:id/messages', async c => {
  const actor = await requireUser(c);
  const conversation = await requireConversation(c.env, c.req.param('id'), actor.id);
  const before = c.req.query('before') ?? null;
  const after = c.req.query('after') ?? null;
  if (before && after) throw badRequest('before 和 after 不能同时使用');
  const limit = parseLimit(c.req.query('limit'), 50, 100);
  if (before) await cursorMessageExists(c.env, before);
  if (after) await cursorMessageExists(c.env, after);

  const rows = await c.env.DB.prepare(
    `SELECT m.*, u.id AS sender_user_id, u.username AS sender_username,
            u.real_name AS sender_real_name, u.enrollment_year AS sender_enrollment_year,
            u.role AS sender_role, u.status AS sender_status
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
        AND (? IS NULL OR (m.created_at, m.id) <
          (SELECT created_at, id FROM chat_messages WHERE id = ?))
        AND (? IS NULL OR (m.created_at, m.id) >
          (SELECT created_at, id FROM chat_messages WHERE id = ?))
      ORDER BY m.created_at ${after ? 'ASC' : 'DESC'}, m.id ${after ? 'ASC' : 'DESC'}
      LIMIT ?`
  ).bind(conversation.id, before, before, after, after, limit + 1)
    .all<MessageWithSender & {
      sender_user_id: string | null; sender_username: string | null; sender_real_name: string | null;
      sender_enrollment_year: string | null; sender_role: string | null; sender_status: string | null;
    }>();
  const all = (rows.results ?? []).slice(0, limit).map(row => ({
    ...row,
    sender: row.sender_user_id ? {
      id: row.sender_user_id,
      username: row.sender_username ?? '',
      real_name: row.sender_real_name ?? '',
      enrollment_year: row.sender_enrollment_year ?? '',
      role: row.sender_role ?? 'member',
      status: row.sender_status ?? 'deleted'
    } : null
  }));
  const latest = await c.env.DB.prepare(
    `SELECT id, created_at FROM chat_messages WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(conversation.id).first<{ id: string; created_at: string }>();
  return c.json({
    items: all,
    next_cursor: !after && (rows.results ?? []).length > limit ? all[all.length - 1]?.id ?? null : null,
    next_after: after ? all[all.length - 1]?.id ?? after : latest?.id ?? null,
    latest_message_id: latest?.id ?? null,
    latest_message_at: latest?.created_at ?? null
  });
});

chatRoutes.post('/conversations/:id/messages', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'active') throw forbidden('当前账号状态不能发送消息');
  const conversation = await requireConversation(c.env, c.req.param('id'), actor.id);
  const body = await c.req.json().catch(() => null);
  const clientId = chatClientSchema.parse(body?.client_id);
  const content = chatMessageSchema.parse(body?.content);
  if (conversation.type === 'direct') await assertCanSendDirect(c.env, conversation, actor.id);
  const message = await createMessage(c.env, {
    conversationId: conversation.id,
    senderId: actor.id,
    clientId,
    content
  });
  await applyChatRules(c.env, {
    messageId: message.id,
    conversationId: conversation.id,
    senderId: actor.id,
    content
  });
  const storedMessage = await getMessageWithSender(c.env, message.id);
  return c.json({ item: storedMessage }, 201);
});

chatRoutes.post('/conversations/:id/read', async c => {
  const actor = await requireUser(c);
  const conversation = await requireConversation(c.env, c.req.param('id'), actor.id);
  const body = await c.req.json().catch(() => null);
  const messageId = idSchema.parse(body?.message_id);
  const target = await c.env.DB.prepare(
    'SELECT id, created_at FROM chat_messages WHERE id = ? AND conversation_id = ? LIMIT 1'
  ).bind(messageId, conversation.id).first<{ id: string; created_at: string }>();
  if (!target) throw notFound('消息不存在');
  const current = await c.env.DB.prepare(
    `SELECT m.id, m.created_at FROM chat_messages m
       JOIN chat_members cm ON cm.last_read_message_id = m.id
      WHERE cm.conversation_id = ? AND cm.user_id = ? LIMIT 1`
  ).bind(conversation.id, actor.id).first<{ id: string; created_at: string }>();
  if (!current || target.created_at > current.created_at) {
    await c.env.DB.prepare(
      `UPDATE chat_members
          SET last_read_message_id = ?, last_read_at = ?
        WHERE conversation_id = ? AND user_id = ?`
    ).bind(messageId, nowIso(), conversation.id, actor.id).run();
  }
  const updated = await requireConversation(c.env, conversation.id, actor.id);
  return c.json({ item: await conversationJson(c.env, updated, actor.id) });
});

chatRoutes.delete('/conversations/:id/membership', async c => {
  const actor = await requireUser(c);
  const conversation = await requireConversation(c.env, c.req.param('id'), actor.id);
  if (conversation.type !== 'group') throw badRequest('私聊不能退出，请使用屏蔽');
  await c.env.DB.prepare(
    'UPDATE chat_members SET left_at = ? WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(nowIso(), conversation.id, actor.id).run();
  return c.json({ success: true });
});

chatRoutes.delete('/messages/:id', async c => {
  const actor = await requireUser(c);
  const message = await c.env.DB.prepare(
    'SELECT id, conversation_id, sender_id, status FROM chat_messages WHERE id = ? LIMIT 1'
  ).bind(c.req.param('id')).first<{ id: string; conversation_id: string; sender_id: string; status: string }>();
  if (!message) throw notFound('消息不存在');
  if (message.sender_id !== actor.id) throw forbidden('只能删除自己发送的消息');
  if (message.status !== 'published') return c.json({ item: { id: message.id, status: 'deleted' } });
  await requireConversation(c.env, message.conversation_id, actor.id);
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `UPDATE chat_messages
        SET status = 'deleted', deleted_at = ?, content_html = ?
      WHERE id = ? AND status = 'published'`
  ).bind(timestamp, '<p>该消息已删除</p>', message.id).run();
  return c.json({ item: { id: message.id, status: 'deleted', deleted_at: timestamp } });
});

chatRoutes.post('/users/:id/block', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'active') throw forbidden('当前账号状态不能屏蔽用户');
  const targetId = c.req.param('id');
  idSchema.parse(targetId);
  if (targetId === actor.id) throw badRequest('不能屏蔽自己');
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first<{ id: string }>();
  if (!target) throw notFound('用户不存在');
  await c.env.DB.prepare(
    `INSERT INTO chat_user_blocks (blocker_id, blocked_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(blocker_id, blocked_id) DO NOTHING`
  ).bind(actor.id, targetId, nowIso()).run();
  return c.json({ success: true, blocked: true }, 201);
});

chatRoutes.delete('/users/:id/block', async c => {
  const actor = await requireUser(c);
  const targetId = c.req.param('id');
  idSchema.parse(targetId);
  const result = await c.env.DB.prepare(
    'DELETE FROM chat_user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).bind(actor.id, targetId).run();
  if (!result.success) throw notFound('未屏蔽该用户');
  return c.json({ success: true, blocked: false });
});

