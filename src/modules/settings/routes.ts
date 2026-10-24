import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Env } from '../../env';
import { badRequest, forbidden } from '../../core/errors';
import { requireUser } from '../identity/session';
import { isOwner } from '../access/service';
import { enforceRateLimit } from '../identity/crypto';
import { insertAudit } from '../moderation/routes';
import {
  applyPreparedSettings,
  persistSettingUpdates,
  prepareSettingUpdate,
  readPublicSettings,
  type PreparedSettingUpdate,
  type SettingKey
} from './service';

const MAX_SECRET_LENGTH = 1000;
const MAX_CLIENT_ID_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const MAX_FORUM_NAME_LENGTH = 80;

const settingsPatchSchema = z.object({
  forum_name: z.string().trim().min(2).max(MAX_FORUM_NAME_LENGTH),
  public_origin: z.string().trim().max(MAX_URL_LENGTH),
  session_ttl_seconds: z.coerce.number().int().min(300).max(2_592_000),
  cookie_secure: z.boolean(),
  cookie_samesite: z.enum(['Lax', 'Strict']),
  trust_proxy_headers: z.boolean(),
  github_client_id: z.string().trim().max(MAX_CLIENT_ID_LENGTH),
  github_redirect_uri: z.string().trim().max(MAX_URL_LENGTH),
  github_client_secret: z.string().max(MAX_SECRET_LENGTH).optional(),
  clear_github_client_secret: z.boolean().optional(),
  microsoft_client_id: z.string().trim().max(MAX_CLIENT_ID_LENGTH),
  microsoft_redirect_uri: z.string().trim().max(MAX_URL_LENGTH),
  microsoft_client_secret: z.string().max(MAX_SECRET_LENGTH).optional(),
  clear_microsoft_client_secret: z.boolean().optional(),
  confirm_password: z.string().min(1).max(128)
});

type SettingsPatch = z.infer<typeof settingsPatchSchema>;

function normalizeAbsoluteUrl(value: string, fieldLabel: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest(`${fieldLabel}必须是完整的 http(s) 地址`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest(`${fieldLabel}仅支持 http 或 https`);
  if (url.username || url.password) throw badRequest(`${fieldLabel}不能包含用户名或密码`);
  if (url.search || url.hash) throw badRequest(`${fieldLabel}不能包含查询参数或锚点`);
  return url.toString().replace(/\/$/, '');
}

function normalizePublicOrigin(value: string): string {
  const normalized = normalizeAbsoluteUrl(value, '站点公开地址');
  const url = new URL(normalized);
  if (url.pathname !== '/') throw badRequest('站点公开地址只能填写到域名和端口，不能带路径');
  return url.origin;
}

function normalizeRedirectUri(value: string, provider: 'GitHub' | 'Microsoft'): string {
  if (!value) return '';
  const normalized = normalizeAbsoluteUrl(value, `${provider} 回调地址`);
  const url = new URL(normalized);
  if (url.pathname !== `/api/v1/auth/${provider.toLowerCase()}/callback`) {
    throw badRequest(`${provider} 回调地址路径必须是 /api/v1/auth/${provider.toLowerCase()}/callback`);
  }
  return normalized;
}

function ensureSameOrigin(publicOrigin: string, redirectUri: string, provider: 'GitHub' | 'Microsoft'): void {
  if (!redirectUri) return;
  if (new URL(publicOrigin).origin !== new URL(redirectUri).origin) {
    throw badRequest(`${provider} 回调地址必须与站点公开地址使用相同协议、域名和端口`);
  }
}

function parseSettings(body: unknown): SettingsPatch {
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(first?.message ?? '高级设置格式无效');
  }
  return parsed.data;
}

async function requestOwner(c: Parameters<typeof requireUser>[0]) {
  const actor = await requireUser(c);
  if (!isOwner(actor.role)) throw forbidden('只有论坛所有者可以修改高级设置');
  return actor;
}

async function verifyOwnerPassword(env: Env, userId: string, password: string): Promise<void> {
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ? AND role = \'owner\' AND status = \'active\'')
    .bind(userId).first<{ password_hash: string }>();
  if (!row || !(await bcrypt.compare(password, row.password_hash))) throw forbidden('当前密码不正确');
}

function prepareSecret(
  key: 'github_client_secret' | 'microsoft_client_secret',
  submitted: string | undefined,
  clear: boolean | undefined,
  currentlyConfigured: boolean
): string | undefined {
  if (clear) return '';
  const value = submitted ?? '';
  if (!value.trim()) return currentlyConfigured ? undefined : '';
  return value;
}

export const settingsRoutes = new Hono<{ Bindings: Env }>();

settingsRoutes.get('/admin/settings', async c => {
  await requestOwner(c);
  return c.json({ settings: await readPublicSettings(c.env) });
});

settingsRoutes.patch('/admin/settings', async c => {
  const actor = await requestOwner(c);
  const body = parseSettings(await c.req.json().catch(() => null));
  await enforceRateLimit(`admin-settings:${actor.id}`);

  const publicOrigin = normalizePublicOrigin(body.public_origin);
  const githubRedirectUri = normalizeRedirectUri(body.github_redirect_uri, 'GitHub');
  const microsoftRedirectUri = normalizeRedirectUri(body.microsoft_redirect_uri, 'Microsoft');
  ensureSameOrigin(publicOrigin, githubRedirectUri, 'GitHub');
  ensureSameOrigin(publicOrigin, microsoftRedirectUri, 'Microsoft');

  if ((body.github_client_id && !githubRedirectUri) || (!body.github_client_id && githubRedirectUri)) {
    throw badRequest('GitHub Client ID 与回调地址必须同时填写或同时留空');
  }
  if ((body.microsoft_client_id && !microsoftRedirectUri) || (!body.microsoft_client_id && microsoftRedirectUri)) {
    throw badRequest('Microsoft Client ID 与回调地址必须同时填写或同时留空');
  }

  await verifyOwnerPassword(c.env, actor.id, body.confirm_password);

  const githubSecret = prepareSecret(
    'github_client_secret',
    body.github_client_secret,
    body.clear_github_client_secret,
    Boolean(c.env.GITHUB_CLIENT_SECRET)
  );
  const microsoftSecret = prepareSecret(
    'microsoft_client_secret',
    body.microsoft_client_secret,
    body.clear_microsoft_client_secret,
    Boolean(c.env.MS_CLIENT_SECRET)
  );

  const githubSecretConfigured = githubSecret !== undefined ? githubSecret !== '' : Boolean(c.env.GITHUB_CLIENT_SECRET);
  const microsoftSecretConfigured = microsoftSecret !== undefined ? microsoftSecret !== '' : Boolean(c.env.MS_CLIENT_SECRET);
  const githubParts = [Boolean(body.github_client_id), githubSecretConfigured, Boolean(githubRedirectUri)];
  const microsoftParts = [Boolean(body.microsoft_client_id), microsoftSecretConfigured, Boolean(microsoftRedirectUri)];
  if (githubParts.some(Boolean) && !githubParts.every(Boolean)) {
    throw badRequest('GitHub 登录必须同时配置 Client ID、Client Secret 和回调地址，或三项全部留空');
  }
  if (microsoftParts.some(Boolean) && !microsoftParts.every(Boolean)) {
    throw badRequest('Microsoft 登录必须同时配置 Client ID、Client Secret 和回调地址，或三项全部留空');
  }

  const values: Record<SettingKey, string> = {
    forum_name: body.forum_name,
    public_origin: publicOrigin,
    session_ttl_seconds: String(body.session_ttl_seconds),
    cookie_secure: String(body.cookie_secure),
    cookie_samesite: body.cookie_samesite,
    trust_proxy_headers: String(body.trust_proxy_headers),
    github_client_id: body.github_client_id,
    github_client_secret: githubSecret ?? '__KEEP__',
    github_redirect_uri: githubRedirectUri,
    microsoft_client_id: body.microsoft_client_id,
    microsoft_client_secret: microsoftSecret ?? '__KEEP__',
    microsoft_redirect_uri: microsoftRedirectUri
  };

  const updates: PreparedSettingUpdate[] = [];
  const changedFields: string[] = [];
  for (const [key, value] of Object.entries(values) as [SettingKey, string][]) {
    const keepSecret = value === '__KEEP__';
    if (keepSecret) continue;
    updates.push(await prepareSettingUpdate(c.env, key, value));
    changedFields.push(key);
  }

  if (updates.length === 0) throw badRequest('没有检测到需要保存的修改');
  await persistSettingUpdates(c.env, updates, actor.id);
  applyPreparedSettings(c.env, updates);
  await insertAudit(c.env, actor.id, 'settings.update', 'app_settings', 'runtime', '通过管理后台修改高级设置', {
    changed_fields: changedFields,
    secrets_rotated: [
      ...(githubSecret !== undefined ? ['github_client_secret'] : []),
      ...(microsoftSecret !== undefined ? ['microsoft_client_secret'] : [])
    ]
  });

  return c.json({
    settings: await readPublicSettings(c.env),
    changed_fields: changedFields,
    applied: 'immediate'
  });
});