import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env, Role } from '../src/env';
import { sha256 } from '../src/modules/identity/session';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

async function migrate() {
  const files = ['0001_init.sql', '0002_invitations_external_auth.sql', '0003_microsoft_oauth.sql', '0004_engagement.sql', '0005_oauth_providers.sql', '0006_app_settings.sql', '0007_site_settings.sql', '0008_user_preferences.sql', '0009_user_profiles.sql', '0010_admin_console.sql', '0011_enrollment_year.sql', '0012_invitation_roles.sql', '0013_moderation_automation.sql', '0014_chat.sql'];
  for (const file of files) {
    const sql = readFileSync(`src/migrations/${file}`, 'utf8');
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value => value.replace(/^\s*--.*$/gm, '').trim()).filter(value => value && !/^PRAGMA\b/i.test(value))) {
      try { await env.DB.prepare(statement).run(); } catch (error) {
        if (!String(error).includes('duplicate column name')) throw error;
      }
    }
  }
}

async function user(id: string, username: string, role: Role): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, username, bcrypt.hashSync('TestPass1!', 4), '测试用户', '2026', role, 'active', now, now).run();
  const token = `admin-test-${id}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), id, new Date(Date.now() + 3_600_000).toISOString(), now).run();
  return token;
}
const cookie = (token: string) => ({ Cookie: `wfla_session=${token}` });
const json = (_body: unknown) => ({ 'Content-Type': 'application/json' });

beforeEach(async () => { const created = await createTestEnv(); env = created.env; mf = created.mf; await migrate(); });
afterEach(async () => { await mf.dispose(); });

describe('admin hierarchy', () => {
  it('prevents an admin from creating or promoting to admin', async () => {
    const token = await user('admin-1', 'admin', 'admin');
    const create = await app.request('/api/v1/users', { method: 'POST', headers: { ...cookie(token), ...json({}) }, body: JSON.stringify({ username: 'peer', password: 'TestPass1!', real_name: '测试甲', enrollment_year: '2026', role: 'admin' }) }, env);
    expect(create.status).toBe(403);
    const memberToken = await user('member-1', 'member', 'member');
    const promote = await app.request('/api/v1/users/member-1/role', { method: 'POST', headers: { ...cookie(token), ...json({}) }, body: JSON.stringify({ role: 'admin', reason: 'test' }) }, env);
    expect(promote.status).toBe(403);
    const password = await app.request('/api/v1/users/admin-1/password', { method: 'POST', headers: { ...cookie(token), ...json({}) }, body: JSON.stringify({ password: 'OtherPass1!' }) }, env);
    expect(password.status).toBe(200);
    expect(memberToken).toBeTruthy();
  });

  it('allows owner to promote an admin and protects owner-only settings', async () => {
    const owner = await user('owner-1', 'owner', 'owner');
    const admin = await user('admin-1', 'admin', 'admin');
    const promote = await app.request('/api/v1/users/admin-1/role', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ role: 'admin', reason: 'owner test' }) }, env);
    expect(promote.status).toBe(200);
    const settings = await app.request('/api/v1/admin/settings', { headers: cookie(admin) }, env);
    expect(settings.status).toBe(403);
  });

  it('serves the aggregated admin overview only to admins', async () => {
    const admin = await user('admin-1', 'admin', 'admin');
    const member = await user('member-1', 'member', 'member');
    const allowed = await app.request('/api/v1/admin/overview', { headers: cookie(admin) }, env);
    expect(allowed.status).toBe(200);
    const denied = await app.request('/api/v1/admin/overview', { headers: cookie(member) }, env);
    expect(denied.status).toBe(403);
  });
});

describe('role-bearing invitations', () => {
  it('returns a readable validation error instead of HTTP 500 for invalid enrollment years', async () => {
    const response = await app.request('/api/v1/register', {
      method: 'POST',
      headers: json({}),
      body: JSON.stringify({
        invitation_code: 'a'.repeat(32),
        username: 'invalid-year',
        password: 'TestPass1!',
        real_name: '测试戊',
        enrollment_year: 1999
      })
    }, env);
    expect(response.status).toBe(422);
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('入学年份');
  });

  it('lets the owner issue admin invites and rejects admin-issued admin invites', async () => {
    const owner = await user('owner-invite', 'owner-invite', 'owner');
    const admin = await user('admin-invite', 'admin-invite', 'admin');
    const ownerInvite = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ role: 'admin', ttl_hours: 168 }) }, env);
    expect(ownerInvite.status).toBe(201);
    const ownerBody = await ownerInvite.json() as { item: { role: string } };
    expect(ownerBody.item.role).toBe('admin');
    const adminInvite = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(admin), ...json({}) }, body: JSON.stringify({ role: 'admin', ttl_hours: 168 }) }, env);
    expect(adminInvite.status).toBe(403);
    const moderatorInvite = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(admin), ...json({}) }, body: JSON.stringify({ role: 'moderator', ttl_hours: 168 }) }, env);
    expect(moderatorInvite.status).toBe(201);
  });

  it('registers pending with the invitation role and only lets an eligible admin activate it', async () => {
    const owner = await user('owner-activate', 'owner-activate', 'owner');
    const admin = await user('admin-activate', 'admin-activate', 'admin');
    const issued = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ role: 'admin', ttl_hours: 168 }) }, env);
    const issuedBody = await issued.json() as { item: { code: string } };
    const registered = await app.request('/api/v1/register', { method: 'POST', headers: json({}), body: JSON.stringify({ invitation_code: issuedBody.item.code, username: 'new-admin', password: 'TestPass1!', real_name: '测试乙', enrollment_year: 2026 }) }, env);
    expect(registered.status).toBe(201);
    const registeredBody = await registered.json() as { item: { id: string; role: string; status: string } };
    expect(registeredBody.item.role).toBe('admin');
    expect(registeredBody.item.status).toBe('pending');
    const denied = await app.request(`/api/v1/users/${registeredBody.item.id}/activate`, { method: 'POST', headers: cookie(admin) }, env);
    expect(denied.status).toBe(403);
    const approved = await app.request(`/api/v1/users/${registeredBody.item.id}/activate`, { method: 'POST', headers: cookie(owner) }, env);
    expect(approved.status).toBe(200);
    const row = await env.DB.prepare('SELECT role, status FROM users WHERE id = ?').bind(registeredBody.item.id).first<{ role: string; status: string }>();
    expect(row).toEqual({ role: 'admin', status: 'active' });
  });

  it('does not expose admin invitations to a regular admin', async () => {
    const owner = await user('owner-visibility', 'owner-visibility', 'owner');
    const admin = await user('admin-visibility', 'admin-visibility', 'admin');
    const adminInvite = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ role: 'admin', ttl_hours: 168 }) }, env);
    const moderatorInvite = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ role: 'moderator', ttl_hours: 168 }) }, env);
    expect(adminInvite.status).toBe(201);
    expect(moderatorInvite.status).toBe(201);
    const list = await app.request('/api/v1/invitations', { headers: cookie(admin) }, env);
    expect(list.status).toBe(200);
    const body = await list.json() as { items: { role: string }[] };
    expect(body.items.map(item => item.role)).toEqual(['moderator']);
    const ownerList = await app.request('/api/v1/invitations', { headers: cookie(owner) }, env);
    const ownerBody = await ownerList.json() as { items: { role: string }[] };
    expect(ownerBody.items.map(item => item.role)).toEqual(expect.arrayContaining(['admin', 'moderator']));
  });

  it('does not let the same invitation be consumed twice', async () => {
    const owner = await user('owner-single-use', 'owner-single-use', 'owner');
    const issued = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ role: 'member', ttl_hours: 168 }) }, env);
    const code = (await issued.json() as { item: { code: string } }).item.code;
    const first = await app.request('/api/v1/register', { method: 'POST', headers: json({}), body: JSON.stringify({ invitation_code: code, username: 'invite-first', password: 'TestPass1!', real_name: '测试丙', enrollment_year: '2026' }) }, env);
    const second = await app.request('/api/v1/register', { method: 'POST', headers: json({}), body: JSON.stringify({ invitation_code: code, username: 'invite-second', password: 'TestPass1!', real_name: '测试丁', enrollment_year: '2026' }) }, env);
    expect(first.status).toBe(201);
    expect(second.status).toBe(400);
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM users WHERE username IN (?, ?)').bind('invite-first', 'invite-second').first<{ total: number }>();
    expect(Number(count?.total)).toBe(1);
  });
  it('keeps legacy invitations as member invitations by default', async () => {
    const owner = await user('owner-default', 'owner-default', 'owner');
    const issued = await app.request('/api/v1/invitations', { method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ ttl_hours: 168 }) }, env);
    const body = await issued.json() as { item: { role: string } };
    expect(body.item.role).toBe('member');
  });
});
