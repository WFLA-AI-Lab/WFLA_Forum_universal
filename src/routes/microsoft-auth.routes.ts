import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { AppError, badRequest, unauthorized } from '../core/errors';
import { outboundJson } from '../core/http';
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
const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

interface MsTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface MsIdTokenClaims {
  sub?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
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

function requireMicrosoftConfig(env: Env): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = env.MS_CLIENT_ID;
  const clientSecret = env.MS_CLIENT_SECRET;
  const redirectUri = env.MS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw badRequest('Microsoft 登录尚未配置完整');
  return { clientId, clientSecret, redirectUri };
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
  return c.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
}

async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<string> {
  const result = await outboundJson<MsTokenResponse>({
    url: TOKEN_URL,
    method: 'POST',
    label: 'Microsoft',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!result.ok || !result.data?.id_token) {
    const detail = result.data?.error_description ?? result.data?.error ?? `HTTP ${result.status}`;
    throw unauthorized(`Microsoft 登录失败：${detail}`);
  }
  return result.data.id_token;
}

export const microsoftAuthRoutes = new Hono<{ Bindings: Env }>();

microsoftAuthRoutes.get('/auth/microsoft/login', c => beginMicrosoftFlow(c, 'login'));
microsoftAuthRoutes.get('/auth/microsoft/link', c => beginMicrosoftFlow(c, 'link'));

microsoftAuthRoutes.get('/auth/microsoft/callback', async c => {
  try {
    return await handleMicrosoftCallback(c);
  } catch (error) {
    return failToSite(c, error);
  }
});

async function handleMicrosoftCallback(c: Context<{ Bindings: Env }>): Promise<Response> {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) throw badRequest('回调参数缺失');
  const stateRow = await consumeOAuthState(c, 'microsoft', state);

  const { clientId, clientSecret, redirectUri } = requireMicrosoftConfig(c.env);
  const idToken = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);

  // The token is received directly from Microsoft over TLS inside this request,
  // so its claims are trusted; the signature is not re-verified here.
  const claims = decodeJwtPayload<MsIdTokenClaims>(idToken);
  const subject = claims?.sub ?? claims?.oid;
  if (!subject) throw unauthorized('无法读取 Microsoft 身份');

  if (stateRow.mode === 'link') {
    const actor = await requireUser(c);
    if (!stateRow.user_id || stateRow.user_id !== actor.id) throw unauthorized('绑定状态无效，请重新发起绑定');
    await linkOAuthAccount(c.env, actor.id, 'microsoft', subject, claims?.email ?? claims?.preferred_username ?? null);
    return c.redirect(withLinkNotice(stateRow.return_to ?? '/', 'microsoft'));
  }

  const userId = await resolveOAuthLogin(c.env, 'microsoft', subject);
  await issueOAuthSession(c, c.env, userId);
  return c.redirect(stateRow.return_to ?? '/');
}

function withLinkNotice(returnTo: string, provider: string): string {
  const url = new URL(returnTo, 'https://wfla.invalid');
  url.searchParams.set('linked', provider);
  return `${url.pathname}${url.search}`;
}

/**
 * Bounces the user back to the forum with a readable reason instead of leaving
 * them on a bare JSON error page. Messages are already user-safe AppErrors.
 */
function failToSite(c: Context<{ Bindings: Env }>, error: unknown): Response {
  const message = error instanceof AppError
    ? error.message
    : 'Microsoft 登录暂时不可用，请稍后重试';
  console.error(JSON.stringify({
    level: 'error',
    route: 'microsoft.callback',
    message: error instanceof Error ? error.message : String(error)
  }));
  const url = new URL('https://wfla.invalid');
  url.searchParams.set('oauth_error', message);
  return c.redirect(`/${url.search}`);
}
