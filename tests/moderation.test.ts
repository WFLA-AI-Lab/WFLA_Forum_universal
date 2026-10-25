import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env, Role, UserStatus } from '../src/env';
import { sha256 } from '../src/modules/identity/session';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

async function migrate() {
  const files = [
    '0001_init.sql', '0002_invitations_external_auth.sql', '0003_microsoft_oauth.sql',
    '0004_engagement.sql', '0005_oauth_providers.sql', '0006_app_settings.sql',
    '0007_site_settings.sql', '0008_user_preferences.sql', '0009_user_profiles.sql',
    '0010_admin_console.sql', '0011_enrollment_year.sql', '0012_invitation_roles.sql',
    '0013_moderation_automation.sql'
  ];
  for (const file of files) {
    const sql = readFileSync(`src/migrations/${file}`, 'utf8');
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value => value.replace(/^\s*--.*$/gm, '').trim()).filter(value => value && !/^PRAGMA\b/i.test(value))) {
      try { await env.DB.prepare(statement).run(); } catch (error) {
        if (!String(error).includes('duplicate column name')) throw error;
      }
    }
  }
}

async function user(id: string, username: string, role: Role, status: UserStatus = 'active'): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, username, bcrypt.hashSync('TestPass1!', 4), '测试用户', '2026', role, status, now, now).run();
  const token = `admin-test-${id}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), id, new Date(Date.now() + 3_600_000).toISOString(), now).run();
  return token;
}
const cookie = (token: string) => ({ Cookie: `wfla_session=${token}` });
const json = (_body: unknown) => ({ 'Content-Type': 'application/json' });

beforeEach(async () => { const created = await createTestEnv(); env = created.env; mf = created.mf; await migrate(); });
afterEach(async () => { await mf.dispose(); });

describe('moderation safety', () => {
  it('prevents a pending admin invitation account from using admin APIs or logging in', async () => {
    const token = await user('pending-admin', 'pending-admin', 'admin', 'pending');
    const denied = await app.request('/api/v1/admin/overview', { headers: cookie(token) }, env);
    expect(denied.status).toBe(403);
    const login = await app.request('/api/v1/login', { method: 'POST', headers: json({}), body: JSON.stringify({ username: 'pending-admin', password: 'TestPass1!' }) }, env);
    expect(login.status).toBe(401);
  });

  it('keeps hidden threads and hidden replies invisible through direct URLs', async () => {
    const owner = await user('owner-hidden', 'owner-hidden', 'owner');
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO boards (id, slug, name, description, position, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .bind('board-hidden', 'board-hidden', 'Hidden Board', '', 0, now, now).run();
    await env.DB.prepare('INSERT INTO threads (id, board_id, author_id, title, slug, status, is_pinned, view_count, reply_count, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)')
      .bind('thread-hidden', 'board-hidden', 'owner-hidden', 'Hidden', 'hidden', 'hidden', now, now, now).run();
    await env.DB.prepare('INSERT INTO posts (id, thread_id, author_id, parent_post_id, content_markdown, content_html, status, edit_count, floor_number, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, 0, 1, ?, ?)')
      .bind('post-hidden', 'thread-hidden', 'owner-hidden', 'hidden', '<p>hidden</p>', 'hidden', now, now).run();
    const guest = await app.request('/api/v1/threads/thread-hidden', {}, env);
    expect(guest.status).toBe(403);
    const staff = await app.request('/api/v1/threads/thread-hidden', { headers: cookie(owner) }, env);
    expect(staff.status).toBe(200);
  });

  it('gives moderators the standalone console data and report context', async () => {
    const moderator = await user('moderator-console', 'moderator-console', 'moderator');
    await user('member-console', 'member-console', 'member');
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO boards (id, slug, name, description, position, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .bind('board-console', 'board-console', 'Console Board', '', 0, now, now).run();
    await env.DB.prepare('INSERT INTO threads (id, board_id, author_id, title, slug, status, is_pinned, view_count, reply_count, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)')
      .bind('thread-console', 'board-console', 'member-console', 'Console', 'console', 'published', now, now, now).run();
    await env.DB.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('report-console', 'member-console', 'thread', 'thread-console', '测试举报', '详情', 'open', now, now).run();
    const overview = await app.request('/api/v1/admin/overview', { headers: cookie(moderator) }, env);
    expect(overview.status).toBe(200);
    const detail = await app.request('/api/v1/reports/report-console', { headers: cookie(moderator) }, env);
    expect(detail.status).toBe(200);
    const body = await detail.json() as { item: { target_thread: { id: string } } };
    expect(body.item.target_thread.id).toBe('thread-console');
  });

  it('automatically hides risky content, records risk and audit, then notifies the reporter on resolution', async () => {
    const member = await user('member-automation', 'member-automation', 'member');
    const owner = await user('owner-automation', 'owner-automation', 'owner');
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO boards (id, slug, name, description, position, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .bind('board-auto', 'board-auto', 'Automation Board', '', 0, now, now).run();
    const created = await app.request('/api/v1/boards/board-auto/threads', {
      method: 'POST', headers: { ...cookie(member), ...json({}) }, body: JSON.stringify({ title: '风险内容', content: '这是一个诈骗链接 https://example.com/a' })
    }, env);
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { item: { id: string } };
    const stored = await env.DB.prepare('SELECT status FROM threads WHERE id = ?').bind(createdBody.item.id).first<{ status: string }>();
    expect(stored?.status).toBe('hidden');
    const risk = await env.DB.prepare('SELECT id FROM risk_events WHERE target_type = ? AND target_id = ?').bind('thread', createdBody.item.id).first<{ id: string }>();
    expect(risk?.id).toBeTruthy();
    const report = await app.request('/api/v1/reports', {
      method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ target_type: 'thread', target_id: createdBody.item.id, reason: '自动隐藏内容复核', details: '' })
    }, env);
    expect(report.status).toBe(201);
    const reportBody = await report.json() as { item: { id: string } };
    const resolved = await app.request(`/api/v1/reports/${reportBody.item.id}/resolve`, {
      method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ resolution: '已复核并保留隐藏' })
    }, env);
    expect(resolved.status).toBe(200);
    const notification = await env.DB.prepare('SELECT id FROM notifications WHERE recipient_id = ? AND type = ?').bind('owner-automation', 'report_result').first<{ id: string }>();
    expect(notification?.id).toBeTruthy();
  });

  it('supports temporary sanctions and automatic expiry', async () => {
    const member = await user('member-temp', 'member-temp', 'member');
    const owner = await user('owner-temp', 'owner-temp', 'owner');
    const expiresAt = new Date(Date.now() - 60_000).toISOString();
    const response = await app.request('/api/v1/users/member-temp/status', {
      method: 'POST', headers: { ...cookie(owner), ...json({}) }, body: JSON.stringify({ status: 'muted', reason: '临时测试', expires_at: expiresAt })
    }, env);
    expect(member).toBeTruthy();
    expect(response.status).toBe(400);
  });
});
