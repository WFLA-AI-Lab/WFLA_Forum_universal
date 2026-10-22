import { Hono } from 'hono';
import type { Env } from '../../env';
import { AppError, badRequest, notFound } from '../../core/errors';
import { createId, nowIso } from '../../core/utils';
import { requireUser } from '../identity/session';
import { isAdmin, requireRole } from '../access/service';
import { renderMarkdown } from './markdown';
import { titleSchema, contentSchema } from '../../core/validation';

interface BoardRow { id: string; slug: string; name: string; description: string; position: number; is_active: number; created_at: string; updated_at: string }
interface ThreadRow {
  id: string; board_id: string; author_id: string; title: string; slug: string; status: string;
  is_pinned: number; view_count: number; reply_count: number; last_activity_at: string; created_at: string; updated_at: string;
  author_username?: string; author_real_name?: string; author_graduation_year?: string; author_role?: string;
}

function boardJson(row: BoardRow) {
  return { ...row, is_active: row.is_active === 1 };
}
function threadJson(row: ThreadRow) {
  return {
    ...row,
    is_pinned: row.is_pinned === 1,
    author: row.author_username ? {
      id: row.author_id, username: row.author_username, real_name: row.author_real_name,
      graduation_year: row.author_graduation_year, role: row.author_role
    } : undefined
  };
}

export const contentRoutes = new Hono<{ Bindings: Env }>();

contentRoutes.get('/boards', async c => {
  const rows = await c.env.DB.prepare(
    'SELECT id, slug, name, description, position, is_active, created_at, updated_at FROM boards WHERE is_active = 1 ORDER BY position, name'
  ).all<BoardRow>();
  return c.json({ items: (rows.results ?? []).map(boardJson) });
});

contentRoutes.post('/boards', async c => {
  const actor = await requireUser(c);
  requireRole(actor.role, 'admin');
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? '').trim();
  const slug = String(body?.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const description = String(body?.description ?? '').slice(0, 500);
  if (name.length < 2 || name.length > 40 || !/^[a-z0-9-]{2,40}$/.test(slug)) throw badRequest('板块名称或 slug 无效');
  const existing = await c.env.DB.prepare('SELECT 1 FROM boards WHERE slug = ?').bind(slug).first();
  if (existing) throw new AppError('CONFLICT', 'slug 已存在');
  const id = createId();
  await c.env.DB.prepare(
    'INSERT INTO boards (id, slug, name, description, position, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).bind(id, slug, name, description, Number(body?.position ?? 0), nowIso(), nowIso()).run();
  return c.json({ item: { id, slug, name, description, position: Number(body?.position ?? 0), is_active: true } }, 201);
});

contentRoutes.get('/boards/:slug/threads', async c => {
  const slug = c.req.param('slug');
  const board = await c.env.DB.prepare('SELECT id FROM boards WHERE slug = ? AND is_active = 1').bind(slug).first<{ id: string }>();
  if (!board) throw notFound('板块不存在');
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 50);
  const cursor = c.req.query('cursor');
  const rows = await c.env.DB.prepare(
    `SELECT t.*, u.username AS author_username, u.real_name AS author_real_name, u.graduation_year AS author_graduation_year, u.role AS author_role
       FROM threads t JOIN users u ON u.id = t.author_id
      WHERE t.board_id = ? AND t.status = 'published' AND (? IS NULL OR t.id < ?)
      ORDER BY t.is_pinned DESC, t.last_activity_at DESC, t.id DESC LIMIT ?`
  ).bind(board.id, cursor ?? null, cursor ?? null, limit + 1).all<ThreadRow>();
  const items = (rows.results ?? []).slice(0, limit).map(threadJson);
  const hasMore = (rows.results ?? []).length > limit;
  return c.json({ items, next_cursor: hasMore ? items[items.length - 1]?.id ?? null : null });
});

contentRoutes.post('/boards/:slug/threads', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'active') throw new AppError('FORBIDDEN', '当前账号状态不能发帖');
  const slug = c.req.param('slug');
  const board = await c.env.DB.prepare('SELECT id FROM boards WHERE slug = ? AND is_active = 1').bind(slug).first<{ id: string }>();
  if (!board) throw notFound('板块不存在');
  const body = await c.req.json().catch(() => null);
  const title = titleSchema.parse(body?.title);
  const content = contentSchema.parse(body?.content);
  const threadId = createId();
  const postId = createId();
  const timestamp = nowIso();
  const html = renderMarkdown(content);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO threads (id, board_id, author_id, title, slug, status, is_pinned, view_count, reply_count, last_activity_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'published', 0, 0, 0, ?, ?, ?)`
    ).bind(threadId, board.id, actor.id, title, `${threadId}-${slugifyTitle(title)}`, timestamp, timestamp, timestamp),
    c.env.DB.prepare(
      `INSERT INTO posts (id, thread_id, author_id, parent_post_id, content_markdown, content_html, status, edit_count, floor_number, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, 'published', 0, 1, ?, ?)`
    ).bind(postId, threadId, actor.id, content, html, timestamp, timestamp)
  ]);
  return c.json({ item: { id: threadId, post_id: postId, title, slug: `${threadId}-${slugifyTitle(title)}` } }, 201);
});

function slugifyTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^\p{Script=Han}a-z0-9]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'topic';
}

contentRoutes.get('/threads/:id', async c => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT t.*, u.username AS author_username, u.real_name AS author_real_name, u.graduation_year AS author_graduation_year, u.role AS author_role
       FROM threads t JOIN users u ON u.id = t.author_id WHERE t.id = ? AND t.status != 'deleted'`
  ).bind(id).first<ThreadRow>();
  if (!row) throw notFound('话题不存在');
  const posts = await c.env.DB.prepare(
    `SELECT p.*, u.username AS author_username, u.real_name AS author_real_name, u.graduation_year AS author_graduation_year, u.role AS author_role
       FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.thread_id = ? AND p.status != 'deleted' ORDER BY p.floor_number LIMIT 200`
  ).bind(id).all<ThreadRow & { content_markdown: string; content_html: string; floor_number: number }>();
  return c.json({
    item: threadJson(row),
    posts: (posts.results ?? []).map(post => ({
      ...post, author: {
        id: post.author_id, username: post.author_username, real_name: post.author_real_name,
        graduation_year: post.author_graduation_year, role: post.author_role
      }
    }))
  });
});

contentRoutes.post('/threads/:id/posts', async c => {
  const actor = await requireUser(c);
  if (actor.status !== 'active') throw new AppError('FORBIDDEN', '当前账号状态不能回复');
  const threadId = c.req.param('id');
  const thread = await c.env.DB.prepare(`SELECT id, status FROM threads WHERE id = ?`).bind(threadId).first<{ id: string; status: string }>();
  if (!thread || thread.status === 'deleted') throw notFound('话题不存在');
  if (thread.status === 'locked') throw new AppError('CONFLICT', '话题已锁定');
  if (thread.status === 'hidden') throw new AppError('FORBIDDEN', '话题已隐藏');
  const body = await c.req.json().catch(() => null);
  const content = contentSchema.parse(body?.content);
  const parentPostId = body?.parent_post_id ?? null;
  if (parentPostId !== null && typeof parentPostId !== 'string') throw badRequest('回复目标无效');
  if (parentPostId) {
    const parent = await c.env.DB.prepare('SELECT id, thread_id FROM posts WHERE id = ? AND thread_id = ?').bind(parentPostId, threadId).first();
    if (!parent) throw badRequest('回复目标不存在');
  }
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE thread_id = ? AND status != ?').bind(threadId, 'deleted').first<{ n: number }>();
  const floor = (count?.n ?? 0) + 1;
  const id = createId();
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO posts (id, thread_id, author_id, parent_post_id, content_markdown, content_html, status, edit_count, floor_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'published', 0, ?, ?, ?)`
  ).bind(id, threadId, actor.id, parentPostId, content, renderMarkdown(content), floor, timestamp, timestamp).run();
  await c.env.DB.prepare('UPDATE threads SET reply_count = reply_count + 1, last_activity_at = ?, updated_at = ? WHERE id = ?').bind(timestamp, timestamp, threadId).run();
  const threadAuthor = await c.env.DB.prepare('SELECT author_id, title FROM threads WHERE id = ?').bind(threadId).first<{ author_id: string; title: string }>();
  if (threadAuthor && threadAuthor.author_id !== actor.id) {
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, recipient_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(createId(), threadAuthor.author_id, 'reply', '你的话题有新回复', `${actor.realName} 回复了「${threadAuthor.title}」`, `/threads/${threadId}`, timestamp).run();
  }
  return c.json({ item: { id, floor_number: floor } }, 201);
});

contentRoutes.patch('/posts/:id', async c => {
  const actor = await requireUser(c);
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, author_id, status, edit_count FROM posts WHERE id = ?').bind(id).first<{ id: string; author_id: string; status: string; edit_count: number }>();
  if (!post || post.status === 'deleted') throw notFound('帖子不存在');
  if (post.author_id !== actor.id && !isAdmin(actor.role)) throw new AppError('FORBIDDEN', '只能编辑自己的帖子');
  const body = await c.req.json().catch(() => null);
  const content = contentSchema.parse(body?.content);
  await c.env.DB.prepare('UPDATE posts SET content_markdown = ?, content_html = ?, edit_count = edit_count + 1, updated_at = ? WHERE id = ?')
    .bind(content, renderMarkdown(content), nowIso(), id).run();
  return c.json({ success: true });
});

contentRoutes.delete('/posts/:id', async c => {
  const actor = await requireUser(c);
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT id, author_id FROM posts WHERE id = ?').bind(id).first<{ id: string; author_id: string }>();
  if (!post) throw notFound('帖子不存在');
  if (post.author_id !== actor.id && !isAdmin(actor.role)) throw new AppError('FORBIDDEN', '没有权限删除帖子');
  await c.env.DB.prepare(`UPDATE posts SET status = 'deleted', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  return c.json({ success: true });
});

contentRoutes.post('/threads/:id/view', async c => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE threads SET view_count = view_count + 1 WHERE id = ? AND status != ?').bind(id, 'deleted').run();
  return c.json({ success: true });
});
