import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env, Role } from '../src/env';
import { sha256 } from '../src/modules/identity/session';
import { applyStoredSettings } from '../src/modules/settings/service';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

async function migrate() {
  const schema = readFileSync('src/migrations/0001_init.sql', 'utf8');
  const settings = readFileSync('src/migrations/0006_app_settings.sql', 'utf8');
  const enrollment = readFileSync('src/migrations/0011_enrollment_year.sql', 'utf8');
  for (const statement of (schema + '\n' + settings + '\n' + enrollment)
    .split(';')
    .map(value => value.replace(/^\s*--.*$/gm, '').trim())
    .filter(value => value && !/^PRAGMA\b/i.test(value))) {
    await env.DB.prepare(statement).run();
  }
}

async function createSessionUser(id: string, username: string, role: Role, password: string): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, username, bcrypt.hashSync(password, 4), '测试用户', '2026', role, 'active', now, now).run();
  const token = 'token-' + id;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256(token), id, new Date(Date.now() + 3_600_000).toISOString(), now).run();
  return token;
}

function cookie(token: string) {
  return 'wfla_session=' + token;
}

function settingsPayload(overrides: Record<string, unknown> = {}) {
  return {
    forum_name: '测试论坛',
    public_origin: 'http://example.test',
    session_ttl_seconds: 3600,
    cookie_secure: false,
    cookie_samesite: 'Lax',
    trust_proxy_headers: false,
    github_client_id: 'github-client-id',
    github_client_secret: 'github-secret-value',
    github_redirect_uri: 'http://example.test/api/v1/auth/github/callback',
    microsoft_client_id: '',
    microsoft_redirect_uri: '',
    confirm_password: 'OwnerPass1!',
    ...overrides
  };
}

beforeEach(async () => {
  const testEnv = await createTestEnv();
  env = testEnv.env;
  mf = testEnv.mf;
  await migrate();
});

afterEach(async () => {
  await mf.dispose();
});

describe('advanced settings', () => {
  it('requires an owner session and the current owner password', async () => {
    const ownerToken = await createSessionUser('owner-1', 'owner', 'owner', 'OwnerPass1!');
    const adminToken = await createSessionUser('admin-1', 'admin', 'admin', 'AdminPass1!');

    const adminRead = await app.request('/api/v1/admin/settings', { headers: { Cookie: cookie(adminToken) } }, env);
    expect(adminRead.status).toBe(403);

    const wrongPassword = await app.request('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { Cookie: cookie(ownerToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload({ confirm_password: 'WrongPass1!' }))
    }, env);
    expect(wrongPassword.status).toBe(403);

    const saved = await app.request('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { Cookie: cookie(ownerToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload())
    }, env);
    expect(saved.status).toBe(200);
    const body = await saved.json() as { settings: { forum_name: string; github_client_secret_configured: boolean } };
    expect(body.settings.forum_name).toBe('测试论坛');
    expect(body.settings.github_client_secret_configured).toBe(true);
  });

  it('stores OAuth secrets encrypted and restores them after startup', async () => {
    const token = await createSessionUser('owner-2', 'owner2', 'owner', 'OwnerPass1!');
    const saved = await app.request('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload())
    }, env);
    expect(saved.status).toBe(200);

    const row = await env.DB.prepare("SELECT value, is_secret FROM app_settings WHERE key = 'github_client_secret'")
      .first<{ value: string; is_secret: number }>();
    expect(row?.is_secret).toBe(1);
    expect(row?.value).not.toContain('github-secret-value');

    env.GITHUB_CLIENT_ID = '';
    env.GITHUB_CLIENT_SECRET = '';
    env.GITHUB_REDIRECT_URI = '';
    env.FORUM_NAME = '旧名称';
    await applyStoredSettings(env);
    expect(env.GITHUB_CLIENT_ID).toBe('github-client-id');
    expect(env.GITHUB_CLIENT_SECRET).toBe('github-secret-value');
    expect(env.GITHUB_REDIRECT_URI).toBe('http://example.test/api/v1/auth/github/callback');
    expect(env.FORUM_NAME).toBe('测试论坛');
  });

  it('rejects a partially configured OAuth provider', async () => {
    const token = await createSessionUser('owner-3', 'owner3', 'owner', 'OwnerPass1!');
    const response = await app.request('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload({ github_client_secret: undefined }))
    }, env);
    expect(response.status).toBe(400);
  });
});
