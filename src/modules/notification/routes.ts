import { Hono } from 'hono';
import type { Env } from '../../env';
import { requireUser } from '../identity/session';

export const notificationRoutes = new Hono<{ Bindings: Env }>();

notificationRoutes.get('/notifications', async c => {
  const actor = await requireUser(c);
  const rows = await c.env.DB.prepare(
    'SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(actor.id).all();
  return c.json({ items: rows.results ?? [] });
});

notificationRoutes.post('/notifications/read-all', async c => {
  const actor = await requireUser(c);
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?').bind(actor.id).run();
  return c.json({ success: true });
});

notificationRoutes.post('/notifications/:id/read', async c => {
  const actor = await requireUser(c);
  const result = await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').bind(c.req.param('id'), actor.id).run();
  return c.json({ success: result.success });
});
