import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, unauthorized } from '../core/errors';
import { requireUser } from '../modules/identity/session';
import {
  consumeOAuthState,
  createOAuthState,
  issueOAuthSession,
  linkOAuthAccount,
  resolveOAuthLogin
} from './oauth-shared';

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

function requireMicrosoftConfig(env: Env): { clientId: string; redirectUri: string } {
  const clientId = env.MS_CLIENT_ID;
  const redirectUri = env.MS_REDIRECT_URI;
  if (!clientId || !redirectUri) throw badRequest('Microsoft 登录尚未配置');
  return { clientId, redirectUri };
}

async function beginMicrosoftFlow(c: Context<{ Bindings: Env }>, mode: 'login' | 'link'): Promise<Response> {
  const { clientId, redirectUri } = requireMicrosoftConfig(c.env);
  const userId = mode === 'link' ? (await requireUser(c)).id : undefined;
  const state = await createOAuthState(c, 'microsoft', mode, String(c.req.query('return_to') ?? '/'), userId);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state
  });
  return c.redirect(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params.toString()}`);
}

export const microsoftAuthRoutes = new Hono<{ Bindings: Env }>();

microsoftAuthRoutes.get('/auth/microsoft/login', c => beginMicrosoftFlow(c, 'login'));
microsoftAuthRoutes.get('/auth/microsoft/link', c => beginMicrosoftFlow(c, 'link'));

microsoftAuthRoutes.get('/auth/microsoft/callback', async c => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) throw badRequest('回调参数缺失');
  const stateRow = await consumeOAuthState(c, 'microsoft', state);

  const { clientId, redirectUri } = requireMicrosoftConfig(c.env);
  const clientSecret = c.env.MS_CLIENT_SECRET;
  if (!clientSecret) throw badRequest('Microsoft 登录尚未配置');

  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const tokenData = await tokenRes.json() as MsTokenResponse;
  if (!tokenRes.ok || !tokenData.id_token) {
    throw unauthorized(`Microsoft 登录失败：${tokenData.error_description ?? tokenData.error ?? '未知错误'}`);
  }

  const claims = decodeJwtPayload<{ sub?: string; oid?: string; email?: string; preferred_username?: string; name?: string }>(tokenData.id_token);
  const subject = claims?.sub ?? claims?.oid;
  if (!subject) throw unauthorized('无法读取 Microsoft 身份');

  if (stateRow.mode === 'link') {
    const actor = await requireUser(c);
    if (!stateRow.user_id || stateRow.user_id !== actor.id) throw unauthorized('绑定状态无效，请重新发起绑定');
    await linkOAuthAccount(c.env, actor.id, 'microsoft', subject, claims?.email ?? claims?.preferred_username ?? null);
    return c.redirect(stateRow.return_to ?? '/');
  }

  const userId = await resolveOAuthLogin(c.env, 'microsoft', subject);
  await issueOAuthSession(c, c.env, userId);
  return c.redirect(stateRow.return_to ?? '/');
});