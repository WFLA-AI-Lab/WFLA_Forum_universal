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

function requireGitHubConfig(env: Env): { clientId: string; redirectUri: string } {
  const clientId = env.GITHUB_CLIENT_ID;
  const redirectUri = env.GITHUB_REDIRECT_URI;
  if (!clientId || !redirectUri) throw badRequest('GitHub 登录尚未配置');
  return { clientId, redirectUri };
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

async function fetchPrimaryEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'WFLA-Wall'
    }
  });
  if (!res.ok) return null;
  const emails = await res.json() as GitHubEmail[];
  const primary = emails.find(item => item.primary && item.verified) ?? emails.find(item => item.verified);
  return primary?.email ?? null;
}

export const githubAuthRoutes = new Hono<{ Bindings: Env }>();

githubAuthRoutes.get('/auth/github/login', c => beginGitHubFlow(c, 'login'));
githubAuthRoutes.get('/auth/github/link', c => beginGitHubFlow(c, 'link'));

githubAuthRoutes.get('/auth/github/callback', async c => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) throw badRequest('回调参数缺失');
  const stateRow = await consumeOAuthState(c, 'github', state);

  const { clientId, redirectUri } = requireGitHubConfig(c.env);
  const clientSecret = c.env.GITHUB_CLIENT_SECRET;
  if (!clientSecret) throw badRequest('GitHub 登录尚未配置');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw unauthorized(`GitHub 登录失败：${tokenData.error_description ?? tokenData.error ?? '未知错误'}`);
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'WFLA-Wall'
    }
  });
  if (!userRes.ok) throw unauthorized('无法读取 GitHub 身份');
  const profile = await userRes.json() as GitHubUser;
  if (!profile.id) throw unauthorized('GitHub 返回的用户标识无效');
  const subject = String(profile.id);
  const email = profile.email ?? await fetchPrimaryEmail(tokenData.access_token);

  if (stateRow.mode === 'link') {
    const actor = await requireUser(c);
    if (!stateRow.user_id || stateRow.user_id !== actor.id) throw unauthorized('绑定状态无效，请重新发起绑定');
    await linkOAuthAccount(c.env, actor.id, 'github', subject, email);
    return c.redirect(stateRow.return_to ?? '/');
  }

  const userId = await resolveOAuthLogin(c.env, 'github', subject);
  await issueOAuthSession(c, c.env, userId);
  return c.redirect(stateRow.return_to ?? '/');
});