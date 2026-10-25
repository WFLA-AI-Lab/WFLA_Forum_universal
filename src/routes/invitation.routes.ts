import { Hono } from 'hono';
import type { Env, SessionUser } from '../env';
import { requireUser } from '../modules/identity/session';
import { requireRole, ROLE_RANK } from '../modules/access/service';
import { badRequest, forbidden, notFound } from '../core/errors';
import { createId, nowIso } from '../core/utils';
import bcrypt from 'bcryptjs';
import { usernameSchema, passwordSchema, realNameSchema, enrollmentYearSchema } from '../core/validation';

type InvitationRole = 'member' | 'moderator' | 'admin';

interface InvitationRow {
  id: string;
  code: string;
  role: InvitationRole;
  created_by: string | null;
  used_by: string | null;
  expires_at: string | null;
  revoked_at?: string | null;
  created_at: string;
}

const INVITATION_ROLES: InvitationRole[] = ['member', 'moderator', 'admin'];

function invitationRole(value: unknown): InvitationRole {
  const role = String(value ?? 'member') as InvitationRole;
  if (!INVITATION_ROLES.includes(role)) throw badRequest('邀请码角色无效');
  return role;
}

function assertCanIssue(actor: SessionUser, role: InvitationRole): void {
  if (ROLE_RANK[role] >= ROLE_RANK[actor.role]) {
    throw forbidden('不能生成同级或更高权限的邀请码');
  }
}

function assertCanApprove(actor: SessionUser, role: InvitationRole): void {
  if (ROLE_RANK[role] >= ROLE_RANK[actor.role]) {
    throw forbidden('不能激活同级或更高权限的账号');
  }
}

export const invitationRoutes = new Hono<{ Bindings: Env }>();

invitationRoutes.post('/invitations', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const body = await c.req.json().catch(() => ({}));
  const role = invitationRole(body?.role);
  assertCanIssue(actor, role);
  const ttlHours = Number(body?.ttl_hours ?? 168);
  if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > 24 * 30) throw badRequest('邀请有效期必须在 1 小时到 30 天之间');
  const code = crypto.randomUUID().replaceAll('-', '');
  const id = createId();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO invitations (id, code, role, created_by, used_by, expires_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)'
  ).bind(id, code, role, actor.id, expiresAt, timestamp).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'invitation.create', 'invitation', id, 'admin issued invitation', JSON.stringify({ ttl_hours: ttlHours, role }), timestamp).run();
  return c.json({ item: { id, code, role, expires_at: expiresAt, used: false } }, 201);
});

invitationRoutes.get('/invitations', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const visibleRoles = INVITATION_ROLES.filter(role => ROLE_RANK[role] < ROLE_RANK[actor.role]);
  const placeholders = visibleRoles.map(() => '?').join(', ');
  const rows = await c.env.DB.prepare(
    `SELECT id, code, role, created_by, used_by, expires_at, revoked_by, revoked_at, created_at
       FROM invitations
      WHERE role IN (${placeholders})
      ORDER BY created_at DESC LIMIT 200`
  ).bind(...visibleRoles).all<InvitationRow>();
  return c.json({ items: rows.results ?? [] });
});

invitationRoutes.post('/register', async c => {
  const body = await c.req.json().catch(() => null);
  const username = usernameSchema.parse(body?.username);
  const password = passwordSchema.parse(body?.password);
  const realName = realNameSchema.parse(body?.real_name);
  const enrollmentYear = enrollmentYearSchema.parse(body?.enrollment_year);
  const code = String(body?.invitation_code ?? '').trim();
  if (!/^[a-f0-9]{32}$/.test(code)) throw badRequest('邀请码无效');
  const invitation = await c.env.DB.prepare(
    'SELECT id, role, used_by, expires_at, revoked_at FROM invitations WHERE code = ?'
  ).bind(code).first<InvitationRow>();
  if (!invitation || invitation.used_by || invitation.revoked_at || (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now())) {
    throw badRequest('邀请码不存在、已使用或已过期');
  }
  const existing = await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (existing) throw badRequest('用户名已存在');
  const id = createId();
  const timestamp = nowIso();
  const role = invitationRole(invitation.role);
  const passwordHash = await bcrypt.hash(password, 12);
  // The insert and the conditional claim run in one transaction. The second
  // registrant's claim updates zero rows and its user insert is rolled back.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(id, username, passwordHash, realName, enrollmentYear, role, timestamp, timestamp),
    c.env.DB.prepare('UPDATE invitations SET used_by = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL').bind(id, invitation.id)
  ]);
  const claimed = await c.env.DB.prepare('SELECT used_by FROM invitations WHERE id = ?').bind(invitation.id).first<{ used_by: string | null }>();
  if (claimed?.used_by !== id) throw badRequest('邀请码已被使用，请重新获取');
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), null, 'invitation.register', 'user', id, 'invitation registration pending approval', JSON.stringify({ invitation_id: invitation.id, proposed_role: role }), timestamp).run();
  return c.json({ item: { id, username, real_name: realName, enrollment_year: enrollmentYear, role, status: 'pending' } }, 201);
});

invitationRoutes.post('/users/:id/activate', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT id, status, role FROM users WHERE id = ?').bind(targetId).first<{ id: string; status: SessionUser['status']; role: SessionUser['role'] }>();
  if (!target || target.status !== 'pending') throw notFound('待激活用户不存在');
  if (!INVITATION_ROLES.includes(target.role as InvitationRole)) throw forbidden('待激活账号角色无效');
  assertCanApprove(actor, target.role as InvitationRole);
  const timestamp = nowIso();
  await c.env.DB.prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`).bind(timestamp, targetId).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.activate', 'user', targetId, 'invitation registration approved', JSON.stringify({ role: target.role }), timestamp).run();
  return c.json({ success: true });
});

invitationRoutes.post('/invitations/:id/revoke', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const id = c.req.param('id');
  const item = await c.env.DB.prepare('SELECT id, role, used_by, revoked_at FROM invitations WHERE id = ?').bind(id).first<{ id: string; role: InvitationRole; used_by: string | null; revoked_at: string | null }>();
  if (!item) throw notFound('邀请码不存在');
  assertCanIssue(actor, item.role);
  if (item.used_by) throw badRequest('已使用的邀请码不能吊销');
  if (item.revoked_at) return c.json({ success: true });
  const timestamp = nowIso();
  await c.env.DB.prepare('UPDATE invitations SET revoked_by = ?, revoked_at = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL')
    .bind(actor.id, timestamp, id).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'invitation.revoke', 'invitation', id, 'admin revoked invitation', JSON.stringify({ role: item.role }), timestamp).run();
  return c.json({ success: true });
});
