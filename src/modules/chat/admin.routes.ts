import { Hono } from 'hono';
import type { Env, SessionUser } from '../../env';
import { badRequest, notFound } from '../../core/errors';
import { idSchema } from '../../core/validation';
import { createId, nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import { requireRole } from '../access/service';
import { insertAudit } from '../moderation/audit';
import { listMembers } from './service';
import type { ConversationRow } from './service';

interface GroupListRow extends ConversationRow {
  member_count: number;
  active_member_count: number;
}


export const chatAdminRoutes = new Hono<{ Bindings: Env }>();

chatAdminRoutes.post('/admin/chat/groups', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? '').trim();
  const description = String(body?.description ?? '').trim().slice(0, 1000);
  const ownerUserId = body?.owner_user_id ? idSchema.parse(body.owner_user_id) : null;
  if (name.length < 2 || name.length > 80) throw badRequest('群名称长度必须在 2-80 之间');
  if (ownerUserId) {
    const owner = await c.env.DB.prepare(
      'SELECT id, status FROM users WHERE id = ?'
    ).bind(ownerUserId).first<{ id: string; status: SessionUser['status'] }>();
    if (!owner || owner.status !== 'active') throw badRequest('群负责人必须是 active 用户');
  }
  const timestamp = nowIso();
  const id = createId();
  await c.env.DB.prepare(
    `INSERT INTO chat_conversations
       (id, type, direct_key, name, description, owner_user_id, last_message_id, last_message_at,
        status, created_by, created_at, updated_at, deleted_at)
     VALUES (?, 'group', NULL, ?, ?, ?, NULL, NULL, 'active', ?, ?, ?, NULL)`
  ).bind(id, name, description, ownerUserId, actor.id, timestamp, timestamp).run();
  if (ownerUserId) {
    await c.env.DB.prepare(
      `INSERT INTO chat_members (conversation_id, user_id, role, joined_at, left_at, last_read_message_id, last_read_at)
       VALUES (?, ?, 'member', ?, NULL, NULL, NULL)
       ON CONFLICT(conversation_id, user_id) DO UPDATE
         SET left_at = NULL, joined_at = excluded.joined_at`
    ).bind(id, ownerUserId, timestamp).run();
  }
  await insertAudit(c.env, actor.id, 'chat.group_create', 'conversation', id, '管理员创建群聊', { name, owner_user_id: ownerUserId });
  const group = await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE id = ?').bind(id).first<ConversationRow>();
  return c.json({ item: group }, 201);
});

chatAdminRoutes.get('/admin/chat/groups', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const rows = await c.env.DB.prepare(
    `SELECT cc.*, COUNT(cm.user_id) AS member_count,
            SUM(CASE WHEN cm.left_at IS NULL THEN 1 ELSE 0 END) AS active_member_count
       FROM chat_conversations cc
       LEFT JOIN chat_members cm ON cm.conversation_id = cc.id
      WHERE cc.type = 'group' AND cc.status = 'active'
      GROUP BY cc.id
      ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC, cc.id DESC`
  ).all<GroupListRow>();
  const groups = [];
  for (const row of rows.results ?? []) {
    const owner = row.owner_user_id
      ? await c.env.DB.prepare('SELECT id, username, real_name, enrollment_year, role, status FROM users WHERE id = ?').bind(row.owner_user_id).first()
      : null;
    groups.push({ ...row, member_count: Number(row.member_count), active_member_count: Number(row.active_member_count), owner });
  }
  return c.json({ items: groups });
});

chatAdminRoutes.get('/admin/chat/groups/:id', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const group = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE id = ? AND type = 'group'"
  ).bind(id).first<ConversationRow>();
  if (!group) throw notFound('群聊不存在');
  const members = await listMembers(c.env, id, true);
  const owner = group.owner_user_id
    ? await c.env.DB.prepare('SELECT id, username, real_name, enrollment_year, role, status FROM users WHERE id = ?').bind(group.owner_user_id).first()
    : null;
  return c.json({ item: { ...group, owner }, members });
});

chatAdminRoutes.patch('/admin/chat/groups/:id', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const group = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE id = ? AND type = 'group' AND status = 'active'"
  ).bind(id).first<ConversationRow>();
  if (!group) throw notFound('群聊不存在');
  const name = body?.name === undefined ? group.name : String(body.name).trim();
  const description = body?.description === undefined ? group.description : String(body.description).trim().slice(0, 1000);
  const ownerUserId = body?.owner_user_id === undefined ? group.owner_user_id
    : body.owner_user_id === null ? null : idSchema.parse(body.owner_user_id);
  if (name === null || name.length < 2 || name.length > 80) throw badRequest('群名称长度必须在 2-80 之间');
  if (ownerUserId) {
    const owner = await c.env.DB.prepare('SELECT id, status FROM users WHERE id = ?').bind(ownerUserId).first<{ id: string; status: SessionUser['status'] }>();
    if (!owner || owner.status !== 'active') throw badRequest('群负责人必须是 active 用户');
  }
  await c.env.DB.prepare(
    `UPDATE chat_conversations
        SET name = ?, description = ?, owner_user_id = ?, updated_at = ?
      WHERE id = ?`
  ).bind(name, description, ownerUserId, nowIso(), id).run();
  await insertAudit(c.env, actor.id, 'chat.group_update', 'conversation', id, '管理员更新群聊', { name, description, owner_user_id: ownerUserId });
  const updated = await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE id = ?').bind(id).first<ConversationRow>();
  return c.json({ item: updated });
});

chatAdminRoutes.delete('/admin/chat/groups/:id', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const id = c.req.param('id');
  const timestamp = nowIso();
  const result = await c.env.DB.prepare(
    "UPDATE chat_conversations SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'group' AND status = 'active'"
  ).bind(timestamp, timestamp, id).run();
  if (!result.success) throw notFound('群聊不存在');
  await insertAudit(c.env, actor.id, 'chat.group_delete', 'conversation', id, '管理员删除群聊', {});
  return c.json({ success: true });
});

chatAdminRoutes.post('/admin/chat/groups/:id/members', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const id = c.req.param('id');
  const group = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE id = ? AND type = 'group' AND status = 'active'"
  ).bind(id).first<ConversationRow>();
  if (!group) throw notFound('群聊不存在');
  const body = await c.req.json().catch(() => null);
  const userId = idSchema.parse(body?.user_id);
  const user = await c.env.DB.prepare('SELECT id, status FROM users WHERE id = ?').bind(userId).first<{ id: string; status: SessionUser['status'] }>();
  if (!user || user.status !== 'active') throw badRequest('只能加入 active 用户');
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO chat_members (conversation_id, user_id, role, joined_at, left_at, last_read_message_id, last_read_at)
     VALUES (?, ?, 'member', ?, NULL, NULL, NULL)
     ON CONFLICT(conversation_id, user_id) DO UPDATE
       SET left_at = NULL, joined_at = excluded.joined_at`
  ).bind(id, userId, timestamp).run();
  await insertAudit(c.env, actor.id, 'chat.member_add', 'conversation', id, '管理员添加群成员', { user_id: userId });
  return c.json({ success: true });
});

chatAdminRoutes.delete('/admin/chat/groups/:id/members/:user_id', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const id = c.req.param('id');
  const userId = c.req.param('user_id');
  idSchema.parse(userId);
  const group = await c.env.DB.prepare(
    "SELECT id FROM chat_conversations WHERE id = ? AND type = 'group' AND status = 'active'"
  ).bind(id).first<{ id: string }>();
  if (!group) throw notFound('群聊不存在');
  const timestamp = nowIso();
  const result = await c.env.DB.prepare(
    'UPDATE chat_members SET left_at = ? WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(timestamp, id, userId).run();
  if (!result.success) throw notFound('群成员不存在');
  await insertAudit(c.env, actor.id, 'chat.member_remove', 'conversation', id, '管理员移除群成员', { user_id: userId });
  return c.json({ success: true });
});

chatAdminRoutes.get('/admin/chat/groups/:id/messages', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const group = await c.env.DB.prepare(
    "SELECT * FROM chat_conversations WHERE id = ? AND type = 'group' AND status = 'active'"
  ).bind(id).first<ConversationRow>();
  if (!group) throw notFound('群聊不存在');
  const before = c.req.query('before') ?? null;
  const limit = Number(c.req.query('limit') ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest('分页大小无效');
  const rows = await c.env.DB.prepare(
    `SELECT m.*, u.id AS sender_user_id, u.username AS sender_username,
            u.real_name AS sender_real_name, u.enrollment_year AS sender_enrollment_year,
            u.role AS sender_role, u.status AS sender_status
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
        AND (? IS NULL OR (m.created_at, m.id) <
          (SELECT created_at, id FROM chat_messages WHERE id = ?))
      ORDER BY m.created_at DESC, m.id DESC LIMIT ?`
  ).bind(id, before, before, limit + 1)
    .all<Record<string, unknown>>();
  const items = (rows.results ?? []).slice(0, limit).map(row => ({ ...row }));
  await insertAudit(c.env, actor.id, 'chat.admin_access', 'conversation', id, '监管者查看群聊消息', {
    before: before,
    returned: items.length,
    has_more: (rows.results ?? []).length > limit
  });
  return c.json({
    items,
    next_cursor: (rows.results ?? []).length > limit ? items.length > 0 ? String(items[items.length - 1]?.id) : null : null
  });
});

chatAdminRoutes.get('/admin/chat/users', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const q = (c.req.query('q') ?? '').trim().replace(/[%_\\]/g, ' ');
  const rows = await c.env.DB.prepare(
    `SELECT id, username, real_name, enrollment_year, role, status, created_at, updated_at
       FROM users
      WHERE status = 'active' AND (? = '' OR username LIKE '%' || ? || '%' OR real_name LIKE '%' || ? || '%')
      ORDER BY username COLLATE NOCASE LIMIT 100`
  ).bind(q, q, q).all();
  return c.json({ items: rows.results ?? [] });
});


