import { Hono } from 'hono';
import type { Env, SessionUser } from '../../env';
import { badRequest, notFound } from '../../core/errors';
import { contentSchema, reportTargetTypeSchema, titleSchema } from '../../core/validation';
import { createId, nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import { requireRole } from '../access/service';
import { renderMarkdown } from '../content/markdown';

export const moderationRoutes = new Hono<{ Bindings: Env }>();

moderationRoutes.post('/reports', async c => {
  const actor = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const targetType = reportTargetTypeSchema.parse(body?.target_type);
  const targetId = String(body?.target_id ?? '');
  const reason = String(body?.reason ?? '').trim();
  const details = String(body?.details ?? '').slice(0, 1000);
  if (!targetId || reason.length < 2 || reason.length > 100) throw badRequest('举报参数无效');
  const targetTable = targetType === 'thread' ? 'threads' : targetType === 'post' ? 'posts' : 'users';
  const target = await c.env.DB.prepare(`SELECT id FROM ${targetTable} WHERE id = ?`).bind(targetId).first();
  if (!target) throw badRequest('举报对象不存在');
  const id = createId();
  await c.env.DB.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).bind(id, actor.id, targetType, targetId, reason, details, nowIso(), nowIso()).run();
  const moderators = await c.env.DB.prepare(`SELECT id FROM users WHERE role IN ('moderator','admin','owner') AND status = 'active'`).all<{ id: string }>();
  const reportTimestamp = nowIso();
  for (const moderator of moderators.results ?? []) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), moderator.id, 'report', '收到新的举报', `${reason}：${details.slice(0, 120)}`, `/reports/${id}`, reportTimestamp).run();
  }
  return c.json({ item: { id, status: 'open' } }, 201);
});

moderationRoutes.get('/reports', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const status = c.req.query('status');
  if (status && !['open','in_review','resolved','rejected'].includes(status)) throw badRequest('状态无效');
  const rows = await c.env.DB.prepare(
    `SELECT r.*, reporter.username AS reporter_username, target_user.username AS target_user_username
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users target_user ON target_user.id = r.target_id
      WHERE (? IS NULL OR r.status = ?)
      ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 100`
  ).bind(status ?? null, status ?? null).all();
  return c.json({ items: rows.results ?? [] });
});

moderationRoutes.post('/reports/:id/resolve', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const resolution = String(body?.resolution ?? '').trim();
  if (resolution.length < 2 || resolution.length > 1000) throw badRequest('处理说明无效');
  const result = await c.env.DB.prepare(
    `UPDATE reports SET status = 'resolved', resolution = ?, assigned_to = ?, updated_at = ? WHERE id = ? AND status IN ('open','in_review')`
  ).bind(resolution, actor.id, nowIso(), id).run();
  if (!result.success) throw notFound('举报不存在或已处理');
  await insertAudit(c.env, actor.id, 'report.resolve', 'report', id, resolution, { resolution });
  return c.json({ success: true });
});

moderationRoutes.post('/reports/:id/reject', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2 || reason.length > 1000) throw badRequest('驳回说明无效');
  const result = await c.env.DB.prepare(
    `UPDATE reports SET status = 'rejected', resolution = ?, assigned_to = ?, updated_at = ? WHERE id = ? AND status IN ('open','in_review')`
  ).bind(reason, actor.id, nowIso(), id).run();
  if (!result.success) throw notFound('举报不存在或已处理');
  await insertAudit(c.env, actor.id, 'report.reject', 'report', id, reason, { rejected: true });
  return c.json({ success: true });
});

moderationRoutes.post('/reports/:id/assign', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const assignee = String(body?.assigned_to ?? '');
  const user = await c.env.DB.prepare(`SELECT id, role FROM users WHERE id = ?`).bind(assignee).first<{ id: string; role: SessionUser['role'] }>();
  if (!user || !['moderator','admin','owner'].includes(user.role)) throw badRequest('被分配用户不是监管者');
  const result = await c.env.DB.prepare(`UPDATE reports SET status = 'in_review', assigned_to = ?, updated_at = ? WHERE id = ?`).bind(assignee, nowIso(), id).run();
  if (!result.success) throw notFound('举报不存在');
  await insertAudit(c.env, actor.id, 'report.assign', 'report', id, '', { assigned_to: assignee });
  return c.json({ success: true });
});

moderationRoutes.patch('/threads/:id/status', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const status = String(body?.status ?? '');
  if (!['published','hidden','locked'].includes(status)) throw badRequest('话题状态无效');
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2) throw badRequest('操作原因不能为空');
  const result = await c.env.DB.prepare(`UPDATE threads SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'`).bind(status, nowIso(), id).run();
  if (!result.success) throw notFound('话题不存在');
  await insertAudit(c.env, actor.id, 'thread.status_change', 'thread', id, reason, { status });
  return c.json({ success: true });
});

moderationRoutes.patch('/posts/:id/status', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const status = String(body?.status ?? '');
  if (!['published','hidden'].includes(status)) throw badRequest('帖子状态无效');
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2) throw badRequest('操作原因不能为空');
  const result = await c.env.DB.prepare(`UPDATE posts SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'`).bind(status, nowIso(), id).run();
  if (!result.success) throw notFound('帖子不存在');
  await insertAudit(c.env, actor.id, 'post.status_change', 'post', id, reason, { status });
  return c.json({ success: true });
});

moderationRoutes.get('/audit-logs', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const rows = await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ items: rows.results ?? [] });
});

moderationRoutes.post('/announcements', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const body = await c.req.json().catch(() => null);
  const title = titleSchema.parse(body?.title);
  const content = contentSchema.parse(body?.content);
  const level = ['normal','important','urgent'].includes(String(body?.level)) ? String(body?.level) : 'normal';
  const startsAt = new Date(body?.starts_at ?? Date.now());
  if (Number.isNaN(startsAt.getTime())) throw badRequest('开始时间无效');
  const endsAt = body?.ends_at ? new Date(body.ends_at) : null;
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) throw badRequest('结束时间无效');
  const id = createId();
  await c.env.DB.prepare(
    `INSERT INTO announcements (id, author_id, title, content_markdown, content_html, level, starts_at, ends_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, actor.id, title, content, renderMarkdown(content), level, startsAt.toISOString(), endsAt?.toISOString() ?? null, nowIso(), nowIso()).run();
  const recipients = await c.env.DB.prepare(`SELECT id FROM users WHERE status = 'active'`).all<{ id: string }>();
  const notificationTimestamp = nowIso();
  for (const recipient of recipients.results ?? []) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), recipient.id, 'announcement', title, content.slice(0, 160), `/announcements/${id}`, notificationTimestamp).run();
  }
  await insertAudit(c.env, actor.id, 'announcement.create', 'announcement', id, '', { level });
  return c.json({ item: { id } }, 201);
});

moderationRoutes.get('/announcements', async c => {
  const now = nowIso();
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.username AS author_username, u.real_name AS author_real_name, u.enrollment_year AS author_enrollment_year
       FROM announcements a JOIN users u ON u.id = a.author_id
      WHERE a.starts_at <= ? AND (a.ends_at IS NULL OR a.ends_at > ?)
      ORDER BY CASE a.level WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, a.starts_at DESC LIMIT 100`
  ).bind(now, now).all();
  return c.json({ items: rows.results ?? [] });
});

export async function insertAudit(
  env: Env,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actorId, action, targetType, targetId, reason, JSON.stringify(metadata), nowIso()).run();
}
