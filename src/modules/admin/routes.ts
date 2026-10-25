import { Hono } from 'hono';
import type { Env, SessionUser } from '../../env';
import { badRequest, forbidden, notFound } from '../../core/errors';
import { createId, nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import { ROLE_RANK, requireRole } from '../access/service';
import { insertAudit } from '../moderation/routes';

const RANK = ROLE_RANK;
const AUDIT_ACTIONS = new Set([
  'user.create', 'user.activate', 'user.role_change', 'user.status_change',
  'user.password_reset', 'user.sessions_revoke', 'user.note_create',
  'invitation.create', 'invitation.register', 'invitation.revoke', 'report.resolve', 'report.reject',
  'report.assign', 'thread.status_change', 'post.status_change',
  'announcement.create', 'announcement.delete', 'board.create', 'board.update',
  'settings.update', 'site.config_update'
]);

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isAssignable(actorRole: SessionUser['role'], targetRole: SessionUser['role']): boolean {
  return RANK[targetRole] < RANK[actorRole];
}

async function requireAdmin(c: Parameters<typeof requireUser>[0]): Promise<SessionUser> {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  return actor;
}

function lastDays(count: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(cursor);
    date.setUTCDate(date.getUTCDate() - offset);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.get('/admin/overview', async c => {
  await requireAdmin(c);
  const [
    userRows, threadRows, postRows, reportRows, invitationRows,
    byDayUsers, byDayThreads, byDayPosts, recentActivity, hotThreads
  ] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'muted' THEN 1 ELSE 0 END) AS muted,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned,
        SUM(CASE WHEN role = 'member' THEN 1 ELSE 0 END) AS members,
        SUM(CASE WHEN role = 'moderator' THEN 1 ELSE 0 END) AS moderators,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins,
        SUM(CASE WHEN role = 'owner' THEN 1 ELSE 0 END) AS owners
      FROM users
    `).first<Record<string, number | null>>(),
    c.env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
        SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) AS locked,
        COALESCE(SUM(view_count), 0) AS views,
        COALESCE(SUM(reply_count), 0) AS replies
      FROM threads
    `).first<Record<string, number | null>>(),
    c.env.DB.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden
      FROM posts
    `).first<Record<string, number | null>>(),
    c.env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) AS in_review,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM reports
    `).first<Record<string, number | null>>(),
    c.env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN used_by IS NULL AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS unused,
        SUM(CASE WHEN used_by IS NULL AND expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN used_by IS NOT NULL THEN 1 ELSE 0 END) AS used
      FROM invitations
    `).bind(nowIso(), nowIso()).first<Record<string, number | null>>(),
    c.env.DB.prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM users WHERE created_at >= ? GROUP BY day").bind(`${lastDays(14)[0]}T00:00:00.000Z`).all<{ day: string; count: number }>(),
    c.env.DB.prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM threads WHERE created_at >= ? GROUP BY day").bind(`${lastDays(14)[0]}T00:00:00.000Z`).all<{ day: string; count: number }>(),
    c.env.DB.prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM posts WHERE created_at >= ? GROUP BY day").bind(`${lastDays(14)[0]}T00:00:00.000Z`).all<{ day: string; count: number }>(),
    c.env.DB.prepare(`
      SELECT a.id, a.action, a.target_type, a.target_id, a.reason, a.created_at,
             u.username AS actor_username, u.real_name AS actor_real_name
        FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT 12
    `).all(),
    c.env.DB.prepare(`
      SELECT t.id, t.title, t.reply_count, t.view_count, t.last_activity_at,
             u.real_name AS author_real_name
        FROM threads t JOIN users u ON u.id = t.author_id
       WHERE t.status = 'published'
       ORDER BY t.reply_count DESC, t.last_activity_at DESC LIMIT 6
    `).all()
  ]);

  const toNumber = (value: number | null | undefined): number => Number(value ?? 0);
  const days = lastDays(14);
  const userMap = new Map((byDayUsers.results ?? []).map(row => [row.day, Number(row.count)]));
  const threadMap = new Map((byDayThreads.results ?? []).map(row => [row.day, Number(row.count)]));
  const postMap = new Map((byDayPosts.results ?? []).map(row => [row.day, Number(row.count)]));

  return c.json({
    generated_at: nowIso(),
    users: {
      total: toNumber(userRows?.total), active: toNumber(userRows?.active), pending: toNumber(userRows?.pending),
      muted: toNumber(userRows?.muted), banned: toNumber(userRows?.banned),
      roles: {
        member: toNumber(userRows?.members), moderator: toNumber(userRows?.moderators),
        admin: toNumber(userRows?.admins), owner: toNumber(userRows?.owners)
      }
    },
    content: {
      threads: toNumber(threadRows?.total), published_threads: toNumber(threadRows?.published),
      hidden_threads: toNumber(threadRows?.hidden), locked_threads: toNumber(threadRows?.locked),
      posts: toNumber(postRows?.total), published_posts: toNumber(postRows?.published), hidden_posts: toNumber(postRows?.hidden),
      views: toNumber(threadRows?.views), replies: toNumber(threadRows?.replies)
    },
    moderation: {
      reports: toNumber(reportRows?.total), open: toNumber(reportRows?.open),
      in_review: toNumber(reportRows?.in_review), resolved: toNumber(reportRows?.resolved), rejected: toNumber(reportRows?.rejected)
    },
    invitations: {
      total: toNumber(invitationRows?.total), unused: toNumber(invitationRows?.unused),
      expired: toNumber(invitationRows?.expired), used: toNumber(invitationRows?.used)
    },
    trend: days.map(day => ({
      day,
      users: userMap.get(day) ?? 0,
      threads: threadMap.get(day) ?? 0,
      posts: postMap.get(day) ?? 0
    })),
    alerts: [
      ...(toNumber(userRows?.pending) > 0 ? [{ level: 'info', message: `${toNumber(userRows?.pending)} 个账号等待激活` }] : []),
      ...(toNumber(reportRows?.open) + toNumber(reportRows?.in_review) > 0 ? [{ level: 'warning', message: `${toNumber(reportRows?.open) + toNumber(reportRows?.in_review)} 条举报待处理` }] : []),
      ...(toNumber(invitationRows?.unused) === 0 ? [{ level: 'info', message: '当前没有可用邀请码' }] : [])
    ],
    recent_activity: recentActivity.results ?? [],
    hot_threads: hotThreads.results ?? []
  });
});

adminRoutes.get('/admin/users', async c => {
  await requireAdmin(c);
  const query = (c.req.query('query') ?? '').trim().slice(0, 80);
  const role = c.req.query('role') ?? '';
  const status = c.req.query('status') ?? '';
  const allowedRoles = ['owner', 'admin', 'moderator', 'member'];
  const allowedStatuses = ['pending', 'active', 'muted', 'banned', 'deleted'];
  if (role && !allowedRoles.includes(role)) throw badRequest('角色筛选无效');
  if (status && !allowedStatuses.includes(status)) throw badRequest('状态筛选无效');
  const limit = boundedInteger(c.req.query('limit'), 100, 1, 300);
  const offset = boundedInteger(c.req.query('offset'), 0, 0, 100000);
  const pattern = `%${query}%`;
  const rows = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.real_name, u.enrollment_year, u.role, u.status, u.created_at, u.updated_at,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS session_count,
      (SELECT COUNT(*) FROM threads t WHERE t.author_id = u.id AND t.status != 'deleted') AS thread_count,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.status != 'deleted') AS post_count,
      (SELECT GROUP_CONCAT(DISTINCT o.provider) FROM oauth_accounts o WHERE o.user_id = u.id) AS oauth_providers
    FROM users u
    WHERE (? = '' OR u.username LIKE ? OR u.real_name LIKE ?)
      AND (? = '' OR u.role = ?) AND (? = '' OR u.status = ?)
    ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
             CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
             u.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(nowIso(), query, pattern, pattern, role, role, status, status, limit, offset).all();
  const total = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total FROM users u
    WHERE (? = '' OR u.username LIKE ? OR u.real_name LIKE ?)
      AND (? = '' OR u.role = ?) AND (? = '' OR u.status = ?)
  `).bind(query, pattern, pattern, role, role, status, status).first<{ total: number }>();
  return c.json({ items: rows.results ?? [], total: Number(total?.total ?? 0), limit, offset });
});

adminRoutes.get('/admin/users/:id', async c => {
  await requireAdmin(c);
  const id = c.req.param('id');
  const [user, oauth, notes, sanctions, counts] = await Promise.all([
    c.env.DB.prepare('SELECT id, username, real_name, enrollment_year, role, status, created_at, updated_at FROM users WHERE id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT provider, email, linked_at FROM oauth_accounts WHERE user_id = ? ORDER BY linked_at').bind(id).all(),
    c.env.DB.prepare('SELECT n.id, n.body, n.created_at, a.real_name AS author_real_name FROM user_notes n LEFT JOIN users a ON a.id = n.author_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50').bind(id).all(),
    c.env.DB.prepare('SELECT s.id, s.action, s.reason, s.expires_at, s.created_at, a.real_name AS actor_real_name FROM sanctions s LEFT JOIN users a ON a.id = s.actor_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 50').bind(id).all(),
    c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?) AS sessions, (SELECT COUNT(*) FROM threads WHERE author_id = ? AND status != \'deleted\') AS threads, (SELECT COUNT(*) FROM posts WHERE author_id = ? AND status != \'deleted\') AS posts').bind(id, nowIso(), id, id).first()
  ]);
  if (!user) throw notFound('用户不存在');
  return c.json({ user, oauth_accounts: oauth.results ?? [], notes: notes.results ?? [], sanctions: sanctions.results ?? [], counts: counts ?? {} });
});

adminRoutes.post('/admin/users/:id/notes', async c => {
  const actor = await requireAdmin(c);
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: SessionUser['role'] }>();
  if (!target) throw notFound('用户不存在');
  if (!isAssignable(actor.role, target.role)) throw forbidden('不能管理同级或更高权限账号');
  const body = await c.req.json().catch(() => null);
  const note = String(body?.body ?? '').trim();
  if (note.length < 2 || note.length > 1000) throw badRequest('备注需为 2-1000 字');
  const noteId = createId();
  const timestamp = nowIso();
  await c.env.DB.prepare('INSERT INTO user_notes (id, user_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(noteId, id, actor.id, note, timestamp).run();
  await insertAudit(c.env, actor.id, 'user.note_create', 'user', id, note.slice(0, 200), { note_id: noteId });
  return c.json({ item: { id: noteId, body: note, created_at: timestamp } }, 201);
});

adminRoutes.post('/admin/users/:id/sessions/revoke', async c => {
  const actor = await requireAdmin(c);
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: SessionUser['role'] }>();
  if (!target) throw notFound('用户不存在');
  if (!isAssignable(actor.role, target.role)) throw forbidden('不能管理同级或更高权限账号');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await insertAudit(c.env, actor.id, 'user.sessions_revoke', 'user', id, '管理员强制退出该账号所有会话', {});
  return c.json({ success: true });
});

adminRoutes.get('/admin/content', async c => {
  await requireAdmin(c);
  const type = c.req.query('type') === 'posts' ? 'posts' : 'threads';
  const status = (c.req.query('status') ?? '').trim();
  const query = (c.req.query('query') ?? '').trim().slice(0, 80);
  const limit = boundedInteger(c.req.query('limit'), 100, 1, 200);
  const offset = boundedInteger(c.req.query('offset'), 0, 0, 100000);
  const pattern = `%${query}%`;
  if (type === 'threads') {
    const rows = await c.env.DB.prepare(`
      SELECT t.id, t.title, t.status, t.is_pinned, t.view_count, t.reply_count, t.created_at, t.updated_at,
             u.id AS author_id, u.username AS author_username, u.real_name AS author_real_name, u.enrollment_year AS author_enrollment_year,
             b.slug AS board_slug, b.name AS board_name,
             (SELECT COUNT(*) FROM reports r WHERE r.target_type = 'thread' AND r.target_id = t.id AND r.status IN ('open','in_review')) AS report_count
        FROM threads t JOIN users u ON u.id = t.author_id JOIN boards b ON b.id = t.board_id
       WHERE (? = '' OR t.status = ?) AND (? = '' OR t.title LIKE ?)
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `).bind(status, status, query, pattern, limit, offset).all();
    return c.json({ items: rows.results ?? [], type, limit, offset });
  }
  const rows = await c.env.DB.prepare(`
    SELECT p.id, p.thread_id, p.floor_number, p.content_markdown, p.status, p.created_at, p.updated_at,
           t.title AS thread_title, u.id AS author_id, u.username AS author_username, u.real_name AS author_real_name,
           (SELECT COUNT(*) FROM reports r WHERE r.target_type = 'post' AND r.target_id = p.id AND r.status IN ('open','in_review')) AS report_count
      FROM posts p JOIN users u ON u.id = p.author_id JOIN threads t ON t.id = p.thread_id
     WHERE (? = '' OR p.status = ?) AND (? = '' OR p.content_markdown LIKE ?)
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).bind(status, status, query, pattern, limit, offset).all();
  return c.json({ items: rows.results ?? [], type, limit, offset });
});

adminRoutes.get('/admin/audit', async c => {
  const actor = await requireAdmin(c);
  const action = (c.req.query('action') ?? '').trim();
  const actorId = (c.req.query('actor_id') ?? '').trim();
  const targetType = (c.req.query('target_type') ?? '').trim();
  const query = (c.req.query('query') ?? '').trim().slice(0, 80);
  const limit = boundedInteger(c.req.query('limit'), 100, 1, 300);
  const offset = boundedInteger(c.req.query('offset'), 0, 0, 100000);
  if (action && !AUDIT_ACTIONS.has(action)) throw badRequest('审计动作筛选无效');
  const pattern = `%${query}%`;
  const rows = await c.env.DB.prepare(`
    SELECT a.id, a.action, a.target_type, a.target_id, a.reason, a.metadata, a.created_at,
           a.actor_id, u.username AS actor_username, u.real_name AS actor_real_name
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     WHERE (? = '' OR a.action = ?) AND (? = '' OR a.actor_id = ?) AND (? = '' OR a.target_type = ?)
       AND (? = '' OR a.reason LIKE ? OR a.target_id LIKE ? OR u.real_name LIKE ?)
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).bind(action, action, actorId, actorId, targetType, targetType, query, pattern, pattern, pattern, limit, offset).all();
  const total = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     WHERE (? = '' OR a.action = ?) AND (? = '' OR a.actor_id = ?) AND (? = '' OR a.target_type = ?)
       AND (? = '' OR a.reason LIKE ? OR a.target_id LIKE ? OR u.real_name LIKE ?)
  `).bind(action, action, actorId, actorId, targetType, targetType, query, pattern, pattern, pattern).first<{ total: number }>();
  return c.json({ items: rows.results ?? [], total: Number(total?.total ?? 0), is_owner: actor.role === 'owner' });
});

adminRoutes.get('/admin/announcements', async c => {
  await requireAdmin(c);
  const rows = await c.env.DB.prepare(`
    SELECT a.*, u.username AS author_username, u.real_name AS author_real_name, u.enrollment_year AS author_enrollment_year
      FROM announcements a JOIN users u ON u.id = a.author_id
     ORDER BY a.starts_at DESC LIMIT 200
  `).all();
  return c.json({ items: rows.results ?? [] });
});

adminRoutes.delete('/admin/announcements/:id', async c => {
  const actor = await requireAdmin(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, title FROM announcements WHERE id = ?').bind(id).first<{ id: string; title: string }>();
  if (!row) throw notFound('公告不存在');
  await c.env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  await insertAudit(c.env, actor.id, 'announcement.delete', 'announcement', id, row.title, {});
  return c.json({ success: true });
});
