import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { createTestEnv } from './test-env';

let env: Env;
let mf: Awaited<ReturnType<typeof createTestEnv>>['mf'];

beforeEach(async () => {
  ({ env, mf } = await createTestEnv());
  const schema = readFileSync('src/migrations/0001_init.sql', 'utf8');
  const engagement = readFileSync('src/migrations/0004_engagement.sql', 'utf8');
  const enrollment = readFileSync('src/migrations/0011_enrollment_year.sql', 'utf8');
  for (const statement of (schema + ';' + engagement + ';' + enrollment).split(';').map(value => value.replace(/^\s*--.*$/gm, '').trim()).filter(value => value && !/^PRAGMA\b/i.test(value))) {
    await env.DB.prepare(statement).run();
  }
  const time = '2026-10-25T00:00:00.000Z';
  await env.DB.prepare('INSERT INTO users (id, username, password_hash, real_name, enrollment_year, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('author', 'author', 'hash', '测试同学', '2026', 'member', 'active', time, time).run();
  for (const [id, active] of [['board-a', 1], ['board-b', 0]] as const) {
    await env.DB.prepare('INSERT INTO boards (id, slug, name, description, position, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, id, id, '', 0, active, time, time).run();
  }
  for (const [id, board, status, created] of [
    ['thread-a', 'board-a', 'published', '2026-10-25T01:00:00.000Z'],
    ['thread-b', 'board-a', 'published', '2026-10-25T02:00:00.000Z'],
    ['thread-hidden', 'board-a', 'hidden', '2026-10-25T03:00:00.000Z'],
    ['thread-inactive', 'board-b', 'published', '2026-10-25T04:00:00.000Z']
  ]) {
    await env.DB.prepare('INSERT INTO threads (id, board_id, author_id, title, slug, status, is_pinned, view_count, reply_count, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)')
      .bind(id, board, 'author', id, id, status, created, created, created).run();
    await env.DB.prepare('INSERT INTO posts (id, thread_id, author_id, parent_post_id, content_markdown, content_html, status, edit_count, floor_number, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, 0, 1, ?, ?)')
      .bind(`post-${id}`, id, 'author', 'hello', '<p>hello</p>', 'published', created, created).run();
  }
  await env.DB.prepare("INSERT INTO reactions (id, user_id, target_type, target_id, reaction, created_at) VALUES (?, ?, 'thread', ?, 'like', ?)")
    .bind('reaction-thread-b', 'author', 'thread-b', time).run();
});

afterEach(async () => { await mf.dispose(); });

describe('public feed', () => {
  it('returns only published threads from active boards with stable pagination', async () => {
    const first = await app.request('/api/v1/feed?limit=1', {}, env);
    expect(first.status).toBe(200);
    const firstPage = await first.json() as { items: { id: string; board: { slug: string }; preview_html: string; like_count: number }[]; next_cursor: string | null };
    expect(firstPage.items.map(item => item.id)).toEqual(['thread-b']);
    expect(firstPage.items[0]?.board.slug).toBe('board-a');
    expect(firstPage.items[0]?.preview_html).toBe('<p>hello</p>');
    expect(firstPage.items[0]?.like_count).toBe(1);
    expect(firstPage.next_cursor).toBe('thread-b');

    const second = await app.request(`/api/v1/feed?limit=1&cursor=${firstPage.next_cursor}`, {}, env);
    expect(second.status).toBe(200);
    const secondPage = await second.json() as { items: { id: string; like_count: number }[]; next_cursor: string | null };
    expect(secondPage.items.map(item => item.id)).toEqual(['thread-a']);
    expect(secondPage.items[0]?.like_count).toBe(0);
    expect(secondPage.next_cursor).toBeNull();
  });

  it('rejects invalid pagination input', async () => {
    expect((await app.request('/api/v1/feed?limit=0', {}, env)).status).toBe(400);
    expect((await app.request('/api/v1/feed?cursor=not%20valid', {}, env)).status).toBe(400);
  });
});
