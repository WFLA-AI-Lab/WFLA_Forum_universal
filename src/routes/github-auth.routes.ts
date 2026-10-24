import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { AppError, badRequest, unauthorized } from '../core/errors';
import { asArray, outboundJson } from '../core/http';
import { requireUser } from '../modules/identity/session';
import {
  consumeOAuthState,
  createOAuthState,
  issueOAuthSession,
  linkOAuthAccount,
  resolveOAuthLogin
} from './oauth-shared';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';
const GITHUB_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'WFLA-Wall'
};

interface GitHubUser {
  id?: number;
  login?: string;
  name?: string;
  email?: string | null;
}

interface GitHubEmail {
  email?: string;
  primary?: boolean;
  verified?: boolean;
}

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

function requireGitHubConfig(env: Env): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  const redirectUri = env.GITHUB_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw badRequest('GitHub 登录尚未配置完整');
  return { clientId, clientSecret, redirectUri };
}

async function beginGitHubFlow(c: Context<{ Bindings: Env }>, mode: 'login' | 'link'): Promise<Response> {
  const { clientId, redirectUri } = requireGitHubConfig(c.env);
  const userId = mode === 'link' ? (await requireUser(c)).id : undefined;
  const state = await createOAuthState(c, 'github', mode, String(c.req.query('return_to') ?? '/'), userId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<string> {
  const result = await outboundJson<GitHubTokenResponse>({
    url: GITHUB_TOKEN_URL,
    method: 'POST',
    label: 'GitHub',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri })
  });
  const data = result.data;
  if (!result.ok || !data?.access_token) {
    const detail = data?.error_description ?? data?.error ?? `HTTP ${result.status}`;
    throw unauthorized(`GitHub 登录失败：${detail}`);
  }
  return data.access_token;
}

async function fetchGitHubProfile(accessToken: string): Promise<GitHubUser> {
  const result = await outboundJson<GitHubUser>({
    url: GITHUB_USER_URL,
    label: 'GitHub',
    headers: { ...GITHUB_API_HEADERS, Authorization: `Bearer ${accessToken}` }
  });
  if (!result.ok || !result.data?.id) {
    throw unauthorized(`无法读取 GitHub 身份（HTTP ${result.status}）`);
  }
  return result.data;
}

/**
 * Best-effort primary email lookup. Any permission, quota or network problem
 * degrades to `null` instead of failing the whole login: an email is optional
 * data for a linked account.
 */
async function fetchPrimaryEmail(accessToken: string): Promise<string | null> {
  let result;
  try {
    result = await outboundJson<unknown>({
      url: GITHUB_EMAILS_URL,
      label: 'GitHub',
      headers: { ...GITHUB_API_HEADERS, Authorization: `Bearer ${accessToken}` }
    });
  } catch {
    return null;
  }
  if (!result.ok) return null;
  // GitHub answers with an object such as { "message": "..." } on some errors;
  // only a real array can be treated as an email list.
  const emails = asArray<GitHubEmail>(result.data);
  const primary = emails.find(item => item.primary && item.verified) ?? emails.find(item => item.verified);
  return primary?.email ?? null;
}

export const githubAuthRoutes = new Hono<{ Bindings: Env }>();

githubAuthRoutes.get('/auth/github/login', c => beginGitHubFlow(c, 'login'));
githubAuthRoutes.get('/auth/github/link', c => beginGitHubFlow(c, 'link'));

githubAuthRoutes.get('/auth/github/callback', async c => {
  try {
    return await handleGitHubCallback(c);
  } catch (error) {
    return failToSite(c, error);
  }
});

async function handleGitHubCallback(c: Context<{ Bindings: Env }>): Promise<Response> {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) throw badRequest('回调参数缺失');
  const stateRow = await consumeOAuthState(c, 'github', state);

  const { clientId, clientSecret, redirectUri } = requireGitHubConfig(c.env);
  const accessToken = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
  const profile = await fetchGitHubProfile(accessToken);
  const subject = String(profile.id);
  const email = profile.email ?? await fetchPrimaryEmail(accessToken);

  if (stateRow.mode === 'link') {
    const actor = await requireUser(c);
    if (!stateRow.user_id || stateRow.user_id !== actor.id) throw unauthorized('绑定状态无效，请重新发起绑定');
    await linkOAuthAccount(c.env, actor.id, 'github', subject, email);
    return c.redirect(withNotice(stateRow.return_to ?? '/', 'linked', 'github'));
  }

  const userId = await resolveOAuthLogin(c.env, 'github', subject);
  await issueOAuthSession(c, c.env, userId);
  return c.redirect(stateRow.return_to ?? '/');
}

function withNotice(returnTo: string, key: string, value: string): string {
  const url = new URL(returnTo, 'https://wfla.invalid');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/**
 * Bounces the user back to the forum with a readable reason instead of leaving
 * them on a bare JSON error page. Messages are already user-safe AppErrors.
 */
function failToSite(c: Context<{ Bindings: Env }>, error: unknown): Response {
  const message = error instanceof AppError
    ? error.message
    : 'GitHub 登录暂时不可用，请稍后重试';
  console.error(JSON.stringify({
    level: 'error',
    route: 'github.callback',
    message: error instanceof Error ? error.message : String(error)
  }));
  const url = new URL('https://wfla.invalid');
  url.searchParams.set('oauth_error', message);
  return c.redirect(`/${url.search}`);
}
