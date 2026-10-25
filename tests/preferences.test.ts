import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { SKIN_CONTRACT_VERSION } from '../src/version';
import type { Env, Role } from '../src/env';
import { sha256 } from '../src/modules/identity/session';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

/**
 * Applies only the migrations this suite needs. Splitting on ";" is enough for
 * these files (no semicolons inside string literals or triggers).
 */
async function migrate(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(`src/migrations/${file}`, 'utf8');
    // Strip line comments *before* splitting: a comment may itself contain ';'.
    const withoutComments = sql.replace(/^\s*--.*$/gm, '');
    for (const statement of withoutComments
      .split(';')
      .map(value => value.trim())
      .filter(value => value && !/^PRAGMA\b/i.test(value))) {
      await env.DB.prepare(statement).run();
    }
  }
}

async function createSessionUser(id: string, username: string, role: Role): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, graduation_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, username, bcrypt.hashSync('Passw0rd!', 4), '测试用户', '2029', role, 'active', now, now).run();
  const token = 'token-' + id;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256(token), id, new Date(Date.now() + 3_600_000).toISOString(), now).run();
  return token;
}

const cookie = (token: string) => 'wfla_session=' + token;

beforeEach(async () => {
  const testEnv = await createTestEnv();
  env = testEnv.env;
  mf = testEnv.mf;
  await migrate(['0001_init.sql', '0006_app_settings.sql', '0007_site_settings.sql', '0008_user_preferences.sql']);
});

afterEach(async () => {
  await mf.dispose();
});

describe('per-account preferences', () => {
  it('publishes the v2 skin contract for both bundled skins', async () => {
    const response = await app.request('/api/v1/site/config', {}, env);
    expect(response.status).toBe(200);
    const config = await response.json() as { skin_contract_version: number; skins: { id: string }[] };
    expect(SKIN_CONTRACT_VERSION).toBe(2);
    expect(config.skin_contract_version).toBe(2);
    expect(config.skins.map(skin => skin.id)).toEqual(expect.arrayContaining(['x', 'endfield']));
  });

  it('requires a session', async () => {
    const read = await app.request('/api/v1/me/preferences', {}, env);
    expect(read.status).toBe(401);
    const write = await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'x' })
    }, env);
    expect(write.status).toBe(401);
  });

  it('starts empty and stores a choice', async () => {
    const token = await createSessionUser('u1', 'member1', 'member');

    const empty = await app.request('/api/v1/me/preferences', { headers: { Cookie: cookie(token) } }, env);
    expect(empty.status).toBe(200);
    expect((await empty.json() as { preferences: { skin_id: string | null } }).preferences.skin_id).toBeNull();

    const saved = await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'endfield' })
    }, env);
    expect(saved.status).toBe(200);
    expect((await saved.json() as { preference: { skin_id: string } }).preference.skin_id).toBe('endfield');

    const after = await app.request('/api/v1/me/preferences', { headers: { Cookie: cookie(token) } }, env);
    expect((await after.json() as { preferences: { skin_id: string | null } }).preferences.skin_id).toBe('endfield');
  });

  it('is idempotent so the frontend can fire it on every switch', async () => {
    const token = await createSessionUser('u2', 'member2', 'member');
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/v1/me/preferences/skin', {
        method: 'PUT',
        headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ skin_id: 'x' })
      }, env);
      expect(res.status).toBe(200);
    }
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_preferences WHERE user_id = ?').bind('u2').first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('rejects unknown skins and ids the site does not offer', async () => {
    const token = await createSessionUser('u3', 'member3', 'member');

    const unknown = await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'neon-tokyo' })
    }, env);
    expect(unknown.status).toBe(400);

    // Narrow the site allow-list to x only; endfield must then be refused even
    // though the compiled-in registry still knows about it.
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES ('allowed_skins', 'x', 0, ?) ON CONFLICT(key) DO UPDATE SET value = 'x'"
    ).bind(now).run();

    const disallowed = await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'endfield' })
    }, env);
    expect(disallowed.status).toBe(400);

    const allowed = await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'x' })
    }, env);
    expect(allowed.status).toBe(200);
  });

  it('rejects malformed payloads', async () => {
    const token = await createSessionUser('u4', 'member4', 'member');
    for (const body of [undefined, {}, { skin_id: '' }, { skin_id: 'Bad ID' }, { skin_id: 123 }, { skin_id: 'x', extra: 1 }]) {
      const res = await app.request('/api/v1/me/preferences/skin', {
        method: 'PUT',
        headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, env);
      expect(res.status).toBe(400);
    }
  });

  it("keeps one user preference away from another", async () => {
    const a = await createSessionUser('a1', 'alice', 'member');
    const b = await createSessionUser('b1', 'bob', 'member');

    await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { Cookie: cookie(a), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'endfield' })
    }, env);

    const bob = await app.request('/api/v1/me/preferences', { headers: { Cookie: cookie(b) } }, env);
    expect((await bob.json() as { preferences: { skin_id: string | null } }).preferences.skin_id).toBeNull();
  });

  it('resolves the effective skin with the site default as fallback', async () => {
    const token = await createSessionUser('u5', 'member5', 'member');
    const before = await app.request('/api/v1/me/preferences/effective-skin?default=endfield', { headers: { Cookie: cookie(token) } }, env);
    expect((await before.json() as { skin_id: string }).skin_id).toBe('endfield');

    await app.request('/api/v1/me/preferences/skin', {
      method: 'PUT',
      headers: { Cookie: cookie(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_id: 'x' })
    }, env);
    const after = await app.request('/api/v1/me/preferences/effective-skin?default=endfield', { headers: { Cookie: cookie(token) } }, env);
    expect((await after.json() as { skin_id: string }).skin_id).toBe('x');
  });
});
