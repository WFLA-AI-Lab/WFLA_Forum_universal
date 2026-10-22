import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Env, SessionUser } from '../env';
import { badRequest, unauthorized } from '../core/errors';
import { createId, addSeconds, nowIso } from '../core/utils';
import { requireUser } from '../modules/identity/session';
import { newToken, sessionCookieName, sha256 } from '../modules/identity/session';
import { createOpaqueToken } from '../modules/identity/crypto';

const TENANT = 'common';
const SCOPES = 'openid profile email User.Read';

interface MsTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function decodeJwtPayload<T>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}

async function issueSession(c: Context<{ Bindings: Env }>, env: Env, userId: string): Promise<void> {
  const token = newToken();
  const tokenHash = await sha256(token);
  const ttl = Number(env.SESSION_TTL_SECONDS ?? 604800);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, addSeconds(new Date(), ttl).toISOString(), nowIso()).run();
  const isLocalEnv = env.ENVIRONMENT === 'local';
  setCookie(c, sessionCookieName(env), token, {
    httpOnly: true, secure: !isLocalEnv, sameSite: isLocalEnv ? 'Lax' : 'Strict', path: '/', maxAge: ttl
  });
}

export const microsoftAuthRoutes = new Hono<{ Bindings: Env }>();

microsoftAuthRoutes.get('/auth/microsoft/login', async c => {
  const clientId = c.env.MS_CLIENT_ID;
  const redirectUri = c.env.MS_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Microsoft 登录尚未配置' } }, 501);
  }
  const state = createOpaqueToken();
  await c.env.DB.prepare('INSERT INTO oauth_states (state, created_at, expires_at, return_to) VALUES (?, ?, ?, ?)')
    .bind(state, nowIso(), new Date(Date.now() + 10 * 60 * 1000).toISOString(), c.req.query('return_to') ?? '/').run();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state
  });
  return c.redirect(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params.toString()}`);
});

microsoftAuthRoutes.get('/auth/microsoft/callback', async c => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) throw badRequest('回调参数缺失');
  const stateRow = await c.env.DB.prepare('SELECT state, expires_at, return_to FROM oauth_states WHERE state = ?').bind(state)
    .first<{ state: string; expires_at: string; return_to: string | null }>();
  if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) throw unauthorized('登录状态无效或已过期');
  await c.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

  const clientId = c.env.MS_CLIENT_ID;
  const clientSecret = c.env.MS_CLIENT_SECRET;
  const redirectUri = c.env.MS_REDIRECT_URI;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code,
      redirect_uri: redirectUri!,
      grant_type: 'authorization_code'
    })
  });
  const tokenData = await tokenRes.json() as MsTokenResponse;
  if (!tokenRes.ok || !tokenData.id_token) throw unauthorized(`Microsoft 登录失败：${tokenData.error_description ?? tokenData.error ?? '未知错误'}`);

  const claims = decodeJwtPayload<{ sub?: string; oid?: string; email?: string; preferred_username?: string; name?: string }>(tokenData.id_token);
  const subject = claims?.sub ?? claims?.oid;
  if (!subject) throw unauthorized('无法读取 Microsoft 身份');

  const account = await c.env.DB.prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND subject = ?')
    .bind('microsoft', subject).first<{ user_id: string }>();
  if (!account) {
    return c.json({ error: { code: 'NOT_LINKED', message: '该 Microsoft 账号尚未绑定论坛账号，请先使用论坛账号登录并绑定' } }, 403);
  }
  const user = await c.env.DB.prepare('SELECT status FROM users WHERE id = ?').bind(account.user_id).first<{ status: SessionUser['status'] }>();
  if (!user || user.status === 'banned' || user.status === 'deleted') throw unauthorized('账号不可用');
  if (user.status === 'pending') throw unauthorized('账号尚未激活，请等待管理员审核');

  await issueSession(c, c.env, account.user_id);
  return c.redirect(stateRow.return_to ?? '/');
});

microsoftAuthRoutes.post('/auth/microsoft/link', async c => {
  const actor = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const subject = String(body?.subject ?? '').trim();
  const email = body?.email ? String(body.email) : null;
  if (!subject) throw badRequest('缺少 Microsoft 身份标识');
  const existing = await c.env.DB.prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND subject = ?')
    .bind('microsoft', subject).first<{ user_id: string }>();
  if (existing && existing.user_id !== actor.id) throw badRequest('该 Microsoft 账号已绑定其他论坛账号');
  const linked = await c.env.DB.prepare('SELECT id FROM oauth_accounts WHERE provider = ? AND user_id = ?')
    .bind('microsoft', actor.id).first();
  if (linked) {
    await c.env.DB.prepare('UPDATE oauth_accounts SET subject = ?, email = ?, linked_at = ? WHERE id = ?')
      .bind(subject, email, nowIso(), (linked as { id: string }).id).run();
  } else {
    await c.env.DB.prepare('INSERT INTO oauth_accounts (id, user_id, provider, subject, email, linked_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(createId(), actor.id, 'microsoft', subject, email, nowIso()).run();
  }
  await c.env.DB.prepare('UPDATE users SET external_provider = ?, external_subject = ? WHERE id = ?')
    .bind('microsoft', subject, actor.id).run();
  return c.json({ success: true });
});
