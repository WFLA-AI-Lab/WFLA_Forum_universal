import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, SessionUser } from '../../env';
import { unauthorized } from '../../core/errors';
import { createOpaqueToken } from './crypto';

export const SESSION_COOKIE_PREFIX = 'wfla_session';
export const SESSION_COOKIE_LOCAL = 'wfla_session';

export function sessionCookieName(env: { ENVIRONMENT?: string }): string {
  return env.ENVIRONMENT === 'local' ? SESSION_COOKIE_LOCAL : SESSION_COOKIE_PREFIX;
}

export const SESSION_COOKIE = SESSION_COOKIE_PREFIX;

interface SessionRow {
  token_hash: string;
  expires_at: string;
  id: string;
  username: string;
  real_name: string;
  enrollment_year: string;
  role: SessionUser['role'];
  status: SessionUser['status'];
  created_at: string;
  updated_at: string;
}

function mapUser(row: SessionRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    realName: row.real_name,
    enrollmentYear: row.enrollment_year,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadSession(c: Context<{ Bindings: Env }>): Promise<SessionUser | null> {
  const token = getCookie(c, sessionCookieName(c.env));
  if (!token) return null;
  const tokenHash = await sha256(token);
  const result = await c.env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, u.id, u.username, u.real_name, u.enrollment_year, u.role, u.status,
            u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(tokenHash).first<SessionRow>();
  if (!result) return null;
  if (new Date(result.expires_at).getTime() <= Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return mapUser(result);
}

export async function requireUser(c: Context<{ Bindings: Env }>): Promise<SessionUser> {
  const user = await loadSession(c);
  if (!user) throw unauthorized();
  return user;
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  return createOpaqueToken();
}
