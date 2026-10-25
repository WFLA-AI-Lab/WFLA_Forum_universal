import { Hono } from 'hono';
import type { Env } from '../../env';
import { badRequest, notFound } from '../../core/errors';
import { createId, nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import { requireRole } from '../access/service';
import { insertAudit } from '../moderation/audit';

interface SanctionRow {
  id: string;
  user_id: string;
  action: 'mute' | 'ban' | 'restore';
  reason: string;
  expires_at: string | null;
  created_at: string;
}

export const appealRoutes = new Hono<{ Bindings: Env }>();

appealRoutes.post('/appeals', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'banned' && actor.status !== 'muted') throw badRequest('当前状态无需申诉');
  const body = await c.req.json().catch(() => null);
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 10 || reason.length > 1000) throw badRequest('申诉说明需为 10-1000 字');
  const existing = await c.env.DB.prepare(`SELECT id FROM appeals WHERE user_id = ? AND status = 'open'`)
    .bind(actor.id).first<{ id: string }>();
  if (existing) throw badRequest('你已有申诉正在处理');
  const sanction = await c.env.DB.prepare(
    `SELECT id FROM sanctions WHERE user_id = ? AND action IN ('mute','ban') ORDER BY created_at DESC LIMIT 1`
  ).bind(actor.id).first<{ id: string }>();
  const id = createId();
  await c.env.DB.prepare(
    `INSERT INTO appeals (id, user_id, sanction_id, reason, status, submitted_at)
     VALUES (?, ?, ?, ?, 'open', ?)`
  ).bind(id, actor.id, sanction?.id ?? null, reason, nowIso()).run();
  await insertAudit(c.env, actor.id, 'appeal.create', 'appeal', id, reason.slice(0, 200), {
    user_id: actor.id, sanction_id: sanction?.id ?? null
  });
  return c.json({ item: { id, status: 'open' } }, 201);
});

appealRoutes.get('/appeals', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.username, u.real_name, u.enrollment_year, s.action AS sanction_action,
            s.reason AS sanction_reason, s.expires_at
       FROM appeals a JOIN users u ON u.id = a.user_id
       LEFT JOIN sanctions s ON s.id = a.sanction_id
      WHERE a.status = 'open' ORDER BY a.submitted_at DESC LIMIT 100`
  ).all();
  return c.json({ items: rows.results ?? [] });
});

appealRoutes.post('/appeals/:id/approve', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const reason = String(body?.resolution ?? '').trim();
  if (reason.length < 2) throw badRequest('复核说明不能为空');
  const appeal = await c.env.DB.prepare(`SELECT id, user_id, sanction_id FROM appeals WHERE id = ? AND status = 'open'`)
    .bind(id).first<{ id: string; user_id: string; sanction_id: string | null }>();
  if (!appeal) throw notFound('申诉不存在或已处理');
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE appeals SET status = 'approved', resolution = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
      .bind(reason, actor.id, timestamp, id),
    c.env.DB.prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`)
      .bind(timestamp, appeal.user_id),
    c.env.DB.prepare(`UPDATE sanctions SET resolved_at = ? WHERE id = ?`)
      .bind(timestamp, appeal.sanction_id)
  ]);
  await c.env.DB.prepare(`INSERT INTO sanctions (id, user_id, actor_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, 'restore', ?, NULL, ?)`)
    .bind(createId(), appeal.user_id, actor.id, reason, timestamp).run();
  await insertAudit(c.env, actor.id, 'appeal.approve', 'appeal', id, reason, { user_id: appeal.user_id });
  await c.env.DB.prepare(
    'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).bind(createId(), appeal.user_id, 'appeal_result', '申诉已通过，账号已恢复', reason.slice(0, 180), '/notifications', nowIso()).run();
  return c.json({ success: true });
});

appealRoutes.post('/appeals/:id/reject', async c => {
  const actor = await requireUser(c);
  requireRole(actor, 'moderator');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const reason = String(body?.resolution ?? '').trim();
  if (reason.length < 2) throw badRequest('复核说明不能为空');
  const appeal = await c.env.DB.prepare(`SELECT id, user_id FROM appeals WHERE id = ? AND status = 'open'`)
    .bind(id).first<{ id: string; user_id: string }>();
  if (!appeal) throw notFound('申诉不存在或已处理');
  await c.env.DB.prepare(`UPDATE appeals SET status = 'rejected', resolution = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
    .bind(reason, actor.id, nowIso(), id).run();
  await insertAudit(c.env, actor.id, 'appeal.reject', 'appeal', id, reason, { user_id: appeal.user_id });
  await c.env.DB.prepare(
    'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).bind(createId(), appeal.user_id, 'appeal_result', '申诉未通过', reason.slice(0, 180), '/notifications', nowIso()).run();
  return c.json({ success: true });
});

/** Called by the self-host server on a timer; Cloudflare deployments should use cron. */
export async function expireSanctions(env: Env): Promise<number> {
  const now = nowIso();
  const rows = await env.DB.prepare(
    `SELECT id, user_id, action FROM sanctions
      WHERE resolved_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?`
  ).bind(now).all<SanctionRow>();
  let restored = 0;
  for (const row of rows.results ?? []) {
      await env.DB.batch([
      env.DB.prepare(`UPDATE sanctions SET resolved_at = ? WHERE id = ?`).bind(now, row.id),
      env.DB.prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ? AND status = ?`).bind(now, row.user_id, row.action)
    ]);
    await insertAudit(env, null, 'user.status_change', 'user', row.user_id, '临时处罚到期，自动恢复账号', {
      status: 'active', previous_status: row.action, sanction_id: row.id, automated: true
    });
    restored += 1;
  }
  return restored;
}
