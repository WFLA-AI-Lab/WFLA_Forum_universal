import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env';
import { badRequest, unauthorized } from '../core/errors';
import { addSeconds, createId, nowIso } from '../core/utils';
import { createOpaqueToken } from '../modules/identity/crypto';
import { newToken, sessionCookieName, sha256 } from '../modules/identity/session';

export type OAuthProvider = 'microsoft' | 'github';
export type OAuthMode = 'login' | 'link';

const OAUTH_STATE_COOKIE = 'wfla_oauth_state';
const OAUTH_STATE_TTL_SECONDS = 600;

interface OAuthStateRow {
  state: string;
  provider: OAuthProvider;
  mode: OAuthMode;
  user_id: string | null;
  expires_at: string;
  return_to: string | null;
}

function normalizeReturnTo(value: unknown): string {
  const raw = String(value ?? '/').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function oauthCookieOptions(env: Env) {
  const isLocal = env.ENVIRONMENT === 'local';
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE ?? !isLocal,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS
  };
}

export async function createOAuthState(
  c: Context<{ Bindings: Env }>,
  provider: OAuthProvider,
  mode: OAuthMode,
  returnTo: string,
  userId?: string
): Promise<string> {
  const state = createOpaqueToken();
  await c.env.DB.prepare(
    `INSERT INTO oauth_states (state, provider, mode, user_id, created_at, expires_at, return_to)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    state,
    provider,
    mode,
    userId ?? null,
    nowIso(),
    addSeconds(new Date(), OAUTH_STATE_TTL_SECONDS).toISOString(),
    normalizeReturnTo(returnTo)
  ).run();
  setCookie(c, OAUTH_STATE_COOKIE, state, oauthCookieOptions(c.env));
  return state;
}

export async function consumeOAuthState(
  c: Context<{ Bindings: Env }>,
  provider: OAuthProvider,
  state: string
): Promise<OAuthStateRow> {
  const cookieState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });
  if (!cookieState || cookieState !== state) {
    throw unauthorized('登录状态无效或已过期');
  }

  const row = await c.env.DB.prepare(
    `SELECT state, provider, mode, user_id, expires_at, return_to
       FROM oauth_states WHERE state = ? AND provider = ?`
  ).bind(state, provider).first<OAuthStateRow>();
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    throw unauthorized('登录状态无效或已过期');
  }
  await c.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  return row;
}

export async function linkOAuthAccount(
  env: Env,
  userId: string,
  provider: OAuthProvider,
  subject: string,
  email: string | null
): Promise<void> {
  const existing = await env.DB.prepare(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND subject = ?'
  ).bind(provider, subject).first<{ user_id: string }>();
  if (existing && existing.user_id !== userId) {
    throw badRequest('该第三方账号已绑定其他论坛账号');
  }

  const linked = await env.DB.prepare(
    'SELECT id FROM oauth_accounts WHERE provider = ? AND user_id = ?'
  ).bind(provider, userId).first<{ id: string }>();
  if (linked) {
    await env.DB.prepare(
      'UPDATE oauth_accounts SET subject = ?, email = ?, linked_at = ? WHERE id = ?'
    ).bind(subject, email, nowIso(), linked.id).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO oauth_accounts (id, user_id, provider, subject, email, linked_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(createId(), userId, provider, subject, email, nowIso()).run();
  }
  await env.DB.prepare(
    'UPDATE users SET external_provider = ?, external_subject = ?, updated_at = ? WHERE id = ?'
  ).bind(provider, subject, nowIso(), userId).run();
}

export async function issueOAuthSession(
  c: Context<{ Bindings: Env }>,
  env: Env,
  userId: string
): Promise<void> {
  const token = newToken();
  const tokenHash = await sha256(token);
  const ttl = Number(env.SESSION_TTL_SECONDS ?? 604800);
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(tokenHash, userId, addSeconds(new Date(), ttl).toISOString(), nowIso()).run();
  const isLocalEnv = env.ENVIRONMENT === 'local';
  setCookie(c, sessionCookieName(env), token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE ?? !isLocalEnv,
    sameSite: env.COOKIE_SAMESITE ?? (isLocalEnv ? 'Lax' : 'Strict'),
    path: '/',
    maxAge: ttl
  });
}

export async function resolveOAuthLogin(env: Env, provider: OAuthProvider, subject: string): Promise<string> {
  const account = await env.DB.prepare(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND subject = ?'
  ).bind(provider, subject).first<{ user_id: string }>();
  if (!account) {
    throw unauthorized(`该${provider === 'github' ? ' GitHub ' : ' Microsoft '}账号尚未绑定论坛账号，请先使用论坛账号登录并绑定`);
  }
  const user = await env.DB.prepare('SELECT status FROM users WHERE id = ?')
    .bind(account.user_id).first<{ status: string }>();
  if (!user || user.status === 'banned' || user.status === 'deleted') throw unauthorized('账号不可用');
  if (user.status === 'pending') throw unauthorized('账号尚未激活，请等待管理员审核');
  return account.user_id;
}