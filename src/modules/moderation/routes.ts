import { Hono } from 'hono';
import type { Env, SessionUser, ReportStatus } from '../../env';
import { badRequest, notFound } from '../../core/errors';
import { contentSchema, reportTargetTypeSchema, titleSchema } from '../../core/validation';
import { createId, nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import { requireRole } from '../access/service';
import { enforceRateLimit } from '../identity/crypto';
import { renderMarkdown } from '../content/markdown';
import { insertAudit } from './audit';
import { applyReportThreshold, type ModerationRule, type ModerationRuleKind } from './automation';

const REPORT_STATUSES: ReportStatus[] = ['open', 'in_review', 'resolved', 'rejected'];

function statusFilter(value: string | undefined): ReportStatus | null {
  if (!value) return null;
  const status = value as ReportStatus;
  if (!REPORT_STATUSES.includes(status)) throw badRequest('状态无效');
  return status;
}


export const moderationRoutes = new Hono<{ Bindings: Env }>();

moderationRoutes.post('/reports', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'active') throw badRequest('当前账号状态不能举报');
  const forwarded = c.req.header('x-forwarded-for');
  const ip = c.env.TRUST_PROXY_HEADERS && forwarded
    ? forwarded.split(',')[0]?.trim() ?? 'unknown'
    : (c.req.header('cf-connecting-ip') ?? 'unknown');
  await enforceRateLimit(`report:${actor.id}:${ip}`);

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
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).bind(id, actor.id, targetType, targetId, reason, details, timestamp, timestamp).run();
  const moderators = await c.env.DB.prepare(`SELECT id FROM users WHERE role IN ('moderator','admin','owner') AND status = 'active'`).all<{ id: string }>();
  for (const moderator of moderators.results ?? []) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), moderator.id, 'report', '收到新的举报', `${reason}：${details.slice(0, 120)}`, `/moderation/reports/${id}`, timestamp).run();
  }
  if (targetType !== 'user') {
    const post = targetType === 'post'
      ? await c.env.DB.prepare('SELECT thread_id FROM posts WHERE id = ?').bind(targetId).first<{ thread_id: string }>()
      : null;
    await applyReportThreshold(c.env, {
      targetType,
      targetId,
      threadId: post?.thread_id ?? targetId
    });
  }
  return c.json({ item: { id, status: 'open' } }, 201);
});

moderationRoutes.get('/reports', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const status = statusFilter(c.req.query('status'));
  const rows = await c.env.DB.prepare(
    `SELECT r.*, reporter.username AS reporter_username, reporter.real_name AS reporter_real_name,
            reporter.enrollment_year AS reporter_enrollment_year,
            target_user.username AS target_user_username, target_user.real_name AS target_user_real_name,
            target_user.enrollment_year AS target_user_enrollment_year
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users target_user ON target_user.id = r.target_id
      WHERE (? IS NULL OR r.status = ?)
      ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 100`
  ).bind(status, status).all();
  return c.json({ items: rows.results ?? [] });
});

moderationRoutes.get('/reports/:id', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const report = await c.env.DB.prepare(
    `SELECT r.*, reporter.username AS reporter_username, reporter.real_name AS reporter_real_name,
            reporter.enrollment_year AS reporter_enrollment_year,
            target_user.username AS target_user_username, target_user.real_name AS target_user_real_name,
            target_user.enrollment_year AS target_user_enrollment_year
       FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users target_user ON target_user.id = r.target_id
      WHERE r.id = ?`
  ).bind(id).first();
  if (!report) throw notFound('举报不存在');
  let targetThread = null;
  let targetPost = null;
  let targetUser = null;
  if (report.target_type === 'thread') {
    targetThread = await c.env.DB.prepare(
      `SELECT t.id, t.title, t.status, u.id AS author_id, u.username AS author_username,
              u.real_name AS author_real_name, u.enrollment_year AS author_enrollment_year
         FROM threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?`
    ).bind(report.target_id).first();
  } else if (report.target_type === 'post') {
    targetPost = await c.env.DB.prepare(
      `SELECT p.id, p.thread_id, p.floor_number, p.status, p.content_markdown,
              u.id AS author_id, u.username AS author_username, u.real_name AS author_real_name,
              u.enrollment_year AS author_enrollment_year, t.title AS thread_title
         FROM posts p JOIN users u ON u.id = p.author_id JOIN threads t ON t.id = p.thread_id
        WHERE p.id = ?`
    ).bind(report.target_id).first();
  } else {
    targetUser = await c.env.DB.prepare(
      `SELECT id, username, real_name, enrollment_year, role, status FROM users WHERE id = ?`
    ).bind(report.target_id).first();
  }
  return c.json({ item: { ...report, target_thread: targetThread, target_post: targetPost, target_user: targetUser } });
});

moderationRoutes.post('/reports/:id/resolve', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const resolution = String(body?.resolution ?? '').trim();
  if (resolution.length < 2 || resolution.length > 1000) throw badRequest('处理说明无效');
  const result = await c.env.DB.prepare(
    `UPDATE reports SET status = 'resolved', resolution = ?, assigned_to = ?, updated_at = ? WHERE id = ? AND status IN ('open','in_review')`
  ).bind(resolution, actor.id, nowIso(), id).run();
  if (!result.success) throw notFound('举报不存在或已处理');
  await insertAudit(c.env, actor.id, 'report.resolve', 'report', id, resolution, { resolution });
  const report = await c.env.DB.prepare('SELECT reporter_id FROM reports WHERE id = ?').bind(id).first<{ reporter_id: string }>();
  if (report) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), report.reporter_id, 'report_result', '你的举报已处理', resolution.slice(0, 180), '/notifications', nowIso()).run();
  }
  return c.json({ success: true });
});

moderationRoutes.post('/reports/:id/reject', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2 || reason.length > 1000) throw badRequest('驳回说明无效');
  const result = await c.env.DB.prepare(
    `UPDATE reports SET status = 'rejected', resolution = ?, assigned_to = ?, updated_at = ? WHERE id = ? AND status IN ('open','in_review')`
  ).bind(reason, actor.id, nowIso(), id).run();
  if (!result.success) throw notFound('举报不存在或已处理');
  await insertAudit(c.env, actor.id, 'report.reject', 'report', id, reason, { rejected: true });
  const report = await c.env.DB.prepare('SELECT reporter_id FROM reports WHERE id = ?').bind(id).first<{ reporter_id: string }>();
  if (report) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), report.reporter_id, 'report_result', '你的举报未成立', reason.slice(0, 180), '/notifications', nowIso()).run();
  }
  return c.json({ success: true });
});

moderationRoutes.post('/reports/:id/assign', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const assignee = String(body?.assigned_to ?? '');
  const user = await c.env.DB.prepare(`SELECT id, role, status FROM users WHERE id = ?`).bind(assignee).first<{ id: string; role: SessionUser['role']; status: SessionUser['status'] }>();
  if (!user || !['moderator','admin','owner'].includes(user.role) || user.status !== 'active') throw badRequest('被分配用户不是在岗监管者');
  const result = await c.env.DB.prepare(`UPDATE reports SET status = 'in_review', assigned_to = ?, updated_at = ? WHERE id = ?`).bind(assignee, nowIso(), id).run();
  if (!result.success) throw notFound('举报不存在');
  await insertAudit(c.env, actor.id, 'report.assign', 'report', id, '分配举报给在岗监管者', { assigned_to: assignee });
  return c.json({ success: true });
});

moderationRoutes.patch('/threads/:id/status', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const status = String(body?.status ?? '');
  if (!['published','hidden','locked'].includes(status)) throw badRequest('话题状态无效');
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2) throw badRequest('操作原因不能为空');
  const previous = await c.env.DB.prepare('SELECT status FROM threads WHERE id = ? AND status != ?').bind(id, 'deleted').first<{ status: string }>();
  if (!previous) throw notFound('话题不存在');
  const result = await c.env.DB.prepare(`UPDATE threads SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'`).bind(status, nowIso(), id).run();
  if (!result.success) throw notFound('话题不存在');
  await insertAudit(c.env, actor.id, 'thread.status_change', 'thread', id, reason, { status, previous_status: previous.status });
  return c.json({ success: true });
});

moderationRoutes.patch('/posts/:id/status', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const status = String(body?.status ?? '');
  if (!['published','hidden'].includes(status)) throw badRequest('帖子状态无效');
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2) throw badRequest('操作原因不能为空');
  const previous = await c.env.DB.prepare('SELECT status FROM posts WHERE id = ? AND status != ?').bind(id, 'deleted').first<{ status: string }>();
  if (!previous) throw notFound('帖子不存在');
  const result = await c.env.DB.prepare(`UPDATE posts SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'`).bind(status, nowIso(), id).run();
  if (!result.success) throw notFound('帖子不存在');
  await insertAudit(c.env, actor.id, 'post.status_change', 'post', id, reason, { status, previous_status: previous.status });
  return c.json({ success: true });
});

moderationRoutes.get('/moderation/rules', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const rows = await c.env.DB.prepare(
    'SELECT id, kind, name, description, enabled, threshold, config, updated_at FROM moderation_rules ORDER BY kind'
  ).all();
  return c.json({ items: rows.results ?? [] });
});

moderationRoutes.patch('/moderation/rules/:id', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const enabled = body?.enabled === undefined ? undefined : body.enabled === true;
  const threshold = body?.threshold === undefined ? undefined : Number(body.threshold);
  if (enabled === undefined && threshold === undefined) throw badRequest('没有可更新字段');
  if (threshold !== undefined && (!Number.isInteger(threshold) || threshold < 1 || threshold > 100)) throw badRequest('阈值必须在 1-100 之间');
  const existing = await c.env.DB.prepare('SELECT id, kind, name, threshold, enabled FROM moderation_rules WHERE id = ?').bind(id).first<{ id: string; kind: string; name: string; threshold: number; enabled: number }>();
  if (!existing) throw notFound('规则不存在');
  await c.env.DB.prepare('UPDATE moderation_rules SET enabled = ?, threshold = ?, updated_by = ?, updated_at = ? WHERE id = ?')
    .bind(enabled === undefined ? existing.enabled : enabled ? 1 : 0, threshold ?? existing.threshold, actor.id, nowIso(), id).run();
  await insertAudit(c.env, actor.id, 'moderation.rule_update', 'moderation_rule', id, '管理员更新自动监管规则', {
    previous_enabled: existing.enabled === 1, previous_threshold: existing.threshold, enabled, threshold
  });
  return c.json({ success: true });
});

moderationRoutes.get('/moderation/risks', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const rows = await c.env.DB.prepare(
    `SELECT e.*, r.name AS rule_name, u.username AS actor_username, u.real_name AS actor_real_name
       FROM risk_events e LEFT JOIN moderation_rules r ON r.id = e.rule_id
       LEFT JOIN users u ON u.id = e.actor_id
      ORDER BY CASE e.status WHEN 'open' THEN 0 ELSE 1 END, e.created_at DESC LIMIT 200`
  ).all();
  return c.json({ items: rows.results ?? [] });
});

moderationRoutes.post('/moderation/risks/:id/dismiss', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 2) throw badRequest('操作原因不能为空');
  const result = await c.env.DB.prepare(`UPDATE risk_events SET status = 'dismissed' WHERE id = ? AND status = 'open'`).bind(id).run();
  if (!result.success) throw notFound('风险事件不存在或已处理');
  await insertAudit(c.env, actor.id, 'risk.dismiss', 'risk_event', id, reason, {});
  return c.json({ success: true });
});

moderationRoutes.get('/audit-logs', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
  const rows = await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ items: rows.results ?? [] });
});

moderationRoutes.post('/announcements', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'admin');
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
  await insertAudit(c.env, actor.id, 'announcement.create', 'announcement', id, '管理员发布全站公告', { level });
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

export type { ModerationRule, ModerationRuleKind };
