import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { sha256 } from '../src/modules/identity/session';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

async function migrate(file: string) {
  const sql = readFileSync(`src/migrations/${file}`, 'utf8').replace(/^\s*--.*$/gm, '');
  for (const statement of sql.split(';').map(value => value.trim()).filter(value => value && !/^PRAGMA\b/i.test(value))) {
    await env.DB.prepare(statement).run();
  }
}

async function memberSession(id = 'profile-user') {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, id, bcrypt.hashSync('Passw0rd!', 4), '测试同学', '2026', 'member', 'active', now, now).run();
  const token = `token-${id}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), id, new Date(Date.now() + 3_600_000).toISOString(), now).run();
  return `wfla_session=${token}`;
}

beforeEach(async () => {
  const testEnv = await createTestEnv();
  env = testEnv.env;
  mf = testEnv.mf;
  await migrate('0001_init.sql');
  await migrate('0009_user_profiles.sql');
  await migrate('0011_enrollment_year.sql');
});

afterEach(async () => mf.dispose());

describe('member profile', () => {
  it('requires authentication and defaults to the verified real name', async () => {
    expect((await app.request('/api/v1/me/profile', {}, env)).status).toBe(401);
    const cookie = await memberSession();
    const response = await app.request('/api/v1/me/profile', { headers: { Cookie: cookie } }, env);
    expect(response.status).toBe(200);
    expect((await response.json() as { profile: { nickname: string; avatar_data_url: null } }).profile)
      .toMatchObject({ nickname: '测试同学', avatar_data_url: null });
  });

  it('stores a nickname and a bounded image data URL', async () => {
    const cookie = await memberSession();
    const avatar = 'data:image/png;base64,iVBORw0KGgo=';
    const response = await app.request('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Test WFLAer', avatar_data_url: avatar })
    }, env);
    expect(response.status).toBe(200);
    expect((await response.json() as { profile: { nickname: string; avatar_data_url: string } }).profile)
      .toMatchObject({ nickname: 'Test WFLAer', avatar_data_url: avatar });
  });

  it('rejects unsupported avatar input', async () => {
    const cookie = await memberSession();
    const response = await app.request('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Tester', avatar_data_url: 'https://example.test/avatar.svg' })
    }, env);
    expect(response.status).toBe(400);
  });
});
