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
    '0013_moderation_automation.sql', '0014_chat.sql'
  ];
  for (const file of files) {
    const sql = readFileSync(`src/migrations/${file}`, 'utf8');
    const withoutComments = sql.replace(/^\s*--.*$/gm, '');
    for (const statement of withoutComments
      .split(/;\s*(?:\r?\n|$)/)
      .map(value => value.trim())
      .filter(value => value && !/^PRAGMA\b/i.test(value))) {
      try {
        await env.DB.prepare(statement).run();
      } catch (error) {
        if (!String(error).includes('already exists')) throw error;
      }
    }
  }
}

async function user(id: string, username: string, role: Role, status: UserStatus = 'active'): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, username, bcrypt.hashSync('TestPass1!', 4), `${id}-姓名`, '2026', role, status, now, now).run();
  const token = `chat-token-${id}`;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256(token), id, new Date(Date.now() + 3_600_000).toISOString(), now).run();
  return token;
}

function cookie(token: string) {
  return { Cookie: `wfla_session=${token}` };
}

function json() {
  return { 'Content-Type': 'application/json' };
}

async function post<T>(path: string, body: unknown, token: string): Promise<{ status: number; body: T }> {
  const response = await app.request(`/api/v1${path}`, {
    method: 'POST',
    headers: { ...cookie(token), ...json() },
    body: JSON.stringify(body)
  }, env);
  return { status: response.status, body: await response.json() as T };
}

async function patch<T>(path: string, body: unknown, token: string): Promise<{ status: number; body: T }> {
  const response = await app.request(`/api/v1${path}`, {
    method: 'PATCH',
    headers: { ...cookie(token), ...json() },
    body: JSON.stringify(body)
  }, env);
  return { status: response.status, body: await response.json() as T };
}

async function del<T>(path: string, token: string): Promise<{ status: number; body: T }> {
  const response = await app.request(`/api/v1${path}`, {
    method: 'DELETE',
    headers: cookie(token)
  }, env);
  return { status: response.status, body: await response.json() as T };
}

async function get<T>(path: string, token?: string): Promise<{ status: number; body: T }> {
  const response = await app.request(`/api/v1${path}`, {
    headers: token ? cookie(token) : {}
  }, env);
  return { status: response.status, body: await response.json() as T };
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  unread_count: number;
  blocked_by_me: boolean;
  blocked_me: boolean;
  counterpart?: { id: string } | null;
  last_message?: { id: string; content_markdown: string } | null;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  content_markdown: string;
  content_html: string;
  status: string;
  created_at: string;
  deleted_at?: string | null;
  sender?: { id: string; real_name: string; status: string } | null;
}

beforeEach(async () => {
  ({ env, mf } = await createTestEnv());
  await migrate();
});
afterEach(async () => await mf.dispose());

describe('direct chat', () => {
  it('creates one unique direct conversation and sends idempotently', async () => {
    const a = await user('chat-user-a', 'chat-user-a', 'member');
    const b = await user('chat-user-b', 'chat-user-b', 'member');
    const first = await post<{ item: Conversation }>('/conversations/direct', { user_id: 'chat-user-b' }, a);
    expect(first.status).toBe(201);
    const second = await post<{ item: Conversation }>('/conversations/direct', { user_id: 'chat-user-a' }, b);
    expect(second.status).toBe(201);
    expect(second.body.item.id).toBe(first.body.item.id);
    expect(first.body.item.type).toBe('direct');

    const sent1 = await post<{ item: Message }>('/conversations/direct', {}, a);
    expect(sent1.status).toBe(422);
    const sent = await post<{ item: Message }>(`/conversations/${first.body.item.id}/messages`, {
      client_id: 'client-1', content: '你好 **WFLA**'
    }, a);
    expect(sent.status).toBe(201);
    expect(sent.body.item.content_html).toContain('WFLA');
    const retry = await post<{ item: Message }>(`/conversations/${first.body.item.id}/messages`, {
      client_id: 'client-1', content: '你好 **WFLA**'
    }, a);
    expect(retry.status).toBe(201);
    expect(retry.body.item.id).toBe(sent.body.item.id);
    expect(retry.body.item.client_id).toBe('client-1');

    const list = await get<{ items: Conversation[] }>('/conversations?type=direct', b);
    expect(list.status).toBe(200);
    expect(list.body.items[0]?.id).toBe(first.body.item.id);
    expect(list.body.items[0]?.unread_count).toBe(1);
    expect(list.body.items[0]?.last_message?.content_markdown).toBe('你好 **WFLA**');

    const read = await post<{ item: Conversation }>(`/conversations/${first.body.item.id}/read`, {
      message_id: sent.body.item.id
    }, b);
    expect(read.status).toBe(200);
    expect(read.body.item.unread_count).toBe(0);
  });

  it('enforces blocking, IDOR and account-state rules', async () => {
    const a = await user('chat-user-c', 'chat-user-c', 'member');
    const b = await user('chat-user-d', 'chat-user-d', 'member');
    const outsider = await user('chat-user-e', 'chat-user-e', 'member');
    const conversation = await post<{ item: Conversation }>('/conversations/direct', { user_id: 'chat-user-d' }, a);
    expect(conversation.status).toBe(201);
    const block = await post('/users/chat-user-c/block', {}, b);
    expect(block.status).toBe(201);
    const id = conversation.body.item.id;

    const blockedForA = await get<{ items: Conversation[] }>('/conversations?type=direct', a);
    const blockedForB = await get<{ items: Conversation[] }>('/conversations?type=direct', b);
    expect(blockedForA.body.items[0]).toMatchObject({ blocked_by_me: false, blocked_me: true });
    expect(blockedForB.body.items[0]).toMatchObject({ blocked_by_me: true, blocked_me: false });

    const blockedCreate = await post('/conversations/direct', { user_id: 'chat-user-d' }, a);
    expect(blockedCreate.status).toBe(403);
    const blockedSend = await post(`/conversations/${id}/messages`, { client_id: 'x', content: 'no' }, a);
    expect(blockedSend.status).toBe(403);
    const outsiderRead = await get(`/conversations/${id}/messages`, outsider);
    expect(outsiderRead.status).toBe(403);

    const unblock = await del('/users/chat-user-c/block', b);
    expect(unblock.status).toBe(200);
    const unblockedForB = await get<{ items: Conversation[] }>('/conversations?type=direct', b);
    expect(unblockedForB.body.items[0]).toMatchObject({ blocked_by_me: false, blocked_me: false });
    const send = await post<{ item: Message }>(`/conversations/${id}/messages`, { client_id: 'x', content: 'yes' }, b);
    expect(send.status).toBe(201);

    await env.DB.prepare(`UPDATE users SET status = 'muted' WHERE id = 'chat-user-c'`).run();
    const muted = await post(`/conversations/${id}/messages`, { client_id: 'muted', content: 'no' }, a);
    expect(muted.status).toBe(403);
  });
});

describe('administrator-managed group chat', () => {
  it('lets admins manage groups and members, while ordinary users stay read/write members', async () => {
    const owner = await user('group-owner', 'group-owner', 'owner');
    const admin = await user('group-admin', 'group-admin', 'admin');
    const member = await user('group-member', 'group-member', 'member');
    const other = await user('group-other', 'group-other', 'member');
    const created = await post<{ item: { id: string } }>('/admin/chat/groups', {
      name: '测试群', description: '测试', owner_user_id: 'group-member'
    }, admin);
    expect(created.status).toBe(201);
    const id = created.body.item.id;
    const forbiddenCreate = await post('/admin/chat/groups', { name: '无权' }, member);
    expect(forbiddenCreate.status).toBe(403);

    const add = await post(`/admin/chat/groups/${id}/members`, { user_id: 'group-other' }, owner);
    expect(add.status).toBe(200);
    const forbiddenAdd = await post(`/admin/chat/groups/${id}/members`, { user_id: 'group-other' }, member);
    expect(forbiddenAdd.status).toBe(403);

    const sent = await post<{ item: Message }>(`/conversations/${id}/messages`, {
      client_id: 'group-message', content: '群聊测试'
    }, member);
    expect(sent.status).toBe(201);

    const history = await get<{ items: Message[] }>(`/conversations/${id}/messages`, other);
    expect(history.status).toBe(200);
    expect(history.body.items[0]?.sender?.id).toBe('group-member');

    const left = await del(`/conversations/${id}/membership`, other);
    expect(left.status).toBe(200);
    const deniedHistory = await get(`/conversations/${id}/messages`, other);
    expect(deniedHistory.status).toBe(403);

    const readd = await post(`/admin/chat/groups/${id}/members`, { user_id: 'group-other' }, owner);
    expect(readd.status).toBe(200);
    const restoredHistory = await get(`/conversations/${id}/messages`, other);
    expect(restoredHistory.status).toBe(200);

    const removed = await del(`/admin/chat/groups/${id}/members/group-other`, owner);
    expect(removed.status).toBe(200);
    const removedHistory = await get(`/conversations/${id}/messages`, other);
    expect(removedHistory.status).toBe(403);

    const updated = await patch(`/admin/chat/groups/${id}`, { name: '更新群名' }, admin);
    expect(updated.status).toBe(200);
    const deleted = await del(`/admin/chat/groups/${id}`, admin);
    expect(deleted.status).toBe(200);
    const deletedHistory = await get(`/conversations/${id}/messages`, member);
    expect(deletedHistory.status).toBe(404);
  });

  it('supports pagination, deletion tombstones, reports and audited context', async () => {
    const admin = await user('context-admin', 'context-admin', 'admin');
    const a = await user('context-user-a', 'context-user-a', 'member');
    const b = await user('context-user-b', 'context-user-b', 'member');
    const outsider = await user('context-outsider', 'context-outsider', 'member');
    const conversation = await post<{ item: Conversation }>('/conversations/direct', { user_id: 'context-user-b' }, a);
    const id = conversation.body.item.id;
    const ids: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const result = await post<{ item: Message }>(`/conversations/${id}/messages`, {
        client_id: `message-${i}`, content: `消息${i}`
      }, i % 2 ? a : b);
      expect(result.status).toBe(201);
      ids.push(result.body.item.id);
    }

    const firstPage = await get<{ items: Message[]; next_cursor: string | null }>(`/conversations/${id}/messages?limit=5`, a);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(5);
    expect(firstPage.body.next_cursor).toBeTruthy();
    const secondPage = await get<{ items: Message[] }>(`/conversations/${id}/messages?limit=5&before=${firstPage.body.next_cursor}`, a);
    expect(secondPage.body.items).toHaveLength(5);

    const afterCursor = ids[ids.length - 2];
    const after = await get<{ items: Message[] }>(`/conversations/${id}/messages?after=${afterCursor}&limit=5`, a);
    expect(after.status).toBe(200);
    expect(after.body.items.map(item => item.id)).toEqual([ids[ids.length - 1]]);

    const deleted = await del<{ item: Message }>(`/messages/${ids[0]}`, a);
    expect(deleted.status).toBe(200);
    expect(deleted.body.item.status).toBe('deleted');
    const deleteAgain = await del(`/messages/${ids[0]}`, a);
    expect(deleteAgain.status).toBe(200);

    const outsiderReport = await post('/reports', {
      target_type: 'message', target_id: ids[1], reason: '非成员举报'
    }, outsider);
    expect(outsiderReport.status).toBe(400);
    const report = await post<{ item: { id: string } }>('/reports', {
      target_type: 'message', target_id: ids[5], reason: '违规消息测试', details: ''
    }, b);
    expect(report.status).toBe(201);

    const detail = await get<{
      item: {
        target_message: Message;
        message_context: Message[];
      };
    }>(`/reports/${report.body.item.id}`, admin);
    expect(detail.status).toBe(200);
    expect(detail.body.item.target_message.id).toBe(ids[5]);
    expect(detail.body.item.message_context.map(item => item.id)).toEqual(ids);
    expect(detail.body.item.message_context).toHaveLength(12);
    const audit = await env.DB.prepare(
      `SELECT id FROM audit_logs WHERE action = 'chat.report_context_access' AND target_id = ?`
    ).bind(report.body.item.id).first<{ id: string }>();
    expect(audit?.id).toBeTruthy();

    const adminMessages = await get<{ items: Message[] }>(`/admin/chat/groups/${id}/messages`, admin);
    expect(adminMessages.status).toBe(404);
  });
});
