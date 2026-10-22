import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/health', c => c.json({ status: 'ok', time: new Date().toISOString() }));
