import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import type { Env, SessionUser } from '../../env';
import { AppError, badRequest, conflict, unauthorized } from '../../core/errors';
import { passwordSchema, realNameSchema, enrollmentYearSchema, usernameSchema } from '../../core/validation';
import { createId, addSeconds, nowIso } from '../../core/utils';
import { loadSession, newToken, requireUser, sessionCookieName, sha256 } from './session';
import { isAdmin, requireRole, ROLE_RANK } from '../access/service';
import { enforceRateLimit } from './crypto';

const bcryptHash = (password: string): Promise<string> => bcrypt.hash(password, 12);
const bcryptCompare = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

const nicknamePattern = /^[\p{L}\p{N}_ .·-]{1,24}$/u;
const avatarPattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

function parseProfile(body: unknown): { nickname: string; avatarDataUrl: string | null } {
  if (!body || typeof body !== 'object') throw badRequest('请求体不能为空');
  const input = body as Record<string, unknown>;
  const nickname = typeof input.nickname === 'string' ? input.nickname.trim() : '';
  if (!nicknamePattern.test(nickname)) throw badRequest('昵称需为 1-24 个中英文字符、数字或常用符号');
  const avatarDataUrl = input.avatar_data_url === null || input.avatar_data_url === ''
    ? null
    : typeof input.avatar_data_url === 'string' ? input.avatar_data_url : undefined;
  if (avatarDataUrl === undefined) throw badRequest('头像格式无效');
  if (avatarDataUrl && (avatarDataUrl.length > 350_000 || !avatarPattern.test(avatarDataUrl))) {
    throw badRequest('头像仅支持 PNG、JPEG 或 WebP，且处理后不得超过 256KB');
  }
  return { nickname, avatarDataUrl };
}

function publicUser(user: SessionUser) {
  return {
    id: user.id,
    username: user.username,
    real_name: user.realName,
    enrollment_year: user.enrollmentYear,
    role: user.role,
    status: user.status,
    created_at: user.createdAt,
    updated_at: user.updatedAt
  };
}

function assertCanManage(actor: SessionUser, targetId: string, targetRole: SessionUser['role'], action: string): void {
  if (actor.id === targetId) return;
  if (ROLE_RANK[targetRole] >= ROLE_RANK[actor.role]) throw new AppError('FORBIDDEN', `不能${action}同级或更高权限账号`);
}

export const identityRoutes = new Hono<{ Bindings: Env }>();

identityRoutes.post('/login', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    throw badRequest('用户名和密码不能为空');
  }
  const forwarded = c.req.header('x-forwarded-for');
  const ip = c.env.TRUST_PROXY_HEADERS && forwarded
    ? forwarded.split(',')[0]?.trim() ?? 'unknown'
    : (c.req.header('cf-connecting-ip') ?? 'unknown');
  await enforceRateLimit(`login:${ip}`);
  const row = await c.env.DB.prepare(
    'SELECT id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at FROM users WHERE username = ? COLLATE NOCASE'
  ).bind(body.username).first<{
    id: string; username: string; password_hash: string; real_name: string; enrollment_year: string;
    role: SessionUser['role']; status: SessionUser['status']; created_at: string; updated_at: string;
  }>();
  if (!row || !(await bcryptCompare(body.password, row.password_hash))) {
    throw unauthorized('用户名或密码错误');
  }
  if (row.status === 'banned' || row.status === 'deleted') throw unauthorized('账号不可用');
  const user: SessionUser = {
    id: row.id, username: row.username, realName: row.real_name, enrollmentYear: row.enrollment_year,
    role: row.role, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
  };
  const token = newToken();
  const tokenHash = await sha256(token);
  const ttl = Number(c.env.SESSION_TTL_SECONDS ?? 604800);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, user.id, addSeconds(new Date(), ttl).toISOString(), nowIso()).run();
  const isLocalEnv = c.env.ENVIRONMENT === 'local';
  setCookie(c, sessionCookieName(c.env), token, {
    httpOnly: true,
    secure: c.env.COOKIE_SECURE ?? !isLocalEnv,
    sameSite: c.env.COOKIE_SAMESITE ?? (isLocalEnv ? 'Lax' : 'Strict'),
    path: '/',
    maxAge: ttl
  });
  return c.json({ user: publicUser(user) });
});

identityRoutes.post('/logout', async c => {
  const user = await loadSession(c);
  if (user) {
    const cookieName = sessionCookieName(c.env);
    const token = c.req.header('cookie')?.match(new RegExp(cookieName + '=([^;]+)'))?.[1];
    if (token) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    }
  }
  deleteCookie(c, sessionCookieName(c.env), { path: '/' });
  return c.json({ success: true });
});

identityRoutes.get('/me', async c => {
  const user = await requireUser(c);
  return c.json({ user: publicUser(user) });
});

identityRoutes.get('/me/profile', async c => {
  const user = await requireUser(c);
  const profile = await c.env.DB.prepare(
    'SELECT nickname, avatar_data_url, updated_at FROM user_profiles WHERE user_id = ?'
  ).bind(user.id).first<{ nickname: string; avatar_data_url: string | null; updated_at: string }>();
  return c.json({
    profile: profile ?? { nickname: user.realName, avatar_data_url: null, updated_at: user.updatedAt }
  });
});

identityRoutes.patch('/me/profile', async c => {
  const user = await requireUser(c);
  const { nickname, avatarDataUrl } = parseProfile(await c.req.json().catch(() => null));
  const updatedAt = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO user_profiles (user_id, nickname, avatar_data_url, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       nickname = excluded.nickname,
       avatar_data_url = excluded.avatar_data_url,
       updated_at = excluded.updated_at`
  ).bind(user.id, nickname, avatarDataUrl, updatedAt).run();
  return c.json({ profile: { nickname, avatar_data_url: avatarDataUrl, updated_at: updatedAt } });
});

identityRoutes.get('/users', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const rows = await c.env.DB.prepare(
    'SELECT id, username, real_name, enrollment_year, role, status, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 300'
  ).all();
  return c.json({ items: rows.results ?? [] });
});

identityRoutes.post('/users/:id/role', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(targetId).first<{ id: string; role: SessionUser['role'] }>();
  if (!target) throw new AppError('NOT_FOUND', '用户不存在');
  assertCanManage(actor, targetId, target.role, '修改');
  const body = await c.req.json().catch(() => null);
  const newRole = String(body?.role ?? '') as SessionUser['role'];
  if (!['member','moderator','admin'].includes(newRole)) throw badRequest('角色无效');
  if (ROLE_RANK[newRole] >= ROLE_RANK[actor.role]) throw new AppError('FORBIDDEN', '不能授予同级或更高权限');
  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(newRole, nowIso(), targetId).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.role_change', 'user', targetId, String(body?.reason ?? ''), JSON.stringify({ role: newRole }), nowIso()).run();
  return c.json({ success: true });
});
identityRoutes.get('/users/:id', async c => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    'SELECT id, username, real_name, enrollment_year, role, status, created_at, updated_at FROM users WHERE id = ? AND status != ?'
  ).bind(id, 'deleted').first<{ id: string; username: string; real_name: string; enrollment_year: string; role: SessionUser['role']; status: SessionUser['status']; created_at: string; updated_at: string; }>();
  if (!row) throw new AppError('NOT_FOUND', '用户不存在');
  return c.json({
    user: {
      id: row.id,
      real_name: row.real_name,
      enrollment_year: row.enrollment_year,
      role: row.role,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  });
});

identityRoutes.patch('/users/:id', async c => {
  const actor = await requireUser(c);
  const targetId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(targetId).first<{ id: string; role: SessionUser['role'] }>();
  if (!row) throw new AppError('NOT_FOUND', '用户不存在');
  if (actor.id !== targetId) {
    if (!isAdmin(actor.role)) throw new AppError('FORBIDDEN', '只能修改自己的资料');
    assertCanManage(actor, targetId, row.role, '修改');
  }
  const body = await c.req.json().catch(() => null);
  if (!body) throw badRequest('请求体不能为空');
  const realName = body.real_name === undefined ? undefined : realNameSchema.parse(body.real_name);
  const enrollmentYear = body.enrollment_year === undefined ? undefined : enrollmentYearSchema.parse(body.enrollment_year);
  if (realName === undefined && enrollmentYear === undefined) throw badRequest('没有可更新字段');
  await c.env.DB.prepare(
    'UPDATE users SET real_name = COALESCE(?, real_name), enrollment_year = COALESCE(?, enrollment_year), updated_at = ? WHERE id = ?'
  ).bind(realName ?? null, enrollmentYear ?? null, nowIso(), targetId).run();
  return c.json({ success: true });
});

identityRoutes.post('/users', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const body = await c.req.json().catch(() => null);
  const username = usernameSchema.parse(body?.username);
  const password = passwordSchema.parse(body?.password);
  const realName = realNameSchema.parse(body?.real_name);
  const enrollmentYear = enrollmentYearSchema.parse(body?.enrollment_year);
  const role = (body?.role ?? 'member') as SessionUser['role'];
  if (!['member','moderator','admin'].includes(role)) throw badRequest('角色无效');
  if (ROLE_RANK[role] >= ROLE_RANK[actor.role]) throw new AppError('FORBIDDEN', '不能创建同级或更高权限账号');
  const existing = await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (existing) throw conflict('用户名已存在');
  const id = createId();
  await c.env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, username, await bcryptHash(password), realName, enrollmentYear, role, 'active', nowIso(), nowIso()).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.create', 'user', id, 'admin provisioned internal beta account', JSON.stringify({ role }), nowIso()).run();
  return c.json({ user: { id, username, real_name: realName, enrollment_year: enrollmentYear, role, status: 'active' } }, 201);
});

identityRoutes.post('/users/:id/password', async c => {
  const actor = await requireUser(c);
  const targetId = c.req.param('id');
  if (actor.id !== targetId) {
    if (!isAdmin(actor.role)) throw new AppError('FORBIDDEN', '没有权限修改密码');
    const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(targetId).first<{ role: SessionUser['role'] }>();
    if (!target) throw new AppError('NOT_FOUND', '用户不存在');
    assertCanManage(actor, targetId, target.role, '修改密码');
  }
  const body = await c.req.json().catch(() => null);
  const password = passwordSchema.parse(body?.password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(await bcryptHash(password), nowIso(), targetId).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
  return c.json({ success: true });
});

identityRoutes.post('/users/:id/status', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(targetId).first<{ role: SessionUser['role'] }>();
  if (!target) throw new AppError('NOT_FOUND', '用户不存在');
  assertCanManage(actor, targetId, target.role, '操作');
  const body = await c.req.json().catch(() => null);
  const status = (body?.status ?? '') as SessionUser['status'];
  if (!['active','muted','banned','pending'].includes(status)) throw badRequest('状态无效');
  const timestamp = nowIso();
  await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind(status, timestamp, targetId).run();
  if (status === 'muted' || status === 'banned' || status === 'active') {
    await c.env.DB.prepare('INSERT INTO sanctions (id, user_id, actor_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)')
      .bind(createId(), targetId, actor.id, status === 'active' ? 'restore' : status === 'muted' ? 'mute' : 'ban', String(body?.reason ?? ''), timestamp).run();
  }
  if (status === 'banned') {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
  }
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.status_change', 'user', targetId, String(body?.reason ?? ''), JSON.stringify({ status }), nowIso()).run();
  return c.json({ success: true });
});
