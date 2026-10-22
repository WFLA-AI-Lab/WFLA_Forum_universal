import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import type { Env, SessionUser } from '../../env';
import { AppError, badRequest, conflict, unauthorized } from '../../core/errors';
import { passwordSchema, realNameSchema, graduationYearSchema, usernameSchema } from '../../core/validation';
import { createId, addSeconds, nowIso } from '../../core/utils';
import { loadSession, newToken, requireUser, sessionCookieName, sha256 } from './session';
import { atLeast, isAdmin, isOwner, requireRole } from '../access/service';
import { enforceRateLimit } from './crypto';

const bcryptHash = (password: string): Promise<string> => bcrypt.hash(password, 12);
const bcryptCompare = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

function publicUser(user: SessionUser) {
  return {
    id: user.id,
    username: user.username,
    real_name: user.realName,
    graduation_year: user.graduationYear,
    role: user.role,
    status: user.status,
    created_at: user.createdAt,
    updated_at: user.updatedAt
  };
}

export const identityRoutes = new Hono<{ Bindings: Env }>();

identityRoutes.post('/login', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    throw badRequest('用户名和密码不能为空');
  }
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  await enforceRateLimit(`login:${ip}`);
  const row = await c.env.DB.prepare(
    'SELECT id, username, password_hash, real_name, graduation_year, role, status, created_at, updated_at FROM users WHERE username = ? COLLATE NOCASE'
  ).bind(body.username).first<{
    id: string; username: string; password_hash: string; real_name: string; graduation_year: string;
    role: SessionUser['role']; status: SessionUser['status']; created_at: string; updated_at: string;
  }>();
  if (!row || !(await bcryptCompare(body.password, row.password_hash))) {
    throw unauthorized('用户名或密码错误');
  }
  if (row.status === 'banned' || row.status === 'deleted') throw unauthorized('账号不可用');
  const user: SessionUser = {
    id: row.id, username: row.username, realName: row.real_name, graduationYear: row.graduation_year,
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
    sameSite: isLocalEnv ? 'Lax' : 'Strict',
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

identityRoutes.get('/users', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'moderator');
  const rows = await c.env.DB.prepare(
    'SELECT id, username, real_name, graduation_year, role, status, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 300'
  ).all();
  return c.json({ items: rows.results ?? [] });
});

identityRoutes.post('/users/:id/role', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(targetId).first<{ id: string; role: SessionUser['role'] }>();
  if (!target) throw new AppError('NOT_FOUND', '用户不存在');
  if (!isOwner(actor.role) && atLeast(target.role, 'admin')) throw new AppError('FORBIDDEN', '不能修改同级或更高权限用户');
  const body = await c.req.json().catch(() => null);
  const newRole = String(body?.role ?? '') as SessionUser['role'];
  if (!['member','moderator','admin'].includes(newRole)) throw badRequest('角色无效');
  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(newRole, nowIso(), targetId).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.role_change', 'user', targetId, String(body?.reason ?? ''), JSON.stringify({ role: newRole }), nowIso()).run();
  return c.json({ success: true });
});
identityRoutes.get('/users/:id', async c => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    'SELECT id, username, real_name, graduation_year, role, status, created_at, updated_at FROM users WHERE id = ? AND status != ?'
  ).bind(id, 'deleted').first<{ id: string; username: string; real_name: string; graduation_year: string; role: SessionUser['role']; status: SessionUser['status']; created_at: string; updated_at: string; }>();
  if (!row) throw new AppError('NOT_FOUND', '用户不存在');
  return c.json({
    user: {
      id: row.id,
      real_name: row.real_name,
      graduation_year: row.graduation_year,
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
  if (actor.id !== targetId && !isAdmin(actor.role)) throw new AppError('FORBIDDEN', '只能修改自己的资料');
  const body = await c.req.json().catch(() => null);
  if (!body) throw badRequest('请求体不能为空');
  const realName = body.real_name === undefined ? undefined : realNameSchema.parse(body.real_name);
  const graduationYear = body.graduation_year === undefined ? undefined : graduationYearSchema.parse(body.graduation_year);
  if (realName === undefined && graduationYear === undefined) throw badRequest('没有可更新字段');
  await c.env.DB.prepare(
    'UPDATE users SET real_name = COALESCE(?, real_name), graduation_year = COALESCE(?, graduation_year), updated_at = ? WHERE id = ?'
  ).bind(realName ?? null, graduationYear ?? null, nowIso(), targetId).run();
  return c.json({ success: true });
});

identityRoutes.post('/users', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const body = await c.req.json().catch(() => null);
  const username = usernameSchema.parse(body?.username);
  const password = passwordSchema.parse(body?.password);
  const realName = realNameSchema.parse(body?.real_name);
  const graduationYear = graduationYearSchema.parse(body?.graduation_year);
  const role = (body?.role ?? 'member') as SessionUser['role'];
  if (role === 'owner' && !isOwner(actor.role)) throw new AppError('FORBIDDEN', '只有所有者可以创建所有者');
  if (role !== 'owner' && !atLeast(role, 'member')) throw badRequest('角色无效');
  const existing = await c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (existing) throw conflict('用户名已存在');
  const id = createId();
  await c.env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, graduation_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, username, await bcryptHash(password), realName, graduationYear, role, 'active', nowIso(), nowIso()).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.create', 'user', id, 'admin provisioned internal beta account', JSON.stringify({ role }), nowIso()).run();
  return c.json({ user: { id, username, real_name: realName, graduation_year: graduationYear, role, status: 'active' } }, 201);
});

identityRoutes.post('/users/:id/password', async c => {
  const actor = await requireUser(c);
  const targetId = c.req.param('id');
  if (actor.id !== targetId && !isAdmin(actor.role)) throw new AppError('FORBIDDEN', '没有权限修改密码');
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
  if (atLeast(target.role, actor.role)) throw new AppError('FORBIDDEN', '不能操作同级或更高权限账号');
  const body = await c.req.json().catch(() => null);
  const status = (body?.status ?? '') as SessionUser['status'];
  if (!['active','muted','banned','pending'].includes(status)) throw badRequest('状态无效');
  await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind(status, nowIso(), targetId).run();
  if (status === 'banned') {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
  }
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createId(), actor.id, 'user.status_change', 'user', targetId, String(body?.reason ?? ''), JSON.stringify({ status }), nowIso()).run();
  return c.json({ success: true });
});
